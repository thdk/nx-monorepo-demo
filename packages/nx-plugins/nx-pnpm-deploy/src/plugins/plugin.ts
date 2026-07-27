import {
  CreateNodesContextV2,
  createNodesFromFiles,
  CreateNodesResult,
  CreateNodesV2,
  readJsonFile,
  type ProjectGraphProjectNode,
} from '@nx/devkit';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { findMatchingProjects } from 'nx/src/utils/find-matching-projects';

export interface NxPnpmDeployPluginOptions {
  /**
   * Name of the inferred target. Defaults to "prune" so it slots into Nx's
   * existing contract (docker:build.dependsOn = ["build", "prune"]).
   */
  targetName?: string;
  /**
   * Output directory relative to the project root. Defaults to "out" so it
   * sits alongside Nx's existing "out-tsc" pattern and is easy to gitignore.
   */
  outputDir?: string;
  /**
   * Restrict the target to only the projects matching any of these patterns.
   * When omitted (or empty), every workspace package (any project with a
   * package.json) is eligible. When set, a project must match at least one
   * pattern to get the target — this is the allowlist.
   *
   * Forwarded directly to Nx's findMatchingProjects, so it accepts the same
   * syntax as `nx run-many --projects=...`:
   *   - "app-1"                  (name)
   *   - "apps/nx-demo/*"         (directory glob)
   *   - "tag:deployable:docker"  (tag prefix)
   *   - "!apps/legacy-*"         (negation, to carve exceptions out of a glob)
   *
   * `include` and `exclude` compose: a project is emitted when it matches
   * `include` (or `include` is empty) AND does not match `exclude`.
   */
  include?: string[];
  /**
   * Skip emitting the target for projects matching any of these patterns.
   * Same matcher syntax as `include`. Applied after `include`, so it always
   * wins. Use it to opt projects out of the pnpm-deploy flow (e.g. while they
   * still use the Nx-native prune chain).
   */
  exclude?: string[];
}

export const createNodesV2: CreateNodesV2<NxPnpmDeployPluginOptions> = [
  // Trigger on package.json rather than Dockerfile: `pnpm deploy` targets a
  // workspace package, so a package.json is the real prerequisite. This lets
  // non-containerized deployables (e.g. tag:deployable:zip Lambdas without a
  // Dockerfile) get a prune target too. `include`/`exclude` do the selecting.
  '**/package.json',
  async (configFiles, options, context) => {
    if (!existsSync(join(context.workspaceRoot, 'pnpm-lock.yaml'))) {
      return [];
    }
    return await createNodesFromFiles(
      (configFile, opts, ctx) => createNodesInternal(configFile, opts, ctx),
      configFiles,
      options,
      context
    );
  },
];

async function createNodesInternal(
  configFilePath: string,
  options: NxPnpmDeployPluginOptions | undefined = {},
  _context: CreateNodesContextV2
): Promise<CreateNodesResult> {
  const projectRoot = dirname(configFilePath);
  const projectJsonPath = join(projectRoot, 'project.json');
  const packageJsonPath = join(projectRoot, 'package.json');

  // pnpm deploy requires the project to be a workspace package, which means
  // a package.json on disk. Skip silently otherwise.
  if (!existsSync(packageJsonPath)) {
    return {};
  }
  const packageJson = readJsonFile<{
    name?: string;
    nx?: { name?: string; tags?: string[] };
  }>(packageJsonPath);
  const packageName = packageJson.name;
  if (!packageName) {
    return {};
  }

  // Tags and the Nx project name can come from either project.json or the
  // inline `nx` field in package.json. Merge so findMatchingProjects sees
  // the same data Nx itself would.
  const projectJson = existsSync(projectJsonPath)
    ? readJsonFile<{ name?: string; tags?: string[] }>(projectJsonPath)
    : {};
  const projectName =
    projectJson.name ??
    packageJson.nx?.name ??
    packageName.replace(/^@[^/]+\//, '');
  const tags = [...(projectJson.tags ?? []), ...(packageJson.nx?.tags ?? [])];

  const include = options.include ?? [];
  const exclude = options.exclude ?? [];
  if (include.length > 0 || exclude.length > 0) {
    // Build the one-project map findMatchingProjects expects. We pass only the
    // current candidate and test whether the patterns match it. This lets
    // include/exclude accept names, directory globs, and tag: patterns.
    const candidate: Record<string, ProjectGraphProjectNode> = {
      [projectName]: {
        name: projectName,
        type: 'app',
        data: { root: projectRoot, tags },
      },
    };
    const matches = (patterns: string[]) =>
      findMatchingProjects(patterns, candidate).includes(projectName);

    // Allowlist: when include is set, the project must match it.
    if (include.length > 0 && !matches(include)) {
      return {};
    }
    // Denylist: exclude always wins over include.
    if (exclude.length > 0 && matches(exclude)) {
      return {};
    }
  }

  const targetName = options.targetName ?? 'prune';
  const outputDir = options.outputDir ?? 'out';
  const deployPath = `${projectRoot}/${outputDir}`;

  return {
    projects: {
      [projectRoot]: {
        targets: {
          [targetName]: {
            executor: 'nx:run-commands',
            dependsOn: ['build'],
            inputs: ['production', '^production'],
            outputs: [`{projectRoot}/${outputDir}`],
            options: {
              cwd: '{workspaceRoot}',
              commands: [
                `rm -rf ${deployPath}`,
                `pnpm --filter=${packageName} --prod deploy ${deployPath}`,
              ],
              parallel: false,
            },
          },
        },
      },
    },
  };
}

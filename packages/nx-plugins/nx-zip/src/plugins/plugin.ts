import {
  createNodesFromFiles,
  CreateNodesResult,
  CreateNodesV2,
  readJsonFile,
  type ProjectGraphProjectNode,
} from '@nx/devkit';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { findMatchingProjects } from 'nx/src/utils/find-matching-projects';

export interface NxZipPluginOptions {
  /**
   * Tag that marks a project as producing a deployment zip. Only projects
   * carrying this tag get the inferred target. Defaults to "deployable:zip"
   * so it lines up with the `lambda` release group in nx.json
   * (`projects: ["tag:deployable:zip"]`).
   */
  tag?: string;
  /**
   * Name of the inferred target. Defaults to "zip".
   */
  targetName?: string;
  /**
   * Folder (relative to the project root) whose *contents* are packed into the
   * zip. Defaults to "dist" — the standard build output. The contents are
   * flattened to the zip root (so `dist/main.js` becomes `main.js` inside the
   * zip), which is what AWS Lambda expects.
   */
  srcDir?: string;
  /**
   * Folder (relative to the project root) the zip is written to. Defaults to
   * "out" so it sits alongside Nx's existing "out"/"out-tsc" pattern and is
   * already gitignored. MUST NOT be nested inside `srcDir`, otherwise the zip
   * would recurse into its own output.
   */
  outputDir?: string;
  /**
   * Further restrict the target to only the projects matching any of these
   * patterns, on top of the `tag` gate above. When omitted (or empty), every
   * tagged project is eligible. When set, a tagged project must also match at
   * least one pattern to get the target.
   *
   * Forwarded directly to Nx's findMatchingProjects, so it accepts the same
   * syntax as `nx run-many --projects=...`:
   *   - "node-tsc"               (name)
   *   - "apps/nx-demo/*"         (directory glob)
   *   - "tag:scope:nx-demo"      (tag prefix)
   *   - "!apps/legacy-*"         (negation, to carve exceptions out of a glob)
   *
   * `include` and `exclude` compose: a project is emitted when it carries the
   * tag, matches `include` (or `include` is empty), AND does not match
   * `exclude`.
   */
  include?: string[];
  /**
   * Skip emitting the target for projects matching any of these patterns.
   * Same matcher syntax as `include`. Applied after `include`, so it always
   * wins.
   */
  exclude?: string[];
}

export const createNodesV2: CreateNodesV2<NxZipPluginOptions> = [
  '**/project.json',
  async (configFiles, options, context) => {
    return await createNodesFromFiles(
      (configFile, opts) => createNodesInternal(configFile, opts),
      configFiles,
      options,
      context
    );
  },
];

async function createNodesInternal(
  configFilePath: string,
  options: NxZipPluginOptions | undefined = {}
): Promise<CreateNodesResult> {
  const projectRoot = dirname(configFilePath);

  // Tags and the Nx project name can come from either project.json or the
  // inline `nx` field in package.json. Merge so the tag check and
  // findMatchingProjects see the same data Nx itself would.
  const projectJson = readJsonFile<{ name?: string; tags?: string[] }>(
    configFilePath
  );
  const packageJsonPath = join(projectRoot, 'package.json');
  const packageJson = existsSync(packageJsonPath)
    ? readJsonFile<{ name?: string; nx?: { name?: string; tags?: string[] } }>(
        packageJsonPath
      )
    : {};

  const projectName =
    projectJson.name ??
    packageJson.nx?.name ??
    packageJson.name?.replace(/^@[^/]+\//, '') ??
    basename(projectRoot);
  const tags = [...(projectJson.tags ?? []), ...(packageJson.nx?.tags ?? [])];

  const tag = options.tag ?? 'deployable:zip';
  if (!tags.includes(tag)) {
    return {};
  }

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

  const targetName = options.targetName ?? 'zip';
  const srcDir = options.srcDir ?? 'dist';
  const outputDir = options.outputDir ?? 'out';

  // Runs from the workspace root (cwd below). The zip name embeds the short
  // commit sha, resolved at run time. `cd`-ing into srcDir before zipping `.`
  // flattens its contents to the zip root (Lambda layout). Kept in a single
  // `sh -c '...'` so command substitution stays POSIX-portable.
  const command =
    `sh -c 'set -e; ` +
    `sha=$(git rev-parse --short HEAD); ` +
    `dest="$PWD/${projectRoot}/${outputDir}/${projectName}-\${sha}.zip"; ` +
    `mkdir -p "$(dirname "$dest")"; rm -f "$dest"; ` +
    `cd "${projectRoot}/${srcDir}"; zip -qr "$dest" .'`;

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
              command,
              parallel: false,
            },
          },
        },
      },
    },
  };
}

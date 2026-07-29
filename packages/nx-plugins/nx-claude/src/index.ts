import {
  type CreateDependencies,
  type CreateNodesContext,
  type CreateNodesResult,
  type CreateNodes,
  type RawProjectGraphDependency,
  type TargetConfiguration,
  createNodesFromFiles,
  validateDependency,
  DependencyType,
} from '@nx/devkit';
import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { CLAUDE_PLUGIN_TAG } from './release-group';
import { parsePluginDependencies } from './plugin-manifest';

export interface NxClaudePluginOptions {
  /** Name of the inferred lint target on plugin projects. Default: "lint". */
  lintTargetName?: string;
  /** Name of the inferred catalog target on the marketplace project. Default: "catalog". */
  catalogTargetName?: string;
}

// Infer two kinds of project from the manifests inside a `.claude-plugin/` folder:
//   plugins/**/.claude-plugin/plugin.json        → one plugin project (lint + release)
//   .claude-plugin/marketplace.json (repo root)  → the marketplace project (catalog)
// Nx globs match files, not folders, so we match both manifest names and branch on basename.
const MANIFEST_GLOB = '**/.claude-plugin/{plugin,marketplace}.json';

export const createNodesV2: CreateNodes<NxClaudePluginOptions> = [
  MANIFEST_GLOB,
  async (configFiles, options, context) => {
    return await createNodesFromFiles(
      (configFile, opts, ctx) =>
        createNodesInternal(configFile, opts ?? {}, ctx),
      configFiles,
      options,
      context,
    );
  },
];

// Turn each manifest's `dependencies` array into static graph edges between plugin
// projects. Project names equal plugin.json names (see pluginProject), so a dependency's
// `name` maps straight onto a graph node. Entries that don't resolve to a workspace
// plugin (external marketplace plugins) get no edge — lint reports them instead.
// The handful of plugin manifests is cheap to re-read, so no filesToProcess filtering.
export const createDependencies: CreateDependencies<NxClaudePluginOptions> = (
  _options,
  context,
) => {
  const manifestByProject = new Map<string, string>(); // project name → ws-relative manifest path
  for (const [projectName, config] of Object.entries(context.projects)) {
    const root = config.root;
    if (root !== 'plugins' && !root.startsWith('plugins/')) continue;
    const manifestPath = `${root}/.claude-plugin/plugin.json`;
    if (existsSync(join(context.workspaceRoot, manifestPath))) {
      manifestByProject.set(projectName, manifestPath);
    }
  }

  const edges: RawProjectGraphDependency[] = [];
  for (const [projectName, manifestPath] of manifestByProject) {
    let manifest: unknown;
    try {
      manifest = JSON.parse(
        readFileSync(join(context.workspaceRoot, manifestPath), 'utf8'),
      );
    } catch {
      continue; // malformed manifests are lint's job, not the graph's
    }
    for (const dep of parsePluginDependencies(manifest)) {
      if (dep.name === projectName || !manifestByProject.has(dep.name))
        continue;
      const edge: RawProjectGraphDependency = {
        source: projectName,
        target: dep.name,
        type: DependencyType.static,
        sourceFile: manifestPath,
      };
      validateDependency(edge, context);
      edges.push(edge);
    }
  }
  return edges;
};

function createNodesInternal(
  manifestPath: string,
  options: NxClaudePluginOptions,
  context: CreateNodesContext,
): CreateNodesResult {
  const base = basename(manifestPath);
  if (base === 'plugin.json')
    return pluginProject(manifestPath, options, context);
  if (base === 'marketplace.json')
    return marketplaceProject(manifestPath, options, context);
  return {};
}

// plugins/<name>/.claude-plugin/plugin.json → a plugin project. Scoped to `plugins/` so a
// stray manifest elsewhere isn't inferred.
function pluginProject(
  manifestPath: string,
  options: NxClaudePluginOptions,
  context: CreateNodesContext,
): CreateNodesResult {
  const projectRoot = dirname(dirname(manifestPath)); // plugins/<name>
  if (projectRoot !== 'plugins' && !projectRoot.startsWith('plugins/'))
    return {};

  const absManifest = join(context.workspaceRoot, manifestPath);
  if (!existsSync(absManifest)) return {};

  let projectName = basename(projectRoot);
  try {
    const name = JSON.parse(readFileSync(absManifest, 'utf8'))?.name;
    if (typeof name === 'string' && name.length > 0) projectName = name;
  } catch {
    // Malformed plugin.json still yields a project so the lint target can report it.
  }

  const lintTarget: TargetConfiguration = {
    executor: '@thdk/nx-claude:lint',
    cache: true,
    inputs: [
      '{projectRoot}/**/*',
      // The single repo-root marketplace holds this plugin's entry — re-lint on changes.
      '{workspaceRoot}/.claude-plugin/marketplace.json',
      // Lint validates the claude-plugins release group config — re-lint on changes.
      '{workspaceRoot}/nx.json',
    ],
    options: {},
    metadata: {
      description:
        'Validate plugin.json + marketplace entry and lint SKILL.md files',
    },
  };

  return {
    projects: {
      [projectRoot]: {
        name: projectName,
        root: projectRoot,
        projectType: 'library',
        // The claude-plugins release group in nx.json matches on this tag, so every
        // inferred plugin joins the group without manual configuration.
        tags: [CLAUDE_PLUGIN_TAG],
        targets: {
          [options.lintTargetName ?? 'lint']: lintTarget,
        },
        release: {
          version: {
            // Resolve the current version from the project's git release tag; on the
            // first release (no tag yet) fall back to the version in plugin.json.
            currentVersionResolver: 'git-tag',
            fallbackCurrentVersionResolver: 'disk',
            versionActions: '@thdk/nx-claude/version-actions',
          },
        },
      },
    },
  };
}

// .claude-plugin/marketplace.json at the repo root → the marketplace project (root "."), owner
// of the `catalog` target. A repo has exactly one marketplace at its root, so a marketplace.json
// found deeper (e.g. a legacy nested one) is ignored.
function marketplaceProject(
  manifestPath: string,
  options: NxClaudePluginOptions,
  context: CreateNodesContext,
): CreateNodesResult {
  const projectRoot = dirname(dirname(manifestPath)); // "." for the repo-root marketplace
  if (projectRoot !== '.') return {};

  const absManifest = join(context.workspaceRoot, manifestPath);
  if (!existsSync(absManifest)) return {};

  let projectName = 'marketplace';
  try {
    const name = JSON.parse(readFileSync(absManifest, 'utf8'))?.name;
    if (typeof name === 'string' && name.length > 0) projectName = name;
  } catch {
    // Malformed marketplace.json still yields a project so the catalog target can report it.
  }

  const catalogTarget: TargetConfiguration = {
    executor: '@thdk/nx-claude:catalog',
    cache: true,
    // Scope inputs to the metadata the catalog is built from — NOT the whole repo (which is what
    // a root project's default {projectRoot}/**/* would be).
    inputs: [
      '{workspaceRoot}/.claude-plugin/marketplace.json',
      '{workspaceRoot}/plugins/**/.claude-plugin/plugin.json',
      '{workspaceRoot}/plugins/**/skills/*/SKILL.md',
      '{workspaceRoot}/nx.json',
    ],
    outputs: ['{options.outputPath}'],
    options: { outputPath: 'dist/catalog/plugins-catalog.json' },
    metadata: {
      description: 'Aggregate all plugin metadata into plugins-catalog.json',
    },
  };

  return {
    projects: {
      [projectRoot]: {
        name: projectName,
        root: projectRoot,
        targets: {
          [options.catalogTargetName ?? 'catalog']: catalogTarget,
        },
      },
    },
  };
}

import {
  type CreateNodesContextV2,
  type CreateNodesResult,
  type CreateNodesV2,
  type TargetConfiguration,
  createNodesFromFiles,
} from '@nx/devkit';
import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join } from 'path';

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

export const createNodesV2: CreateNodesV2<NxClaudePluginOptions> = [
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

function createNodesInternal(
  manifestPath: string,
  options: NxClaudePluginOptions,
  context: CreateNodesContextV2,
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
  context: CreateNodesContextV2,
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
    executor: 'nx-claude:lint',
    cache: true,
    inputs: [
      '{projectRoot}/**/*',
      // The single repo-root marketplace holds this plugin's entry — re-lint on changes.
      '{workspaceRoot}/.claude-plugin/marketplace.json',
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
        targets: {
          [options.lintTargetName ?? 'lint']: lintTarget,
        },
        release: {
          version: {
            // Resolve the current version from the project's git release tag; on the
            // first release (no tag yet) fall back to the version in plugin.json.
            currentVersionResolver: 'git-tag',
            fallbackCurrentVersionResolver: 'disk',
            versionActions: 'nx-claude/version-actions',
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
  context: CreateNodesContextV2,
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
    executor: 'nx-claude:catalog',
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

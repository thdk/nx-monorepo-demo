import { type Tree, readJson, writeJson } from '@nx/devkit';
import type { SyncGeneratorResult } from 'nx/src/utils/sync-generators';
import { MARKETPLACE_PATH } from '../../marketplace';
import { parsePluginDependencies } from '../../plugin-manifest';
import {
  readWorkspacePlugins,
  skillMarkdownFiles,
  skillNamesOf,
  skillReferenceRegExp,
} from '../workspace-plugins';

// Sync generator: derive plugin.json `dependencies` from cross-plugin skill
// references. Skills invoke other plugins' skills as `plugin-name:skill-name`
// (e.g. "/payments:review-terraform"), so any skill markdown mentioning another
// workspace plugin's skill implies a dependency on that plugin.
//
// ADD: missing references become bare-name entries (a version range can't be
// inferred — tighten by hand where it matters).
//
// PRUNE: a declared dependency on another WORKSPACE plugin that no skill still
// references is removed. The prune is scoped to workspace plugins on purpose —
// a dep whose name isn't a workspace plugin points outside this repo (another
// marketplace) and is left untouched, since markdown can't speak to it. Note the
// accepted tradeoff: a workspace dep kept for a reason markdown doesn't show
// (hooks, MCP servers, agents) will be pruned; re-add it as an object entry or
// keep a referencing skill. Plugins with no skill markdown at all are skipped
// entirely (nothing to add, nothing to prune — a fresh scaffold keeps its deps).
//
// It runs via `nx sync` / `nx sync:check`, and is attached to every inferred
// plugin lint target through `syncGenerators` (see src/index.ts).
export default async function syncDepsGenerator(
  tree: Tree,
): Promise<SyncGeneratorResult> {
  if (!tree.exists(MARKETPLACE_PATH)) return;

  const plugins = readWorkspacePlugins(tree);
  const workspaceNames = new Set(plugins.map((p) => p.name));
  const skillsByPlugin = new Map(
    plugins.map((p) => [p.name, skillNamesOf(tree, p.folder)]),
  );

  const updates: string[] = [];
  for (const plugin of plugins) {
    const markdown = skillMarkdownFiles(tree, plugin.folder)
      .map((f) => tree.read(f, 'utf-8') ?? '')
      .join('\n');
    if (!markdown) continue;

    const referenced = new Set<string>();
    for (const other of plugins) {
      if (other.name === plugin.name) continue;
      const hasReference = (skillsByPlugin.get(other.name) ?? []).some(
        (skill) => skillReferenceRegExp(other.name, skill).test(markdown),
      );
      if (hasReference) referenced.add(other.name);
    }

    const manifestPath = `${plugin.folder}/.claude-plugin/plugin.json`;
    const manifest = readJson<{ dependencies?: unknown[] }>(tree, manifestPath);
    const rawDeps = Array.isArray(manifest.dependencies)
      ? manifest.dependencies
      : [];
    const declared = new Set(
      parsePluginDependencies(manifest).map((d) => d.name),
    );

    const missing = [...referenced].filter((n) => !declared.has(n)).sort();
    // Only prune deps on OTHER workspace plugins that markdown no longer cites.
    const stale = new Set(
      [...declared].filter(
        (n) => workspaceNames.has(n) && n !== plugin.name && !referenced.has(n),
      ),
    );
    if (!missing.length && !stale.size) continue;

    const kept = rawDeps.filter((entry) => {
      const name = dependencyName(entry);
      return name === undefined || !stale.has(name);
    });
    manifest.dependencies = [...kept, ...missing];
    writeJson(tree, manifestPath, manifest);

    const parts: string[] = [];
    if (missing.length) parts.push(`+${missing.join(', ')}`);
    if (stale.size) parts.push(`-${[...stale].sort().join(', ')}`);
    updates.push(`${plugin.name} (${parts.join(' ')})`);
  }

  if (updates.length) {
    return {
      outOfSyncMessage: `Some plugin.json dependencies are out of sync with the plugin:skill references in their skills: ${updates.join('; ')}`,
    };
  }
}

/** Resolve the plugin name of a raw dependency entry (bare string or { name }). */
function dependencyName(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    const name = (entry as { name?: unknown }).name;
    if (typeof name === 'string') return name;
  }
  return undefined;
}

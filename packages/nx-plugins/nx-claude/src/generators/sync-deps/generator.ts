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
// The generator only ADDS missing entries (as bare names — it cannot infer a
// version range). It never removes: a dependency may exist for reasons the
// markdown doesn't show (hooks, MCP servers, agents), so pruning stays manual.
//
// It runs via `nx sync` / `nx sync:check`, and is attached to every inferred
// plugin lint target through `syncGenerators` (see src/index.ts).
export default async function syncDepsGenerator(
  tree: Tree,
): Promise<SyncGeneratorResult> {
  if (!tree.exists(MARKETPLACE_PATH)) return;

  const plugins = readWorkspacePlugins(tree);
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
    if (!referenced.size) continue;

    const manifestPath = `${plugin.folder}/.claude-plugin/plugin.json`;
    const manifest = readJson<{ dependencies?: unknown[] }>(tree, manifestPath);
    const declared = new Set(
      parsePluginDependencies(manifest).map((d) => d.name),
    );
    const missing = [...referenced].filter((n) => !declared.has(n)).sort();
    if (!missing.length) continue;

    manifest.dependencies = [...(manifest.dependencies ?? []), ...missing];
    writeJson(tree, manifestPath, manifest);
    updates.push(`${plugin.name} → ${missing.join(', ')}`);
  }

  if (updates.length) {
    return {
      outOfSyncMessage: `Some plugin.json files are missing dependencies implied by plugin:skill references in their skills: ${updates.join('; ')}`,
    };
  }
}

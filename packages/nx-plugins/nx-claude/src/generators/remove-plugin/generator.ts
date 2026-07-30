import { type Tree, readJson, writeJson } from '@nx/devkit';
import type { RemovePluginGeneratorSchema } from './schema';
import { MARKETPLACE_PATH, sourceFor } from '../../marketplace';
import { normalizePluginPath, resolvePluginFolder } from '../shared';

interface MarketplaceEntry {
  name: string;
  source: string;
  strict?: boolean;
}

export default async function removePluginGenerator(
  tree: Tree,
  options: RemovePluginGeneratorSchema,
): Promise<void> {
  // 1. Resolve the plugin folder — from a path, or by looking up a marketplace entry name.
  const folder = resolvePluginFolder(tree, options.name);
  if (!folder) {
    throw new Error(
      `No plugin found for "${options.name}" (looked for a folder or a marketplace entry).`,
    );
  }

  // 2. Remove entries pointing at this folder from the repo-root marketplace.
  const removed: string[] = [];
  if (tree.exists(MARKETPLACE_PATH)) {
    const doc = readJson<{ plugins?: MarketplaceEntry[] }>(
      tree,
      MARKETPLACE_PATH,
    );
    const expected = normalizePluginPath(sourceFor(folder));
    doc.plugins = (doc.plugins ?? []).filter((p) => {
      const match = normalizePluginPath(p.source) === expected;
      if (match) removed.push(p.name);
      return !match;
    });
    writeJson(tree, MARKETPLACE_PATH, doc);
  }

  // 3. Delete the folder.
  if (tree.exists(folder)) tree.delete(folder);

  console.log(
    `Removed folder "${folder}"` +
      (removed.length
        ? ` and ${removed.length} marketplace entr${removed.length === 1 ? 'y' : 'ies'}: ${removed.join(', ')}.`
        : ' (no matching marketplace entries).'),
  );
}

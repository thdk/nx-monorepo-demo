import { type Tree, readJson, writeJson } from '@nx/devkit';
import type { RemoveGeneratorSchema } from './schema';
import { MARKETPLACE_PATH, sourceFor } from '../../marketplace';

interface MarketplaceEntry {
  name: string;
  source: string;
  strict?: boolean;
}

const norm = (s: string): string =>
  s.replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');

export default async function removeGenerator(
  tree: Tree,
  options: RemoveGeneratorSchema,
): Promise<void> {
  const input = norm(options.name);

  // 1. Resolve the plugin folder — from a path, or by looking up a marketplace entry name.
  let folder: string | undefined;
  for (const candidate of [input, `plugins/${input}`]) {
    if (tree.exists(`${candidate}/.claude-plugin/plugin.json`)) {
      folder = candidate;
      break;
    }
  }
  if (!folder && tree.exists(MARKETPLACE_PATH)) {
    const doc = readJson<{ plugins?: MarketplaceEntry[] }>(
      tree,
      MARKETPLACE_PATH,
    );
    const hit = (doc.plugins ?? []).find((p) => p.name === input);
    if (hit) folder = norm(hit.source);
  }
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
    const expected = norm(sourceFor(folder));
    doc.plugins = (doc.plugins ?? []).filter((p) => {
      const match = norm(p.source) === expected;
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

import { type Tree, readJson, writeJson } from '@nx/devkit';
import type { MovePluginGeneratorSchema } from './schema';
import { MARKETPLACE_PATH, sourceFor } from '../../marketplace';
import { isUnderPluginsRoot } from '../../plugins-root';
import {
  configuredPluginsRoot,
  normalizePluginPath,
  resolvePluginFolder,
} from '../shared';
import {
  moveDirectory,
  renamePluginName,
  renamePluginNotes,
} from '../workspace-plugins';

interface MarketplaceEntry {
  name: string;
  source: string;
  strict?: boolean;
}

export default async function movePluginGenerator(
  tree: Tree,
  options: MovePluginGeneratorSchema,
): Promise<void> {
  const folder = resolvePluginFolder(tree, options.name);
  if (!folder) {
    throw new Error(
      `No plugin found for "${options.name}" (looked for a folder or a marketplace entry).`,
    );
  }

  const destination = normalizePluginPath(options.destination);
  // Project inference only picks up plugins under the configured root — refuse to move them out.
  const pluginsRoot = configuredPluginsRoot(tree);
  if (!isUnderPluginsRoot(destination, pluginsRoot)) {
    throw new Error(
      `Destination must live under ${pluginsRoot}/ (got "${destination}") — plugins elsewhere are not inferred as Nx projects. Set "pluginsRoot" on the nx-claude registration in nx.json to change the root.`,
    );
  }
  if (destination === folder) {
    throw new Error(`"${folder}" is already at that location.`);
  }
  if (tree.exists(destination)) {
    throw new Error(
      `${destination} already exists — pick a different destination.`,
    );
  }

  const oldName =
    readJson<{ name?: string }>(tree, `${folder}/.claude-plugin/plugin.json`)
      .name ?? folder;
  const newName = options.newName;
  if (newName !== undefined && !/^[a-z0-9-]+$/.test(newName)) {
    throw new Error(`--newName must match ^[a-z0-9-]+$ (got "${newName}").`);
  }
  const renaming = newName !== undefined && newName !== oldName;

  moveDirectory(tree, folder, destination);

  // Marketplace: repoint every entry whose source is the old folder (incl. legacy aliases).
  // The rename below matches entries by name, so ordering here is independent.
  if (tree.exists(MARKETPLACE_PATH)) {
    const doc = readJson<{ plugins?: MarketplaceEntry[] }>(
      tree,
      MARKETPLACE_PATH,
    );
    for (const entry of doc.plugins ?? []) {
      if (normalizePluginPath(entry.source) !== folder) continue;
      entry.source = sourceFor(destination);
    }
    writeJson(tree, MARKETPLACE_PATH, doc);
  }

  // Dependents reference the plugin by NAME, not by path — a pure move needs no
  // further updates. A rename must chase the name through manifests and skills.
  const notes: string[] = [];
  if (renaming && newName !== undefined) {
    const result = renamePluginName(tree, destination, oldName, newName);
    notes.push(...renamePluginNotes(result, oldName, newName));
  }

  console.log(
    [
      `Moved plugin "${oldName}" from ${folder} to ${destination}` +
        (renaming ? ` and renamed it to "${newName}".` : '.'),
      ...notes,
    ].join('\n'),
  );
}

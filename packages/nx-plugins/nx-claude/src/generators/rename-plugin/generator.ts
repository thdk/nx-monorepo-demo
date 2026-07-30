import { type Tree, readJson } from '@nx/devkit';
import type { RenamePluginGeneratorSchema } from './schema';
import { defaultPluginNameForFolder, resolvePluginFolder } from '../shared';
import { renamePluginName, renamePluginNotes } from '../workspace-plugins';

/**
 * Rename a plugin in place — a companion to `move-plugin`. A pure `move-plugin`
 * keeps the old name; run this afterwards to bring the name in line with the new
 * directory. With no `--newName` the target defaults to the directory-derived
 * name (matching what `nx g plugin` would produce at that folder).
 */
export default async function renamePluginGenerator(
  tree: Tree,
  options: RenamePluginGeneratorSchema,
): Promise<void> {
  const folder = resolvePluginFolder(tree, options.name);
  if (!folder) {
    throw new Error(
      `No plugin found for "${options.name}" (looked for a folder or a marketplace entry).`,
    );
  }

  const oldName =
    readJson<{ name?: string }>(tree, `${folder}/.claude-plugin/plugin.json`)
      .name ?? folder;
  const newName = options.newName ?? defaultPluginNameForFolder(tree, folder);
  if (!/^[a-z0-9-]+$/.test(newName)) {
    throw new Error(`New name must match ^[a-z0-9-]+$ (got "${newName}").`);
  }
  if (newName === oldName) {
    throw new Error(
      `"${oldName}" is already named that — nothing to rename (pass --newName to choose a different name).`,
    );
  }

  const result = renamePluginName(tree, folder, oldName, newName);
  console.log(
    [
      `Renamed plugin "${oldName}" to "${newName}" (${folder}).`,
      ...renamePluginNotes(result, oldName, newName),
    ].join('\n'),
  );
}

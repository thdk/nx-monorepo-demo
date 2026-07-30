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
  readWorkspacePlugins,
  rewriteSkillReferences,
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
    throw new Error(`${destination} already exists — pick a different destination.`);
  }

  const manifestPath = `${destination}/.claude-plugin/plugin.json`;
  const oldName =
    readJson<{ name?: string }>(tree, `${folder}/.claude-plugin/plugin.json`)
      .name ?? folder;
  const newName = options.newName;
  if (newName !== undefined && !/^[a-z0-9-]+$/.test(newName)) {
    throw new Error(`--newName must match ^[a-z0-9-]+$ (got "${newName}").`);
  }
  const renaming = newName !== undefined && newName !== oldName;

  moveDirectory(tree, folder, destination);

  if (renaming) {
    const manifest = readJson<{ name?: string }>(tree, manifestPath);
    manifest.name = newName;
    writeJson(tree, manifestPath, manifest);
  }

  // Marketplace: repoint every entry whose source is the old folder (incl. legacy aliases).
  if (tree.exists(MARKETPLACE_PATH)) {
    const doc = readJson<{ plugins?: MarketplaceEntry[] }>(
      tree,
      MARKETPLACE_PATH,
    );
    for (const entry of doc.plugins ?? []) {
      if (normalizePluginPath(entry.source) !== folder) continue;
      entry.source = sourceFor(destination);
      if (renaming && entry.name === oldName) entry.name = newName;
    }
    writeJson(tree, MARKETPLACE_PATH, doc);
  }

  // Dependents reference the plugin by NAME, not by path — a pure move needs no
  // further updates. A rename must chase the name through manifests and skills.
  const notes: string[] = [];
  if (renaming) {
    const plugins = readWorkspacePlugins(tree);
    const dependents = renameInDependents(tree, plugins, oldName, newName);
    if (dependents.length) {
      notes.push(`Updated dependencies in: ${dependents.join(', ')}.`);
    }
    const rewritten = rewriteSkillReferences(
      tree,
      plugins,
      { plugin: oldName },
      newName,
    );
    if (rewritten.length) {
      notes.push(
        `Rewrote ${oldName}:<skill> references in:\n- ${rewritten.join('\n- ')}`,
      );
    }
    notes.push(
      `Release tags follow {projectName}--v{version}: existing "${oldName}--v*" tags no longer match, so the next release of "${newName}" resolves its current version from plugin.json (disk fallback).`,
    );
  }

  console.log(
    [
      `Moved plugin "${oldName}" from ${folder} to ${destination}` +
        (renaming ? ` and renamed it to "${newName}".` : '.'),
      ...notes,
    ].join('\n'),
  );
}

/** Replace `oldName` with `newName` in every other plugin's dependencies array,
 * preserving entry shape (bare string vs { name, version }). Returns dependents. */
function renameInDependents(
  tree: Tree,
  plugins: { name: string; folder: string }[],
  oldName: string,
  newName: string,
): string[] {
  const dependents: string[] = [];
  for (const plugin of plugins) {
    if (plugin.name === newName) continue; // the moved plugin itself
    const manifestPath = `${plugin.folder}/.claude-plugin/plugin.json`;
    const manifest = readJson<{ dependencies?: unknown[] }>(tree, manifestPath);
    if (!Array.isArray(manifest.dependencies)) continue;
    let changed = false;
    manifest.dependencies = manifest.dependencies.map((entry) => {
      if (entry === oldName) {
        changed = true;
        return newName;
      }
      if (
        entry &&
        typeof entry === 'object' &&
        (entry as { name?: unknown }).name === oldName
      ) {
        changed = true;
        return { ...(entry as object), name: newName };
      }
      return entry;
    });
    if (changed) {
      writeJson(tree, manifestPath, manifest);
      dependents.push(plugin.name);
    }
  }
  return dependents;
}

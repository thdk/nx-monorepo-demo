import { type Tree, readJson, writeJson } from '@nx/devkit';
import { MARKETPLACE_PATH } from '../marketplace';
import { normalizePluginPath } from './shared';

// Helpers over the set of workspace plugins (marketplace entries + their folders),
// shared by the move-skill / move-plugin generators and the sync-deps sync generator.

export interface WorkspacePlugin {
  /** Plugin name (from plugin.json, falling back to the marketplace entry). */
  name: string;
  /** Workspace-relative plugin folder. */
  folder: string;
}

export function readWorkspacePlugins(tree: Tree): WorkspacePlugin[] {
  if (!tree.exists(MARKETPLACE_PATH)) return [];
  const doc = readJson<{ plugins?: { name?: string; source?: string }[] }>(
    tree,
    MARKETPLACE_PATH,
  );
  const plugins: WorkspacePlugin[] = [];
  const seen = new Set<string>();
  for (const entry of doc.plugins ?? []) {
    if (typeof entry.source !== 'string') continue;
    const folder = normalizePluginPath(entry.source);
    if (seen.has(folder)) continue; // legacy aliases share a folder
    seen.add(folder);
    const manifestPath = `${folder}/.claude-plugin/plugin.json`;
    if (!tree.exists(manifestPath)) continue;
    const manifestName = readJson<{ name?: string }>(tree, manifestPath).name;
    const name = manifestName ?? entry.name;
    if (typeof name === 'string' && name.length > 0) {
      plugins.push({ name, folder });
    }
  }
  return plugins;
}

/** Skill directory names under a plugin's skills/ folder. */
export function skillNamesOf(tree: Tree, folder: string): string[] {
  const skillsRoot = `${folder}/skills`;
  if (!tree.exists(skillsRoot)) return [];
  return tree
    .children(skillsRoot)
    .filter((n) => !n.startsWith('.'))
    .filter((n) => !tree.isFile(`${skillsRoot}/${n}`))
    .sort();
}

/** All markdown files under a plugin's skills/ folder (SKILL.md + any references). */
export function skillMarkdownFiles(tree: Tree, folder: string): string[] {
  const files: string[] = [];
  const visit = (dir: string): void => {
    if (!tree.exists(dir)) return;
    for (const child of tree.children(dir)) {
      const path = `${dir}/${child}`;
      if (tree.isFile(path)) {
        if (child.toLowerCase().endsWith('.md')) files.push(path);
      } else {
        visit(path);
      }
    }
  };
  visit(`${folder}/skills`);
  return files;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Boundary-safe regex for a `plugin-name:skill-name` reference (skill captured). */
export function skillReferenceRegExp(
  pluginName: string,
  skillName?: string,
): RegExp {
  const skill = skillName ? escapeRegExp(skillName) : '[a-z0-9-]+';
  return new RegExp(
    `(?<![A-Za-z0-9-])${escapeRegExp(pluginName)}:(${skill})(?![A-Za-z0-9-])`,
    'g',
  );
}

/**
 * Rewrite `fromPlugin:skill` references (optionally one specific skill) to
 * `toPlugin:skill` in every skill markdown file of the given plugins.
 * Returns the paths of changed files.
 */
export function rewriteSkillReferences(
  tree: Tree,
  plugins: WorkspacePlugin[],
  from: { plugin: string; skill?: string },
  toPlugin: string,
): string[] {
  const changed: string[] = [];
  for (const plugin of plugins) {
    for (const file of skillMarkdownFiles(tree, plugin.folder)) {
      const content = tree.read(file, 'utf-8') ?? '';
      const re = skillReferenceRegExp(from.plugin, from.skill);
      const next = content.replace(re, `${toPlugin}:$1`);
      if (next !== content) {
        tree.write(file, next);
        changed.push(file);
      }
    }
  }
  return changed;
}

export interface RenamePluginNameResult {
  /** Other plugins whose `dependencies` arrays were updated. */
  dependents: string[];
  /** Skill markdown files whose `oldName:<skill>` references were rewritten. */
  rewrittenSkillFiles: string[];
}

/**
 * Rename a plugin that already lives at `folder` (this does NOT move it): its
 * `plugin.json` name, the matching marketplace entry name, every dependent's
 * `dependencies` entry, and `oldName:<skill>` references in skill markdown.
 * The marketplace entry is matched by name — repointing its `source` on a move
 * is the caller's concern. Shared by the `move-plugin` and `rename-plugin`
 * generators so their rename semantics cannot drift.
 */
export function renamePluginName(
  tree: Tree,
  folder: string,
  oldName: string,
  newName: string,
): RenamePluginNameResult {
  const manifestPath = `${folder}/.claude-plugin/plugin.json`;
  const manifest = readJson<{ name?: string }>(tree, manifestPath);
  manifest.name = newName;
  writeJson(tree, manifestPath, manifest);

  if (tree.exists(MARKETPLACE_PATH)) {
    const doc = readJson<{ plugins?: { name?: string }[] }>(
      tree,
      MARKETPLACE_PATH,
    );
    for (const entry of doc.plugins ?? []) {
      if (entry.name === oldName) entry.name = newName;
    }
    writeJson(tree, MARKETPLACE_PATH, doc);
  }

  const plugins = readWorkspacePlugins(tree);
  return {
    dependents: renameInDependents(tree, plugins, oldName, newName),
    rewrittenSkillFiles: rewriteSkillReferences(
      tree,
      plugins,
      { plugin: oldName },
      newName,
    ),
  };
}

/** Human-readable notes describing a rename's ripple effects, for generator output. */
export function renamePluginNotes(
  result: RenamePluginNameResult,
  oldName: string,
  newName: string,
): string[] {
  const notes: string[] = [];
  if (result.dependents.length) {
    notes.push(`Updated dependencies in: ${result.dependents.join(', ')}.`);
  }
  if (result.rewrittenSkillFiles.length) {
    notes.push(
      `Rewrote ${oldName}:<skill> references in:\n- ${result.rewrittenSkillFiles.join('\n- ')}`,
    );
  }
  notes.push(
    `Release tags follow {projectName}--v{version}: existing "${oldName}--v*" tags no longer match, so the next release of "${newName}" resolves its current version from plugin.json (disk fallback).`,
  );
  return notes;
}

/** Replace `oldName` with `newName` in every other plugin's dependencies array,
 * preserving entry shape (bare string vs { name, version }). Returns dependents. */
function renameInDependents(
  tree: Tree,
  plugins: WorkspacePlugin[],
  oldName: string,
  newName: string,
): string[] {
  const dependents: string[] = [];
  for (const plugin of plugins) {
    if (plugin.name === newName) continue; // the renamed plugin itself
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

/** Move a directory (recursively) within the tree. */
export function moveDirectory(tree: Tree, from: string, to: string): void {
  for (const child of tree.children(from)) {
    const src = `${from}/${child}`;
    const dest = `${to}/${child}`;
    if (tree.isFile(src)) tree.rename(src, dest);
    else moveDirectory(tree, src, dest);
  }
}

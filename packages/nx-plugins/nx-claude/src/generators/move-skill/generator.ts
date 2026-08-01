import { type Tree, names, readJson } from '@nx/devkit';
// import-equals: gray-matter is CJS without a `.default` (see lint/rules.ts).
import matter = require('gray-matter');
import type { MoveSkillGeneratorSchema } from './schema';
import { resolvePluginFolder } from '../shared';
import { addSkillToReadme, removeSkillFromReadme } from '../readme';
import {
  moveDirectory,
  readWorkspacePlugins,
  rewriteSkillReferences,
} from '../workspace-plugins';

export default async function moveSkillGenerator(
  tree: Tree,
  options: MoveSkillGeneratorSchema,
): Promise<void> {
  const fromFolder = resolvePluginFolder(tree, options.from);
  if (!fromFolder) {
    throw new Error(`No plugin found for --from="${options.from}".`);
  }
  const toFolder = resolvePluginFolder(tree, options.to);
  if (!toFolder) {
    throw new Error(`No plugin found for --to="${options.to}".`);
  }
  if (fromFolder === toFolder) {
    throw new Error(
      `--from and --to resolve to the same plugin (${fromFolder}).`,
    );
  }

  const skillName = names(options.name).fileName;
  const srcDir = `${fromFolder}/skills/${skillName}`;
  if (!tree.exists(srcDir)) {
    throw new Error(`Skill "${skillName}" not found in ${fromFolder}/skills.`);
  }
  const destDir = `${toFolder}/skills/${skillName}`;
  if (tree.exists(destDir)) {
    throw new Error(`${destDir} already exists — remove or rename it first.`);
  }

  moveDirectory(tree, srcDir, destDir);

  // Keep both plugin READMEs' skill lists in sync (lint rule F010).
  removeSkillFromReadme(tree, fromFolder, skillName);
  addSkillToReadme(tree, toFolder, skillName, skillDescription(tree, destDir));

  // Rewrite `from-plugin:skill` references to `to-plugin:skill` across every
  // workspace plugin's skill markdown, so dependents keep pointing at the skill.
  const fromName = pluginNameOf(tree, fromFolder);
  const toName = pluginNameOf(tree, toFolder);
  const changed = rewriteSkillReferences(
    tree,
    readWorkspacePlugins(tree),
    { plugin: fromName, skill: skillName },
    toName,
  );

  console.log(
    `Moved skill "${skillName}" from ${fromFolder} to ${toFolder}.` +
      (changed.length
        ? `\nRewrote ${fromName}:${skillName} → ${toName}:${skillName} in:\n- ${changed.join('\n- ')}\nRun \`nx sync\` to update plugin.json dependencies to match.`
        : ''),
  );
}

function pluginNameOf(tree: Tree, folder: string): string {
  return (
    readJson<{ name?: string }>(tree, `${folder}/.claude-plugin/plugin.json`)
      .name ?? folder
  );
}

function skillDescription(tree: Tree, skillDir: string): string {
  const raw = tree.read(`${skillDir}/SKILL.md`, 'utf-8');
  if (raw) {
    try {
      const description = matter(raw).data?.description;
      if (typeof description === 'string' && description.trim()) {
        return description.trim();
      }
    } catch {
      // fall through to the placeholder
    }
  }
  return 'moved skill — update this description.';
}

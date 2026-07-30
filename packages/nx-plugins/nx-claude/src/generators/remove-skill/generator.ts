import { type Tree, names, readJson } from '@nx/devkit';
import type { RemoveSkillGeneratorSchema } from './schema';
import { resolvePluginFolder } from '../shared';
import { removeSkillFromReadme } from '../readme';
import {
  readWorkspacePlugins,
  skillMarkdownFiles,
  skillReferenceRegExp,
} from '../workspace-plugins';

export default async function removeSkillGenerator(
  tree: Tree,
  options: RemoveSkillGeneratorSchema,
): Promise<void> {
  const folder = resolvePluginFolder(tree, options.project);
  if (!folder) {
    throw new Error(
      `No plugin found for "${options.project}" (looked for a folder or a marketplace entry).`,
    );
  }

  const skillName = names(options.name).fileName;
  const skillDir = `${folder}/skills/${skillName}`;
  if (!tree.exists(skillDir)) {
    throw new Error(`Skill "${skillName}" not found in ${folder}/skills.`);
  }

  tree.delete(skillDir);
  removeSkillFromReadme(tree, folder, skillName);

  // Dangling `plugin:skill` references can't be auto-fixed (there is no new
  // target) — surface them so the caller can clean up or move instead.
  const pluginName =
    readJson<{ name?: string }>(tree, `${folder}/.claude-plugin/plugin.json`)
      .name ?? folder;
  const referencing: string[] = [];
  for (const plugin of readWorkspacePlugins(tree)) {
    for (const file of skillMarkdownFiles(tree, plugin.folder)) {
      const content = tree.read(file, 'utf-8') ?? '';
      if (skillReferenceRegExp(pluginName, skillName).test(content)) {
        referencing.push(file);
      }
    }
  }

  console.log(`Removed skill "${skillName}" from ${folder}/skills.`);
  if (referencing.length) {
    console.warn(
      `Warning: ${pluginName}:${skillName} is still referenced in:\n- ${referencing.join('\n- ')}\nUpdate or remove those references (use move-skill instead if the skill should live elsewhere).`,
    );
  }
}

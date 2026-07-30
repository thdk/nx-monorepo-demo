import { type Tree, names } from '@nx/devkit';
import type { SkillGeneratorSchema } from './schema';
import { skillNameProblems } from '../../skill-name';
import { resolvePluginFolder } from '../shared';
import { addSkillToReadme } from '../readme';

export default async function skillGenerator(
  tree: Tree,
  options: SkillGeneratorSchema,
): Promise<void> {
  const folder = resolvePluginFolder(tree, options.project);
  if (!folder) {
    throw new Error(
      `No plugin found for "${options.project}" (looked for a folder with .claude-plugin/plugin.json, under the configured plugins root, and in the marketplace).`,
    );
  }

  const skillName = names(options.name).fileName; // kebab-case
  const problems = skillNameProblems(skillName);
  if (problems.length) {
    throw new Error(
      `Invalid skill name "${skillName}":\n- ${problems.join('\n- ')}`,
    );
  }

  const skillDir = `${folder}/skills/${skillName}`;
  if (tree.exists(skillDir)) {
    throw new Error(`${skillDir} already exists — pick a different name.`);
  }

  // The default passes every description lint rule (third person, specific, "use when").
  const description = (
    options.description ??
    `Use when replacing this placeholder with the real trigger conditions for the ${skillName} skill.`
  ).replace(/\s*\n\s*/g, ' ');

  const title = skillName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  tree.write(
    `${skillDir}/SKILL.md`,
    [
      '---',
      `name: ${skillName}`,
      `description: ${yamlValue(description)}`,
      ...(options.userInvocable ? ['user-invocable: true'] : []),
      '---',
      '',
      `# ${title}`,
      '',
      'Replace this starter body: describe the workflow the agent should follow when the skill triggers.',
      '',
    ].join('\n'),
  );

  addSkillToReadme(tree, folder, skillName, description);

  if (!description.toLowerCase().includes('use when')) {
    console.warn(
      `The description does not contain "use when" — lint will warn (F011).`,
    );
  }
  console.log(`Added skill "${skillName}" to ${folder}/skills.`);
}

// Plain YAML scalars break on `:`/`#`/quotes — single-quote (and escape) when needed.
function yamlValue(value: string): string {
  return /[:#'"[\]{}]|^[\s&*?|>%@`!-]/.test(value)
    ? `'${value.replace(/'/g, "''")}'`
    : value;
}

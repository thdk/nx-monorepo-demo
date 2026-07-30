import { type Tree, readJson } from '@nx/devkit';

// Lint rule F010 wants every skill listed as `<name>` in its plugin's README.
// These helpers keep the `## Skills` bullet list in sync when skills are
// added (skill generator) or moved between plugins (move-skill generator).

export function addSkillToReadme(
  tree: Tree,
  folder: string,
  skillName: string,
  description: string,
): void {
  const readmePath = `${folder}/README.md`;
  const bullet = `- \`${skillName}\`: ${description}`;

  if (!tree.exists(readmePath)) {
    const pluginName =
      readJson<{ name?: string }>(tree, `${folder}/.claude-plugin/plugin.json`)
        .name ?? folder;
    tree.write(
      readmePath,
      [`# ${pluginName}`, '', '## Skills', '', bullet, ''].join('\n'),
    );
    return;
  }

  const content = tree.read(readmePath, 'utf-8') ?? '';
  if (content.includes(`\`${skillName}\``)) return; // already listed

  const lines = content.split('\n');
  const heading = lines.findIndex((l) => /^##\s+Skills\b/i.test(l));
  if (heading === -1) {
    tree.write(
      readmePath,
      `${content.replace(/\n+$/, '')}\n\n## Skills\n\n${bullet}\n`,
    );
    return;
  }

  // Append after the section's last bullet, or right below the heading (+blank lines).
  let insertAt = heading + 1;
  while (insertAt < lines.length && lines[insertAt].trim() === '') insertAt++;
  for (let i = heading + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    if (/^\s*-\s/.test(lines[i])) insertAt = i + 1;
  }
  lines.splice(insertAt, 0, bullet);
  tree.write(readmePath, lines.join('\n'));
}

export function removeSkillFromReadme(
  tree: Tree,
  folder: string,
  skillName: string,
): void {
  const readmePath = `${folder}/README.md`;
  if (!tree.exists(readmePath)) return;
  const lines = (tree.read(readmePath, 'utf-8') ?? '').split('\n');
  const bulletRe = new RegExp(`^\\s*-\\s+\`${skillName}\`(\\s*[:—-]|\\s*$)`);
  const kept = lines.filter((l) => !bulletRe.test(l));
  if (kept.length !== lines.length) {
    tree.write(readmePath, kept.join('\n'));
  }
}

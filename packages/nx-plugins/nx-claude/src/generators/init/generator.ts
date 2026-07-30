import {
  type GeneratorCallback,
  type Tree,
  joinPathFragments,
} from '@nx/devkit';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  type Stats,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { InitGeneratorSchema } from './schema';
import { SKILL_SUBDIR, installSkill, shippedSkillDir } from './install-skill';

export default async function initGenerator(
  tree: Tree,
  options: InitGeneratorSchema,
): Promise<void | GeneratorCallback> {
  const skillDir = (options.skillDir ?? '.claude/skills').replace(
    /^\.?\/+|\/+$/g,
    '',
  );

  // Default is opt-out: `nx add` in a non-interactive shell (CI) installs nothing.
  // Interactive runs hit the schema's x-prompt; pass `--skill` to force it.
  if (!options.skill) {
    console.log(
      'nx-claude initialized. Re-run with --skill to install the usage skill: ' +
        'nx g @thdk/nx-claude:init --skill',
    );
    return;
  }

  // --link: a symlink can't be modeled in the Nx Tree, so create it in a post-generator
  // callback via real fs. Skipped under --dry-run (callbacks don't run then).
  if (options.link) {
    return () => linkSkill(tree, skillDir);
  }

  const { status, dest } = installSkill(tree, skillDir);
  logStatus(status, dest);
}

function logStatus(status: string, dest: string): void {
  switch (status) {
    case 'installed':
      console.log(`Installed the nx-claude usage skill at ${dest}.`);
      break;
    case 'updated':
      console.log(`Updated the nx-claude usage skill at ${dest}.`);
      break;
    case 'unchanged':
      console.log(`The nx-claude usage skill at ${dest} is already up to date.`);
      break;
    case 'skipped-modified':
      console.warn(
        `${dest} was edited locally — left as-is. Delete it and re-run to take the shipped version.`,
      );
      break;
    case 'skipped-foreign':
      console.warn(
        `${dest} exists and is not managed by @thdk/nx-claude — left as-is.`,
      );
      break;
  }
}

// Symlink <skillDir>/nx-claude → the shipped skill dir in node_modules. Refuses to replace a
// real directory (only ever removes a prior symlink), so a copied install is never destroyed.
function linkSkill(tree: Tree, skillDir: string): void {
  const linkPath = join(tree.root, skillDir, SKILL_SUBDIR);
  const target = shippedSkillDir();
  mkdirSync(dirname(linkPath), { recursive: true });

  let existing: Stats | undefined;
  try {
    existing = lstatSync(linkPath);
  } catch {
    existing = undefined;
  }
  if (existing) {
    if (existing.isSymbolicLink()) {
      rmSync(linkPath);
    } else {
      console.warn(
        `${skillDir}/${SKILL_SUBDIR} exists and is not a symlink — left as-is. Delete it and re-run with --link.`,
      );
      return;
    }
  }

  // 'junction' needs an absolute target (we have one) and avoids the Windows privilege
  // requirement of 'dir' symlinks; the type arg is ignored on POSIX.
  symlinkSync(target, linkPath, 'junction');
  console.log(
    `Linked ${joinPathFragments(skillDir, SKILL_SUBDIR)} → ${target}.` +
      (existsSync(join(linkPath, 'SKILL.md')) ? '' : ' (target has no SKILL.md?)'),
  );
}

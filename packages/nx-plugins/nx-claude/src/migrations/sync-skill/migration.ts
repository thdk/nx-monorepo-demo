import type { Tree } from '@nx/devkit';
import { installSkill } from '../../generators/init/install-skill';

// `nx migrate` runs this on version bumps. It refreshes an already-installed nx-claude usage
// skill to the version shipped with this release — the copy's answer to symlink auto-sync.
//
// onlyIfPresent: never installs for workspaces that didn't opt in, and installSkill leaves any
// user-edited copy untouched. Only the default .claude/skills location is synced; workspaces that
// installed into a custom --skillDir should re-run `nx g @thdk/nx-claude:init --skill` after upgrade.
export default async function syncUsageSkill(tree: Tree): Promise<void> {
  const { status, dest } = installSkill(tree, '.claude/skills', {
    onlyIfPresent: true,
  });
  if (status === 'updated') {
    console.log(`Refreshed the nx-claude usage skill at ${dest}.`);
  } else if (status === 'skipped-modified') {
    console.warn(
      `${dest} was edited locally — left as-is. Re-run \`nx g @thdk/nx-claude:init --skill\` to take the shipped version.`,
    );
  }
}

import { releaseVersion } from 'nx/release';
import yargs from 'yargs';
import { $ } from 'zx';

import { output } from '@nx/devkit';

const options = await yargs(process.argv.slice(2))
  .version(false) // don't use the default meaning of version in yargs
  .option('dry-run', {
    alias: 'd',
    description:
      'Whether or not to perform a dry-run of the release process, defaults to true',
    type: 'boolean',
    default: true,
  })
  .option('verbose', {
    description: 'Whether or not to enable verbose logging, defaults to false',
    type: 'boolean',
    default: false,
  })
  .option('preid', {
    description:
      'Example 3.0.3.{preid}.0 | Can be used for a beta / canary release. Useful to publish from pull request pipelines.',
    type: 'string',
  })
  .option('git-push', {
    description:
      'Whether or not to push changes to git remote, defaults to true',
    type: 'boolean',
    default: true,
  })
  .option('git-tag', {
    description: 'Whether or not to create git tags, defaults to true',
    type: 'boolean',
    default: true,
  })
  .option('git-commit', {
    description: 'Whether or not to create git commits, defaults to true',
    type: 'boolean',
    default: true,
  })
  .parseAsync();

// Abort if git has uncommitted changes
try {
  await $`git diff-index --quiet HEAD --`;
} catch {
  if (!options.dryRun) {
    output.warn({
      title: 'Uncommitted changes',
      bodyLines: [
        'Uncommitted changes found. Please commit or stash your changes before running the release script.',
      ],
    });

    process.exit(1);
  } else {
    output.note({
      title: 'Uncommitted changes',
      bodyLines: [
        'Uncommitted changes found. Changes will need to be stashed or committed before actual release. Proceeding with dry-run.',
      ],
    });
  }
}

// Release group: releases
//   Make sure to run group as final version group since it will update the lock file
//   with all changes from other groups as well.
await releaseVersion({
  specifier: options.preid ? 'preminor' : 'minor',
  dryRun: options.dryRun,
  verbose: options.verbose,
  stageChanges: false,
  gitCommit: false,
  gitTag: options.gitTag,
  gitPush: false,
  gitRemote: 'origin',
  groups: ['releases'],
  preid: options.preid,
  generatorOptionsOverrides: {
    skipLockFileUpdate: true,
  },
});

if (!options.dryRun) {
  await $`npm install --package-lock-only`;

  if (options.gitCommit) {
    await $`git add .`;
    await $`git commit -m "chore: release"`;
  }

  if (options.gitPush) {
    await $`git push --follow-tags`;
  }
}

process.exit(0);

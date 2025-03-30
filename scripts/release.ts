import { releaseVersion } from 'nx/release';
import yargs from 'yargs';

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
  .parseAsync();

// Release group: releases
//   Make sure to run group as final version group since it will update the lock file
//   with all changes from other groups as well.
await releaseVersion({
  specifier: options.preid ? 'preminor' : 'minor',
  dryRun: options.dryRun,
  verbose: options.verbose,
  gitCommit: true,
  gitTag: true,
  gitPush: true,
  gitRemote: 'origin',
  stageChanges: true,
  groups: ['releases'],
  preid: options.preid,
  generatorOptionsOverrides: {
    skipLockFileUpdate: false,
  },
});

process.exit(0);

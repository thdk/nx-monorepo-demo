#!/usr/bin/env node

import { releaseChangelog, releasePublish, releaseVersion } from 'nx/release';
import yargs from 'yargs';
import { $ } from 'zx';

import { output } from '@nx/devkit';
import {
  filterVersionedProjects,
  getProjectsToVersion,
} from '../src/utils/nx-release';
import { exec } from '../src/utils/exec';

const program = async () => {
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
      description:
        'Whether or not to enable verbose logging, defaults to false',
      type: 'boolean',
      default: false,
    })
    .option('changelogs', {
      description:
        'Whether or not project changelogs should be generated, defaults to false',
      type: 'boolean',
      default: false,
    })
    .option('distTag', {
      description:
        'Which npm dist tag to use when publishing, defaults to next',
      type: 'string',
      default: 'next',
    })
    .option('preid', {
      description:
        'Example 3.0.3.{preid}.0 | Can be used for a beta / canary release. Useful to publish from pull request pipelines or release branches.',
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
    .option('projects', {
      description: 'A list of projects to version, defaults to all projects',
      type: 'array',
      default: [] as string[],
      string: true,
    })
    .option('groups', {
      description:
        'List of release groups to version, defaults to all release groups',
      type: 'array',
      choices: ['packages', 'applications', 'releases'],
      default: ['packages', 'applications', 'releases'],
      string: true,
    })
    .option('specifier', {
      description:
        'Version specifier to use for the release, defaults to minor. Can be used to override the default calculated or fixed version specifier.',
      type: 'string',
      string: true,
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

  // Release group: applications
  if (options.groups.includes('applications')) {
    const applicationsToVersion = await getProjectsToVersion({
      tag: 'deployable',
      // If a specifier is manually provided, we will use it to version all applications (or those filtered by the --projects flag)
      // otherwise we will only version the affected applications
      affected: !options.specifier,
      projects: options.projects,
    });

    if (applicationsToVersion.length) {
      output.logSingleLine(
        `Version applications. ${
          options.dryRun ? `${output.colors.red('[dry-run]')}` : ''
        }`
      );

      const versionResult = await releaseVersion({
        specifier: options.specifier ?? (options.preid ? 'preminor' : 'minor'), // always bump the minor version for the applications group
        dryRun: options.dryRun,
        verbose: options.verbose,
        gitCommit: false,
        gitTag: true,
        gitPush: false,
        stageChanges: false,
        projects: applicationsToVersion,
        groups: ['applications'],
        preid: options.preid,
      });

      const versionedApplications = filterVersionedProjects(versionResult);
      if (options.changelogs && versionedApplications.length) {
        await releaseChangelog({
          versionData: versionResult.projectsVersionData,
          dryRun: options.dryRun,
          verbose: options.verbose,
          projects: versionedApplications,
          gitCommit: false,
          gitTag: false,
          gitPush: false,
        });
      } else {
        output.log({
          title: 'Application changelogs',
          bodyLines: [
            applicationsToVersion.length
              ? 'Skipping application changelog generation. Use --changelogs to enable changelog generation.'
              : 'No versioned applications found. Changelog generation skipped.',
          ],
        });
      }
    } else {
      output.log({
        title: 'No applications to version',
        bodyLines: [
          'No applications are affected. Skipping application versioning.',
        ],
      });
    }
  } else {
    output.logSingleLine(
      `Version applications: ${output.colors.gray('[skipped]')}`
    );
  }

  // Release group: packages
  if (options.groups.includes('packages')) {
    const versionResult = await releaseVersion({
      dryRun: options.dryRun,
      verbose: options.verbose,
      gitCommit: false,
      gitTag: true,
      gitPush: false,
      stageChanges: false,
      preid: options.preid,
      groups: ['packages'],
      projects: options.projects, // TODO: check if the release group is configured to be independent, and ignore the projects option in case of fixed project relationship
    });

    // Find the projects that have received a version bump
    const versionedProjects = filterVersionedProjects(versionResult);

    if (options.changelogs && versionedProjects.length > 0) {
      await releaseChangelog({
        versionData: versionResult.projectsVersionData,
        dryRun: options.dryRun,
        verbose: options.verbose,
        projects: versionedProjects,
        gitCommit: false,
        gitTag: false,
        gitPush: false,
      });
    } else {
      output.log({
        title: 'Package changelogs',
        bodyLines: [
          versionedProjects.length
            ? 'Skipping changelog generation. Use --changelogs to enable changelog generation.'
            : 'No versioned projects found. Changelog generation skipped.',
        ],
      });
    }

    // Publish packages when required
    if (!versionedProjects.length) {
      output.log({
        title: 'No versioned projects',
        bodyLines: ['No versioned projects found. Skipping publish.'],
      });
    } else {
      const publishResults = await releasePublish({
        dryRun: options.dryRun,
        verbose: options.verbose,
        groups: ['packages'],
        tag: options.distTag,
        projects: versionedProjects,
      });

      // publishResults contains a map of project names and their exit codes
      if (!Object.values(publishResults).every((result) => result.code === 0)) {
        throw new Error(
          `Error publishing packages. Some packages failed to publish. See the logs for more details.`
        );
      }
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
    projects: options.projects,
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
  } else if (options.gitCommit || options.gitPush) {
    output.warn({
      title: 'Skipping Git Operations',
      bodyLines: [
        'Git operations are skipped in dry-run mode. If any changes were made they will not be commited nor will any tags be pushed.',
      ],
    });
  }
};

exec('release', program);

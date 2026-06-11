// @ts-check

/** @type {import("syncpack").RcFile} */
const config = {
  versionGroups: [
    {
      // Use workspace protocol for internal @thdk packages
      dependencies: ['@thdk/**'],
      dependencyTypes: ['prod', 'dev', 'peer'],
      pinVersion: 'workspace:*',
    },
    {
      label:
        '@nx/* packages are only allowed in root, @thdk/nx-terraform, and @thdk/nx-pnpm-deploy',
      dependencies: ['@nx/**', 'nx'],
      packages: [
        '!@thdk/source',
        '!@thdk/nx-terraform',
        '!@thdk/nx-pnpm-deploy',
        '!@thdk/scripts',
        '!@thdk/nx-ts',
      ],
      isBanned: true,
    },
  ],
  semverGroups: [
    {
      // packages that are published and installed by other libs/app not managed in this repo shouldn't pin version of any dependency
      range: '^',
      dependencyTypes: ['prod', 'dev'],
      dependencies: ['**'],
      packages: ['@thdk/lib-c'],
    },
    // all other dependencies should be locked to the exact same version
    {
      range: '',
      dependencyTypes: [
        'dev',
        'prod',
        'resolutions',
        'overrides',
        'pnpmOverrides',
        'local',
      ],
    },
  ],
  sortFirst: [
    'name',
    'description',
    'version',
    'private',
    'author',
    'license',
    'type',
    'main',
    'module',
    'types',
    'exports',
    'nx',
    'scripts',
  ],
};

module.exports = config;

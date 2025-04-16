// @ts-check

/** @type {import("syncpack").RcFile} */
const config = {
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

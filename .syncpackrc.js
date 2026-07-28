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
      // A published plugin's `nx` / `@nx/*` peer range is an author-controlled
      // compatibility contract — don't align its version to the workspace's nx.
      dependencies: ['@nx/**', 'nx'],
      dependencyTypes: ['peer'],
      isIgnored: true,
    },
    {
      label:
        '@nx/* packages are only allowed in root and custom nx plugins, not in any other libs/apps',
      dependencies: ['@nx/**', 'nx'],
      packages: [
        '!@thdk/source',
        '!@thdk/nx-terraform',
        '!@thdk/nx-pnpm-deploy',
        '!@thdk/scripts',
        '!@thdk/nx-ts',
        '!@thdk/nx-claude',
      ],
      isBanned: true,
    },
  ],
  semverGroups: [
    {
      // A published plugin's `nx` / `@nx/*` peer range is a deliberate compatibility
      // contract (e.g. ">=23.1.0 <25.0.0"); leave it under author control rather than
      // forcing "^" or aligning it to the workspace's own nx version.
      dependencies: ['@nx/**', 'nx'],
      dependencyTypes: ['peer'],
      isIgnored: true,
    },
    {
      // Published packages (consumed by other repos) must not pin their runtime deps
      // to exact versions — use "^". Only prod deps ship, so dev/peer are excluded:
      // devDeps are stripped on publish, and peer ranges (e.g. react ">=19.0.0") are
      // deliberately permissive and must not be narrowed.
      range: '^',
      dependencyTypes: ['prod'],
      dependencies: ['**'],
      packages: [
        '@thdk/lib-c',
        '@thdk/nx-claude',
        '@thdk/react-components-css-vite',
      ],
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
  sortAz: [
    'contributors',
    'dependencies',
    'devDependencies',
    'keywords',
    'peerDependencies',
    'scripts',
  ],
  sortExports: ['types', 'development', 'import', 'require', 'default'],
  sortPackages: true,
};

module.exports = config;

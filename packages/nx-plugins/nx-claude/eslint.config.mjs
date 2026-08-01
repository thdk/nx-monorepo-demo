import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          // Generator template files (scaffolded into consumer projects) import payload
          // deps like react/marked that are NOT dependencies of the plugin itself.
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs}',
            '{projectRoot}/src/generators/*/files/**',
          ],
          // Lazily installed at generation time via ensurePackage (pinned to the consumer
          // workspace's nx version); only referenced as a type (typeof import('@nx/react')).
          ignoredDependencies: ['@nx/react'],
          runtimeHelpers: ['tslib'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];

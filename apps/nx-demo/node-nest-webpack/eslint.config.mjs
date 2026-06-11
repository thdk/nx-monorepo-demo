import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          runtimeHelpers: ['tslib'],
          ignoredDependencies: ['@fastify/view', '@fastify/static', 'fastify'],
        },
      ],
    },
  },
];

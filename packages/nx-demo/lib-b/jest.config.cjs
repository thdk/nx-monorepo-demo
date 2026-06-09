const { readFileSync } = require('fs');
const path = require('path');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(path.join(__dirname, '.spec.swcrc'), 'utf-8')
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@thdk/lib-b',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};

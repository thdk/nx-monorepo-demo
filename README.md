# Nx Monorepo Demo

[![CI](https://github.com/thdk/nx-monorepo-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/thdk/nx-monorepo-demo/actions/workflows/ci.yml)

Welcome to my Nx Monorepo Demo! This repository showcases how Nx can be leveraged to manage a monorepo effectively, combining libraries, applications, and infrastructure projects. The goal is to demonstrate the versatility and power of Nx in handling diverse setups.

## Features

- **Centralized Management**: Manage multiple projects, including applications, libraries, and infrastructure, within a single repository.
- **Custom Nx Plugin**: Includes a custom Nx plugin for Terraform projects, enabling seamless integration and management of infrastructure-as-code.
- **Optimized Build System**: Utilize Nx's caching and dependency graph to optimize builds and CI/CD workflows.
- **Diverse Project Types**: Support for Node.js, React, and Terraform projects, showcasing Nx's flexibility.

## Projects in this Repository

### Applications

#### app-1

- **Environment**: Node.js
- **Framework**: Fastify
- **Module Type**: CommonJS
- **Bundler**: Esbuild
  - Bundle: `true`
  - Third-party: `true`
- **Local Dependencies**:
  - lib-a
  - lib-b (ESM module imported in CJS app)
  - lib-c

#### react-app-1

- **Environment**: Browser
- **Framework**: React
- **Module Type**: ES Module
- **Bundler**: Vite
- **E2E Testing**: Playwright

### Libraries

#### lib-a

- **Bundler**: TypeScript Compiler (tsc)
- **Published**: No

#### lib-b

- **Bundler**: Esbuild
- **Published**: No

#### lib-c

- **Bundler**: TypeScript Compiler (tsc)
- **Published**: Yes

### Terraform Projects

#### bootstrap-infra

- **Description**: Infrastructure bootstrap project leveraging Terraform.
- **Documentation**: [bootstrap-infra README](./terraform/bootstrap-infra/README.md)

### Other Projects

#### scripts

Utility scripts for managing projects in this repository.

- `release.ts`: Automates release processes.
- `docker-build.ts`: Handles Docker image builds.

#### tools/nx-terraform

Custom Nx package to manage Terraform targets for projects containing Terraform files.

- **Documentation**: [nx-terraform README](./tools/nx-terraform/README.md)

#### releases/thdk

A project dedicated to maintaining a unified version number across multiple independently versioned and deployed applications.

## Development

### Setup

```sh
# Install dependencies
npm install
```

### Running Targets

```sh
# Run all relevant targets (build, lint, test, ...) for every project
npx nx run-all

# Run all relevant targets (build, lint, test, ...) for affected projects only
npx nx run-affected
```

## Why Nx?

Nx is a powerful tool for managing monorepos, offering features like:

- **Dependency Graph**: Visualize and understand project dependencies.
- **Task Scheduling**: Efficiently run tasks based on project dependencies.
- **Caching**: Speed up builds and tests with smart caching.
- **Extensibility**: Create custom plugins like `nx-terraform` to extend functionality.

This repository demonstrates how Nx can be used to manage diverse projects, optimize workflows, and scale development efficiently.

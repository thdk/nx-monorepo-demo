# Nx Monorepo Demo

[![CI](https://github.com/thdk/nx-monorepo-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/thdk/nx-monorepo-demo/actions/workflows/ci.yml)

Welcome to my Nx Monorepo Demo! This repository showcases how Nx can be leveraged to manage a monorepo effectively, combining libraries, applications, and infrastructure projects. The goal is to demonstrate the versatility and power of Nx in handling diverse setups.

## Features

- **Diverse frameworks and platforms**: Node.js (Fastify, NestJS, plain tsc), React (Vite SPA, React Router with SSR), and Terraform — with more (e.g. Next.js) available on request.
- **Centralized Management**: Manage multiple projects, including applications, libraries, and infrastructure, within a single repository.
- **Custom Nx Plugin**: A custom Nx plugin (`@thdk/nx-terraform`) auto-discovers `main.tf` files and infers Terraform targets, making IaC a first-class citizen in the Nx dependency graph.
- **End-to-end release-to-deploy**: `nx release` creates git tags that Terraform reads to resolve Docker image versions — no manual version wiring between CI and deployment.
- **Mixed module formats**: Intentionally mixes CJS and ESM across apps and libs with different bundlers (esbuild, webpack, Vite, tsc) to exercise real-world module interop.
- **Bundled vs. unbundled Docker**: Side-by-side comparison of fully bundled (no runtime install) and unbundled (multi-stage with `pnpm --prod install`) container strategies.
- **Three-tier release groups**: `apps` (Docker images), `packages` (npm), and `releases` (a unified version tracker via a phantom project with no code).

## Projects in this Repository

### Applications

#### app-1

- **Environment**: Node.js
- **Framework**: Fastify
- **Module Type**: CommonJS
- **Bundler**: Esbuild
  - Bundle: `true`
  - Third-party: `true`
- **Docker**: Single-stage — fully bundled, no `npm install` in container
- **Local Dependencies**:
  - lib-a
  - lib-b (ESM module imported in CJS app)
  - lib-c

#### app-2

- **Environment**: Node.js
- **Framework**: Fastify
- **Module Type**: CommonJS
- **Bundler**: Esbuild
  - Bundle: `false`
  - Third-party: `true`
- **Docker**: Multi-stage — runs `pnpm --prod install` in container (unbundled)
- **Local Dependencies**:
  - lib-a
  - lib-b
  - lib-c

#### node-nest-webpack

- **Environment**: Node.js
- **Framework**: NestJS
- **Module Type**: CommonJS
- **Bundler**: Webpack (via `NxAppWebpackPlugin`)
- **Docker**: Multi-stage — runs `pnpm --prod install` in container
- **Local Dependencies**:
  - lib-a
  - lib-b
  - lib-c
  - nest-lib-a (imported as TypeScript source)

#### node-fastify-tsc

- **Environment**: Node.js
- **Framework**: Fastify
- **Module Type**: CommonJS
- **Bundler**: TypeScript Compiler (tsc)
- **Docker**: Multi-stage — runs `pnpm --prod install` in container (unbundled)
- **Local Dependencies**:
  - lib-a
  - lib-b
  - lib-c

#### node-tsc

- **Environment**: Node.js
- **Framework**: None (plain Node.js script)
- **Module Type**: CommonJS
- **Bundler**: TypeScript Compiler (tsc)
- **Docker**: None
- **Local Dependencies**:
  - lib-b

#### react-app-1

- **Environment**: Browser
- **Framework**: React
- **Module Type**: ES Module
- **Bundler**: Vite
- **E2E Testing**: Playwright

#### react-router-app-1

- **Environment**: Browser
- **Framework**: React router (with SSR)
- **Module Type**: ES Module
- **Bundler**: Vite

### Libraries

#### lib-a

- **Bundler**: TypeScript Compiler (tsc)
- **Published**: No
- **type:** cjs

#### lib-b

- **Bundler**: Esbuild
- **Published**: No
- **type:** module

#### lib-c

- **Bundler**: TypeScript Compiler (tsc)
- **Published**: Yes
- **type:** cjs

#### nest-lib-a

- **Bundler**: None — imported as TypeScript source by consuming apps
- **Framework**: NestJS
- **Published**: No

#### react-router-app-1-e2e

- **Framework**: Playwright
- **Type**: End-to-end tests for `react-router-app-1`

### Terraform Projects

#### bootstrap-infra

- **Description**: Infrastructure bootstrap project — enables GCP services, creates Artifact Registry, and sets up IAM.
- **Documentation**: [bootstrap-infra README](./terraform/bootstrap-infra/README.md)

#### domain-a-infra

- **Description**: Deploys `app-1` and `app-2` to Cloud Run. Reads image versions from git tags created by `nx release`.
- **Configurations**: `development`, `production`

#### domain-b-infra

- **Description**: Deploys `app-3` to Cloud Run. Same pattern as `domain-a-infra`.
- **Configurations**: `development`, `production`

#### modules/cloud-run-service

- **Description**: Reusable Terraform module for Cloud Run v2 services (scaling, resource limits, env vars, public access).

#### modules/data-git-tag

- **Description**: Custom data source that resolves the latest git tag matching a pattern (e.g. `app-1@*`), bridging `nx release` tags to Terraform-managed deployments.

### Other Projects

#### scripts

Utility scripts for managing projects in this repository.

- `release.ts`: Automates release processes.

#### tools/nx-terraform

Custom Nx package to manage Terraform targets for projects containing Terraform files.

- **Documentation**: [nx-terraform README](./tools/nx-terraform/README.md)

#### releases/thdk

A project dedicated to maintaining a unified version number across multiple independently versioned and deployed applications.

## Development

### Setup

```sh
# Install tools
asdf install
# Install dependencies
pnpm install
```

### Running Targets

```sh
# Run all relevant targets (build, lint, test, ...) for every project
pnpm exec nx run-all

# Run all relevant targets (build, lint, test, ...) for affected projects only
pnpm exec nx run-affected
```

### Syncpack

This is an external tool not related with nx but works very well together with nx repos.

Why syncpack?

- ensures all packages use the same version for dependencies
- ensures app dependencies use the same range specifier

Provided commands in the repo:

```sh
pnpm exec nx syncpack
pnpm exec nx syncpack-fix
```

However these are automatically run for you in CI and will block any thing that doesn't follow the rules.

### IaC with terraform and Nx

#### Terraform project generator

Default terraform generator settigns for this repo can be found in `nx.json` under `generators.@thdk/nx-terraform.project`.

```sh
pnpm exec nx generate @thdk/nx-terraform:project domain-b-infra
```

#### Inferred targets

A custom terraform plugin will infer terraform targets for each project with a `main.tf` file.

Terraform state for this repo is kept in a GCP bucket for which you must be authenticated if you would want to run this locally (CI authorizes with GCP using Workload Identity Federation)

```sh
gcloud auth login
gcloud auth application-default login

# if using docker
gcloud auth configure-docker
# if using podman (aliased as docker)
gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin https://europe-west1-docker.pkg.dev
```

```sh
# init target is a dependency of other terraform targets so usually you do not have to run it explicitly
pnpm exec nx run-many --target terraform-init

pnpm exec nx run-many --target terraform-plan

# currently will use --auto-approve so use with caution after inspecting output of terraform-plan command
# TODO: Make this target interactive so user can manually confirm the action for each project.
pnpm exec nx run-many --target terraform-apply

```

## Version & release

This is all managed by nx release.

Docs:

- [Configuring nx release in `nx.json`](https://nx.dev/docs/reference/nx-json#release)
- [Release npm packages](https://nx.dev/docs/guides/nx-release/release-npm-packages)
- [Release docker images](https://nx.dev/docs/guides/nx-release/release-docker-images)
- [More nx release guides](https://nx.dev/docs/guides/nx-release)

Next the terraform setup will read the version from git tags for each affected application and
update the deployed service to use that new docker image.

## Future improvements

- Dependencies should be managed by each project itself and no longer add each dependency to root `package.json`.

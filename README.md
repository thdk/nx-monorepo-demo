# Nx Monorepo Demo

[![CI](https://github.com/thdk/nx-monorepo-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/thdk/nx-monorepo-demo/actions/workflows/ci.yml)

A worked example of an Nx monorepo combining real product code (a published package, custom Nx plugins) with deliberately diverse demo apps that exercise different bundlers, module formats, and deployment strategies — all wired up to a single `nx release` → Docker → Terraform deploy flow.

## Workspace layout

Projects are grouped by purpose, with a scope subfolder when more than one project shares a domain. Each project is tagged with `scope:<domain>` so [`@nx/enforce-module-boundaries`](https://nx.dev/features/enforce-module-boundaries) can restrict cross-domain imports.

```
apps/
  nx-demo/                       Demonstration apps                  → ./apps/nx-demo/README.md
packages/
  nx-demo/                       Demonstration libraries             → ./packages/nx-demo/README.md
  nx-plugins/                    Custom Nx plugins                   → ./packages/nx-plugins/README.md
  skill-eval/                    Real published package (@thdk/skill-eval)
tools/                           Workspace-internal tooling (never published)
terraform/
  nx-demo/                       IaC for the demo                    → ./terraform/nx-demo/README.md
releases/                        Phantom projects for unified version tracking
scripts/                         Workspace utility scripts
```

**Tags**

| Scope               | Folder                               | Published                       |
| ------------------- | ------------------------------------ | ------------------------------- |
| `scope:nx-demo`     | `apps/nx-demo/`, `packages/nx-demo/`, `terraform/nx-demo/` | `lib-c` only (showcase) |
| `scope:nx-plugins`  | `packages/nx-plugins/`               | private (for now)               |
| `scope:skill-eval`  | `packages/skill-eval/`               | yes                             |

Apps that get a Docker image also carry `deployable:docker`. Published packages carry `npm:public` (auto-inferred from `package.json` `private` flag).

## What this repo demonstrates

- **Diverse frameworks and platforms** — Node.js (Fastify, NestJS, plain tsc), React (Vite SPA, React Router with SSR), and Terraform.
- **Custom Nx plugin for IaC** — `@thdk/nx-terraform` auto-discovers `main.tf` files and infers Terraform targets, making IaC a first-class citizen in the Nx graph.
- **End-to-end release-to-deploy** — `nx release` creates git tags; Terraform reads them to resolve Docker image versions. No manual version wiring between CI and deployment.
- **Mixed module formats** — intentionally mixes CJS and ESM across apps and libs with different bundlers (esbuild, webpack, Vite, tsc) to exercise real-world module interop.
- **Bundled vs. unbundled Docker** — side-by-side comparison of fully bundled single-stage and unbundled multi-stage `pnpm --prod install` strategies.
- **Three-tier release groups** — `apps` (Docker images), `packages` (npm), and `releases` (a unified version tracker via a phantom project with no code).

## Setup

```sh
asdf install       # install pinned toolchain versions
pnpm install
```

## Running targets

```sh
# All relevant targets (build, lint, test, ...) for every project
pnpm exec nx run-all

# Only affected projects
pnpm exec nx run-affected
```

## Syncpack

External tool, not Nx-specific, but plays well with Nx repos. Ensures every package uses the same version for shared dependencies and the same range specifier across apps.

```sh
pnpm exec nx syncpack       # check
pnpm exec nx syncpack-fix   # auto-fix
```

CI runs `syncpack` on every PR and blocks anything that drifts.

## Version & release

Managed by `nx release`. See `nx.json` for release-group config (`apps`, `packages`, `releases`).

- [Configuring nx release in `nx.json`](https://nx.dev/docs/reference/nx-json#release)
- [Release npm packages](https://nx.dev/docs/guides/nx-release/release-npm-packages)
- [Release docker images](https://nx.dev/docs/guides/nx-release/release-docker-images)
- [More nx release guides](https://nx.dev/docs/guides/nx-release)

After versioning, the Terraform deploy reads the new image tag from git and updates the deployed Cloud Run service — see [`terraform/nx-demo/README.md`](./terraform/nx-demo/README.md) for the IaC side.

## Future improvements

- Dependencies should be managed by each project itself instead of being added to the root `package.json`.

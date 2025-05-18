# Nx monorepo demo

[![CI](https://github.com/thdk/nx-monorepo-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/thdk/nx-monorepo-demo/actions/workflows/ci.yml)

This is a repo with the sole purpose to demo how Nx can be used to manage a monorepo.
Idea is to add sample libraries and applications using all kinds of different setups.

## Projects in this repo

### Applications

#### app-1

- **env:**: node
- **framework:**: fastify
- **type:** / (commonjs)
- **bundler:** esbuild
  - bundle: `true`
  - thirdParty: `true`
- **local dependencies:**
  - lib-a
  - lib-b (esm module imported in cjs app, hooray!)
  - lib-c
- **local dependants:**

#### react-app-1

- **env:**: browser
- **framework:** react
- **type**: (module)
- **bundler:** vite
- **e2e target:** yes (playwright)
- **local dependencies:**
- **local dependants:**

### Libraries

#### lib-a

- **bundler:** tsc
- **published:** false
- **local dependencies:**
- **local dependants:**

#### lib-b

- **bundler:** esbuild
- **published:** false
- **local dependencies:**
- **local dependants:**

#### lib-c

- **bundler:** tsc
- **published:** true
- **local dependencies:**
- **local dependants:**

### Other projects

#### scripts

Contains utility scripts (typescript files) for managing projects in this repo.

- `release.ts`
- `docker-build.ts`

#### tools/nx-terraform

Custom nx package to automatically terraform targets for projects containing terraform files.

See the [docs for this package](./tools/nx-terraform/README.md).

#### releases/thdk

A project dedicated to maintaining a unified version number across multiple independently versioned and deployed applications.

## Development

```sh
# Install dependencies
npm install
```

```sh
# Run all relevant targets (build, lint, test, ...) for every project
npx nx run-all

# Run all relevant targets (build, lint, test, ...) for affected projects only
npx nx run-affected
```

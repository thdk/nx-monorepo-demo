# Nx monorepo demo

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
- **local dependants:**

#### react-app-1

- **env:**: browser
- **framework:** react
- **type**: (module)
- **bundler:** vite
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

#### releases/thdk

A project with the sole function of keeping a single version across multiple applications.

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

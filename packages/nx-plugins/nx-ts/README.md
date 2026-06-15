# `@thdk/nx-ts`

Custom Nx plugin that scaffolds **TypeScript Node applications built with `tsc`** (no bundler). Optional Fastify starter, optional Dockerfile, two Docker packaging strategies.

This plugin only ships generators — it does not infer targets. Build/lint/typecheck targets on generated apps come from the workspace's existing `@nx/js/typescript` + `@nx/eslint` plugin configuration in `nx.json`.

## Generators

| Generator      | Alias | Purpose                                                                                          |
| -------------- | ----- | ------------------------------------------------------------------------------------------------ |
| `application`  | `app` | Create a new TypeScript Node app under `apps/<name>` (or a custom directory).                    |
| `setup-docker` |       | Add a Dockerfile + `deployable:docker` tag to an existing app. Used internally by `application`. |

### `application`

```sh
pnpm exec nx g @thdk/nx-ts:application <name>
# or
pnpm exec nx g @thdk/nx-ts:app <name>
```

Key options (full schema: [`src/generators/application/schema.json`](./src/generators/application/schema.json)):

| Option           | Default       | Description                                                                                                    |
| ---------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| `name`           | _required_    | Short name; also used in `@<scope>/<name>`.                                                                    |
| `directory`      | `apps/<name>` | Where to create the project.                                                                                   |
| `scope`          | `thdk`        | npm scope (without the leading `@`).                                                                           |
| `framework`      | `none`        | `none` (bare `console.log` starter) or `fastify`.                                                              |
| `docker`         | `true`        | Generate a Dockerfile and tag the project `deployable:docker`.                                                 |
| `dockerStrategy` | `pnpm-deploy` | `pnpm-deploy` (thin, single COPY, via `@thdk/nx-pnpm-deploy`) or `nx-prune` (layered, offline `pnpm install`). |
| `port`           | `3000`        | Default port baked into the Fastify starter and Dockerfile.                                                    |

What the generator produces:

1. `project.json` with a `serve` target wired to `@nx/js:node`.
2. Common files — `package.json`, `tsconfig.json`, `tsconfig.app.json`, `eslint.config.mjs`, `src/main.ts`, `src/assets/`.
3. Framework overlay (Fastify only, for now) — replaces `src/main.ts` and adds `src/app/app.ts`.
4. Framework runtime deps added to the app's `package.json` (`tslib`, and for Fastify: `fastify`, `fastify-plugin`, `@fastify/sensible`).
5. Dockerfile + `deployable:docker` tag via the `setup-docker` generator (when `docker: true`).

### `setup-docker`

```sh
pnpm exec nx g @thdk/nx-ts:setup-docker --project <project>
```

Adds a Dockerfile to an existing app and tags it `deployable:docker` so the `apps` release group picks it up.

For `nx-prune`, also:

- Wires the `prune-lockfile` → `copy-workspace-modules` → `prune` target chain on the project.
- Adds the project to `@thdk/nx-pnpm-deploy/plugin` `exclude` in `nx.json` (the two strategies are mutually exclusive).

## Why this plugin exists

The stock `@nx/node:application` generator pulls in a webpack/esbuild bundler. This workspace wants a `tsc`-only path (see `apps/nx-demo/node-fastify-tsc` and `apps/nx-demo/node-tsc`), and the Docker layering decision is workspace-specific (pick between `@thdk/nx-pnpm-deploy` and the `nx-prune` chain). The generator codifies both choices so new Node apps don't drift.

## When to publish

`private: true` today. Flip to `private: false` in `package.json` to join the `packages` release group (filtered by `tag:npm:public`, auto-inferred from the `private` flag) — no further config needed.

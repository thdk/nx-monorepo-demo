# Demo apps (`scope:nx-demo`)

Applications that exist purely to showcase Nx capabilities — different frameworks, module formats, bundlers, and Docker packaging strategies. None of these are real product code.

All apps carry `scope:nx-demo`. Apps that produce a Docker image also carry `deployable:docker` and participate in the `apps` release group. Apps that ship as a zip artifact instead carry `deployable:zip` and participate in the `lambda` release group — they get an inferred `zip` target from [`@thdk/nx-zip`](../../packages/nx-plugins/nx-zip/README.md) (see `nx.json` and root README).

## Node apps

| App                 | Framework                | Module | Bundler                        | Docker                             | Local deps                                          |
| ------------------- | ------------------------ | ------ | ------------------------------ | ---------------------------------- | --------------------------------------------------- |
| `app-1`             | Fastify                  | CJS    | esbuild                        | single-stage, fully bundled        | `lib-a`, `lib-b` (ESM in CJS), `lib-c`              |
| `app-2`             | Fastify                  | CJS    | esbuild (unbundled)            | multi-stage, `pnpm --prod install` | `lib-a`, `lib-b`, `lib-c`                           |
| `node-fastify-tsc`  | Fastify                  | CJS    | tsc                            | multi-stage, `pnpm --prod install` | `lib-a`, `lib-b`, `lib-c`                           |
| `node-nest-webpack` | NestJS                   | CJS    | webpack (`NxAppWebpackPlugin`) | multi-stage, `pnpm --prod install` | `lib-a`, `lib-b`, `lib-c`, `nest-lib-a` (TS source) |
| `node-tsc`          | none (plain Node script) | CJS    | tsc                            | none — zips to a Lambda-style artifact (`deployable:zip`) | `lib-b`                                  |

## Browser apps

| App                      | Framework          | Module | Bundler | Notes                          |
| ------------------------ | ------------------ | ------ | ------- | ------------------------------ |
| `react-app-1`            | React              | ESM    | Vite    | Playwright e2e in same project |
| `react-router-app-1`     | React Router (SSR) | ESM    | Vite    |                                |
| `react-router-app-1-e2e` | Playwright         | —      | —       | E2E for `react-router-app-1`   |

## What each combination is demonstrating

- **`app-1` vs `app-2`** — same code, bundled-with-third-party vs unbundled deploy. Side-by-side Docker comparison.
- **`app-1` importing `lib-b`** — CJS app consuming an ESM lib (real-world interop pain).
- **`node-fastify-tsc` vs `app-2`** — tsc vs esbuild for unbundled Node output.
- **`node-nest-webpack`** — NestJS + webpack, plus `nest-lib-a` consumed as TypeScript source (no build).
- **`react-app-1` vs `react-router-app-1`** — SPA vs SSR React.
- **`node-tsc`** — non-Docker deployable: tagged `deployable:zip`, it packages its pruned build output into a Lambda-style zip via `@thdk/nx-zip` instead of a container image.

## Scaffolding a new Node app

`tsc`-built Node apps (with or without Fastify, with or without Docker) are scaffolded by the [`@thdk/nx-ts`](../../packages/nx-plugins/nx-ts/README.md) plugin:

```sh
pnpm exec nx g @thdk/nx-ts:application <name>
```

See the plugin README for options (framework, Docker strategy, scope, port).

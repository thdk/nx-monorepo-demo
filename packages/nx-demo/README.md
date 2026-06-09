# Demo libraries (`scope:nx-demo`)

Libraries that exist purely to demonstrate Nx behavior across bundlers, module formats, and publishing strategies. Consumed by the apps under `apps/nx-demo/`.

All libs carry `scope:nx-demo`. `lib-c` additionally carries `npm:public` because it's used to demonstrate the npm publishing flow via `nx release`.

| Lib           | Bundler   | Module type | Published                  | Consumed by                                                             |
| ------------- | --------- | ----------- | -------------------------- | ----------------------------------------------------------------------- |
| `lib-a`       | tsc       | CJS         | no                         | `app-1`, `app-2`, `node-fastify-tsc`, `node-nest-webpack`               |
| `lib-b`       | esbuild   | ESM         | no                         | all node apps + `react-app-1` (exercises ESM-in-CJS interop)            |
| `lib-c`       | tsc       | CJS         | yes (`@thdk/lib-c`)        | `app-1`, `app-2`, `node-fastify-tsc`, `node-nest-webpack`               |
| `nest-lib-a` | none      | TS source   | no                         | `node-nest-webpack` (imported as TypeScript, not built separately)      |

## What each lib is demonstrating

- **`lib-a`** — baseline tsc-built CJS library; the boring control case.
- **`lib-b`** — esbuild-built ESM library; the interesting case (consumed by CJS apps to exercise ESM/CJS interop in different bundlers).
- **`lib-c`** — same shape as `lib-a` but published to npm. Carries `npm:public` and participates in the `packages` release group.
- **`nest-lib-a`** — no build step; consumers import the TypeScript source directly. Demonstrates the "shared TS source" pattern in NestJS workspaces.

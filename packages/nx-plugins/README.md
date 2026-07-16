# Nx plugins (`scope:nx-plugins`)

Custom Nx plugins developed inside this workspace and consumed by it. Currently all are private — they're not published to npm yet, but they're real workspace tooling, not demo code.

| Plugin                 | Purpose                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@thdk/nx-terraform`   | Auto-discovers `main.tf` files and infers Terraform targets (`init`, `plan`, `apply`, ...) per project. Also ships generators for new Terraform projects. [Details](./nx-terraform/README.md) |
| `@thdk/nx-pnpm-deploy` | Infers a `prune` target for workspace packages to support `pnpm deploy`-style packaging — copies only the project's actual dependency graph into the output dir. [Details](./nx-pnpm-deploy/README.md) |
| `@thdk/nx-zip`         | Infers a `zip` target for projects tagged `deployable:zip` — packs the build output into `{projectName}-{shortSha}.zip` (contents flattened to the zip root, Lambda-style). [Details](./nx-zip/README.md) |
| `@thdk/nx-ts`          | Generators for scaffolding `tsc`-built Node apps (optional Fastify, optional Dockerfile with pnpm-deploy or nx-prune strategy). [Details](./nx-ts/README.md)                                  |

All are registered in `nx.json` under `plugins` and pick up new projects automatically.

## When to publish

If you decide to release them to npm, flip `"private": true` to `"private": false` in the plugin's `package.json`. The `npm:public` tag is auto-inferred from the `private` flag, and the `packages` release group in `nx.json` already filters by `tag:npm:public` — so the plugin joins the release flow with no further config.

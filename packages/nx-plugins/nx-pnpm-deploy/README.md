# `@thdk/nx-pnpm-deploy`

Custom Nx plugin that **infers a `prune` target** for workspace packages, backing a `pnpm deploy`-style packaging flow. It runs `pnpm --filter=<pkg> --prod deploy`, which copies only the project's actual production dependency graph into an output folder — no bundler, no manual `node_modules` copying.

This plugin only infers a target — it ships no generators. The target is `nx:run-commands` under the hood and shells out to `pnpm`, so a `pnpm-lock.yaml` must exist at the workspace root (otherwise the plugin infers nothing).

## What it produces

For every eligible project, the plugin infers:

```jsonc
{
  "prune": {
    "executor": "nx:run-commands",
    "dependsOn": ["build"],
    "inputs": ["production", "^production"],
    "outputs": ["{projectRoot}/<outputDir>"],
    "options": {
      "cwd": "{workspaceRoot}",
      "parallel": false,
      "commands": [
        "rm -rf <projectRoot>/<outputDir>",
        "pnpm --filter=<packageName> --prod deploy <projectRoot>/<outputDir>"
      ]
    }
  }
}
```

The default target name `prune` slots into Nx's existing contract — `docker:build.dependsOn = ["build", "prune"]` — so a Dockerfile can `COPY` the pruned output in a single layer.

## Triggering: `package.json`, not `Dockerfile`

The plugin's `createNodesV2` glob matches `**/package.json`, not `**/Dockerfile`. `pnpm deploy` targets a workspace **package**, so a `package.json` is the real prerequisite. Matching on it means non-containerized deployables (e.g. `tag:deployable:zip` Lambdas that have no Dockerfile) can get a `prune` target too. `include`/`exclude` do the selecting.

## Installation

Add an entry to the `plugins` section of `nx.json`:

```jsonc
{
  "plugin": "@thdk/nx-pnpm-deploy/plugin",
  "options": {
    "include": ["tag:deployable:docker", "tag:deployable:zip", "node-tsc"],
    "exclude": ["node-nest-webpack", "node-fastify-tsc"]
  }
}
```

## Plugin options

| Option       | Default              | Description                                                                                                                                                     |
| ------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `targetName` | `prune`              | Name of the inferred target. Defaults to `prune` to match `docker:build.dependsOn`.                                                                            |
| `outputDir`  | `out`                | Output directory relative to the project root. Sits alongside Nx's `out-tsc` pattern and is easy to gitignore.                                                  |
| `include`    | `[]` (all packages)  | Restrict the target to projects matching any of these patterns. When omitted, every workspace package (any project with a `package.json`) is eligible.         |
| `exclude`    | `[]`                 | Skip projects matching any of these patterns. Applied after `include`, so it always wins.                                                                      |

### `include` / `exclude` matching

Both are forwarded directly to Nx's `findMatchingProjects`, so they accept the same syntax as `nx run-many --projects=...`:

- `"app-1"` — name
- `"apps/nx-demo/*"` — directory glob
- `"tag:deployable:docker"` — tag prefix
- `"!apps/legacy-*"` — negation (carve exceptions out of a glob)

A project is emitted when it matches `include` (or `include` is empty) **and** does not match `exclude`. Use `exclude` to opt projects out of the pnpm-deploy flow — e.g. while they still use the Nx-native prune chain (`prune-lockfile` → `copy-workspace-modules` → `prune`) that `@thdk/nx-ts`'s `nx-prune` Docker strategy wires up. The two strategies are mutually exclusive.

## Tags read from both sources

Tags and the Nx project name are merged from `project.json` **and** the inline `nx` field of `package.json`, so `findMatchingProjects` sees the same data Nx itself would.

## Running it

```sh
pnpm exec nx prune <project>
```

`prune` depends on `build`, so the build output exists before packaging.

## When to publish

`private: true` today. Flip to `private: false` in `package.json` to join the `packages` release group (filtered by `tag:npm:public`, auto-inferred from the `private` flag) — no further config needed.

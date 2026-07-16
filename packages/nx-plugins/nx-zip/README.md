# `@thdk/nx-zip`

Custom Nx plugin that **infers a `zip` target** for projects tagged `deployable:zip`. It packs the project's build output into `{projectName}-{shortSha}.zip`, with the contents flattened to the zip root (AWS Lambda layout).

This plugin only infers a target — it ships no generators. The target is `nx:run-commands` under the hood and shells out to `git` and `zip`, so both must be available on `PATH`.

## What it produces

For every eligible project, the plugin infers:

```jsonc
{
  "zip": {
    "executor": "nx:run-commands",
    "dependsOn": ["build"],
    "inputs": ["production", "^production"],
    "outputs": ["{projectRoot}/<outputDir>"],
    "options": {
      "cwd": "{workspaceRoot}",
      "parallel": false,
      "command": "sh -c '... git rev-parse --short HEAD ... cd <srcDir>; zip -qr <dest> .'"
    }
  }
}
```

The zip is written to `{projectRoot}/<outputDir>/{projectName}-{shortSha}.zip`. The short commit SHA is resolved **at run time** (`git rev-parse --short HEAD`), so the artifact name reflects the commit being packaged. `cd`-ing into `srcDir` before `zip`-ing `.` flattens the directory's contents to the zip root — `dist/main.js` becomes `main.js` inside the zip, which is what Lambda expects.

## Installation

Add an entry to the `plugins` section of `nx.json`:

```jsonc
{
  "plugin": "@thdk/nx-zip/plugin",
  "options": {
    "include": ["tag:deployable:zip"],
    "srcDir": "out",
    "outputDir": "tmp"
  }
}
```

Then tag any project you want packaged:

```jsonc
// project.json (or the inline `nx` field of package.json)
{ "tags": ["deployable:zip"] }
```

## Plugin options

| Option       | Default           | Description                                                                                                                                                             |
| ------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tag`        | `deployable:zip`  | Tag that marks a project as producing a deployment zip. Only tagged projects get the inferred target. Lines up with the `lambda` release group in `nx.json`.          |
| `targetName` | `zip`             | Name of the inferred target.                                                                                                                                          |
| `srcDir`     | `dist`            | Folder (relative to project root) whose _contents_ are packed into the zip. Contents are flattened to the zip root.                                                    |
| `outputDir`  | `out`             | Folder (relative to project root) the zip is written to. MUST NOT be nested inside `srcDir`, or the zip would recurse into its own output.                             |
| `include`    | `[]` (all tagged) | Further restrict to projects matching any of these patterns, on top of the `tag` gate. When set, a tagged project must also match at least one pattern.               |
| `exclude`    | `[]`              | Skip projects matching any of these patterns. Applied after `include`, so it always wins.                                                                             |

### `include` / `exclude` matching

Both are forwarded directly to Nx's `findMatchingProjects`, so they accept the same syntax as `nx run-many --projects=...`:

- `"node-tsc"` — name
- `"apps/nx-demo/*"` — directory glob
- `"tag:scope:nx-demo"` — tag prefix
- `"!apps/legacy-*"` — negation (carve exceptions out of a glob)

A project is emitted when it carries `tag`, matches `include` (or `include` is empty), **and** does not match `exclude`.

## Tags read from both sources

Tags and the Nx project name are merged from `project.json` **and** the inline `nx` field of `package.json`, so the tag gate and `findMatchingProjects` see the same data Nx itself would.

## Running it

```sh
pnpm exec nx zip <project>
```

`zip` depends on `build`, so the build output exists before packaging. In this workspace `nx.json` also wires `zip.dependsOn = ["build", "prune"]`, so the pruned dependency graph (from `@thdk/nx-pnpm-deploy`) is packaged too.

## When to publish

`private: true` today. Flip to `private: false` in `package.json` to join the `packages` release group (filtered by `tag:npm:public`, auto-inferred from the `private` flag) — no further config needed.

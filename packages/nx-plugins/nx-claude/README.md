# nx-claude

An Nx plugin that turns any folder under `plugins/` containing a `.claude-plugin/plugin.json`
into an Nx project — no `project.json` required — and gives it:

- a **`lint`** target (JSON-schema validation of `plugin.json` + its marketplace entry, plus
  `SKILL.md` frontmatter rules),
- **versioning** via `nx release` that bumps `.claude-plugin/plugin.json` (no `package.json`),
- **generators** to scaffold and remove plugins, keeping the marketplace manifest in sync.

A repository has exactly **one** marketplace — Claude only discovers it at the repo root
(`.claude-plugin/marketplace.json`) — so every plugin registers there.

## Requirements

- **Nx ≥ 21** (uses the ecosystem-agnostic Nx Release `VersionActions` API).
- The plugin is authored in TypeScript, so the workspace needs the TS plugin loader:
  `@swc-node/register` + `@swc/core` as dev dependencies, and a `tsconfig.base.json` at the
  workspace root (Nx registers the TS transpiler when it exists).

## Registration

Add it to `nx.json`. For an **in-repo** copy, reference it **by path** (referencing it by
package name can trip Nx's plugin resolver under the daemon):

```jsonc
// nx.json
{
  "plugins": ["./tools/nx-claude/src/index.ts"],
}
```

With options (object form) — all options configure the **generators**; detection needs none:

```jsonc
{
  "plugins": [
    {
      "plugin": "./tools/nx-claude/src/index.ts",
      "options": {
        "lintTargetName": "lint",
        "namePrefix": "acme-",
        "author": { "name": "Acme" },
        "owner": { "name": "Acme" },
      },
    },
  ],
}
```

### Options

| Option           | Type                               | Default                 | Description                                                                               |
| ---------------- | ---------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `lintTargetName` | `string`                           | `"lint"`                | Name of the inferred lint target.                                                         |
| `namePrefix`     | `string`                           | `""`                    | Prefix for **generated** plugin names, e.g. `"acme-"`. Org-specific; the default is none. |
| `author`         | `string \| { name, email?, url? }` | —                       | Author written into **generated** `plugin.json`. Omitted by default.                      |
| `owner`          | `{ name, email?, url? }`           | `{ "name": "Unknown" }` | Default owner for the `marketplace` generator.                                            |

The plugin ships no organization-specific defaults — set `namePrefix`/`author`/`owner` to your
org's values in `nx.json`. The `plugin` generator will **not** create a marketplace (it fails
if the repo-root marketplace is missing) — create one first with the `marketplace` generator.

## How detection works

The plugin's `createNodesV2` globs for `plugins/**/.claude-plugin/plugin.json`. Each match
becomes a project keyed by its folder, named from the manifest's `name`, and given the `lint`
target and release configuration. There are **no `project.json` files** — delete the plugin
from `nx.json` and `nx show projects` drops them all.

```bash
nx show projects                 # every detected plugin
nx run <plugin>:lint             # lint one
nx affected -t lint              # lint only changed plugins
```

### Adding custom targets / config

Detection and hand-written config compose. Drop a `project.json` (or `package.json`) into a
plugin folder and Nx **merges** it over the inferred config — add new targets, override the
inferred `lint` (e.g. `options`, `dependsOn`), add `tags`, `implicitDependencies`, etc. Keep
its `name` matching `plugin.json` (or omit it). For cross-project defaults, use
`targetDefaults` in `nx.json`.

## `lint` target

Executor: `nx-claude:lint`. It runs three groups of checks and fails on any **error**:

| Group       | Rule          | Sev     | Check                                                                      |
| ----------- | ------------- | ------- | -------------------------------------------------------------------------- |
| plugin.json | `P000`        | error   | manifest missing / invalid JSON                                            |
| plugin.json | `P001`        | error   | fails `plugin.schema.json` (e.g. `name` not `^[a-z0-9-]+$`, bad semver)    |
| marketplace | `M000`        | error   | repo-root marketplace file missing / invalid JSON                          |
| marketplace | `M001`        | error   | fails `marketplace.schema.json`                                            |
| marketplace | `M002`        | error   | no entry whose `source` points at this plugin                              |
| SKILL.md    | `F000`        | error   | frontmatter parse failure / `SKILL.md` missing                             |
| SKILL.md    | `F001`–`F003` | error   | `name` present, valid, matches skill dir                                   |
| SKILL.md    | `F004`–`F007` | error   | `description` present, ≤1024 chars, third-person, not vague                |
| SKILL.md    | `F008`–`F011` | warning | body ≤500 lines, no backslash paths, listed in README, contains "Use when" |

Schemas are bundled in `src/schemas/` and are the plugin's validation contract. The
`SKILL.md` rules follow Anthropic's skill best-practices.

Option: `--warningsAsErrors` (fail on warnings too).

## Versioning (Nx Release)

Each project gets a release config using a custom `VersionActions` that reads/writes the
`version` field in `.claude-plugin/plugin.json` — **no `package.json` needed**. Current
version resolves from the project's git release tag, falling back to the manifest on first
release.

Configure independent, conventional-commit versioning in `nx.json`:

```jsonc
{
  "release": {
    "projects": ["plugins/**"],
    "projectsRelationship": "independent",
    "version": { "conventionalCommits": true },
    "changelog": { "projectChangelogs": true },
  },
}
```

```bash
nx release version --dry-run              # preview per-plugin bumps
nx release --dry-run                      # version + changelog
```

## Generators

### `plugin` — scaffold a plugin

```bash
nx g nx-claude:plugin <name> [--directory=<namespace>] \
     [--pluginName=<name>] [--description="…"]
```

Creates `<directory>/<name>/` with a valid `plugin.json`, a README, and a lint-clean example
skill, then registers it in the repo-root marketplace.

- `--directory` is **workspace-relative**; default base is `plugins`. Use it to nest a plugin:
  - `--directory=plugins/team-a` ⇒ `plugins/team-a/<name>`
- `name` may carry a sub-namespace under the base: `team-a/payments` (default base) ⇒
  `plugins/team-a/payments`.
- Default plugin/marketplace name is `<namePrefix><path minus a leading "plugins">`; override
  with `--pluginName`.

```bash
# with namePrefix: "acme-" configured in nx.json:
nx g nx-claude:plugin payments --directory=plugins/team-a
# → plugins/team-a/payments, name "acme-team-a-payments"
```

### `marketplace` — create a marketplace

```bash
nx g nx-claude:marketplace <path> [--name=<name>] [--owner="<owner>"]
```

Creates an empty, schema-valid `marketplace.json` (`{ name, owner, plugins: [] }`) at the given
workspace-relative path. `name` defaults to the file-name stem; `owner` defaults to the `owner`
plugin option (or a placeholder). Fails if the file already exists. Create the marketplace
**before** generating plugins into it — for GitHub distribution it must live at the repo root.

```bash
nx g nx-claude:marketplace .claude-plugin/marketplace.json
```

### `remove` — delete a plugin

```bash
nx g nx-claude:remove <folder-path-or-marketplace-name>
```

Deletes the folder and removes **all** marketplace entries pointing at it (including legacy
aliases that share the folder). Accepts a path (`plugins/team-a/payments`) or a marketplace
name (`acme-team-a-payments`). Use `--dry-run` to preview.

## The marketplace

A repository has **one** marketplace, at the repo root: `.claude-plugin/marketplace.json`.
Claude Code only discovers a marketplace there when you add it by `owner/repo` shorthand, and
each plugin entry's `source` resolves relative to that repo root. `lint` validates the
marketplace's schema and that every plugin has a matching `source` entry; the generators keep
those entries in sync.

## Layout

```
tools/nx-claude/
  src/index.ts                     # createNodesV2 — inference + lint/release config
  src/version-actions.ts           # Nx Release VersionActions over plugin.json
  src/marketplace.ts               # repo-root marketplace path + source-path helper
  src/lint/                        # lint executor + ported SKILL.md rules
  src/schemas/                     # plugin.schema.json + marketplace.schema.json
  src/generators/plugin/           # scaffold generator
  src/generators/remove/           # remove generator
  src/generators/marketplace/      # marketplace scaffold generator
  src/generators/shared.ts         # nx.json org config (namePrefix/author/owner)
  executors.json  generators.json  package.json
```

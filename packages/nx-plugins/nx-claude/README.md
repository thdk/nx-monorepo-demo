# nx-claude

An Nx plugin that turns any folder under a configurable plugins root (default `plugins/`)
containing a `.claude-plugin/plugin.json` into an Nx project — no `project.json` required —
and gives it:

- a **`lint`** target (JSON-schema validation of `plugin.json` + its marketplace entry, plus
  `SKILL.md` frontmatter rules),
- **versioning** via `nx release` that bumps `.claude-plugin/plugin.json` (no `package.json`),
- **generators** to scaffold plugins and skills and remove plugins, keeping the marketplace
  manifest in sync.

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

With options (object form) — `pluginsRoot` configures **detection and generators**; the rest
configure the **generators** only:

```jsonc
{
  "plugins": [
    {
      "plugin": "./tools/nx-claude/src/index.ts",
      "options": {
        "lintTargetName": "lint",
        "pluginsRoot": "claude-plugins",
        "namePrefix": "acme-",
        "author": { "name": "Acme" },
        "owner": { "name": "Acme" },
      },
    },
  ],
}
```

### Options

| Option           | Type                               | Default                 | Description                                                                                                                                                                                                                                   |
| ---------------- | ---------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lintTargetName` | `string`                           | `"lint"`                | Name of the inferred lint target.                                                                                                                                                                                                             |
| `pluginsRoot`    | `string`                           | `"plugins"`             | Workspace-relative folder plugins live under (any depth), e.g. `"claude-plugins"` or `"packages/claude-plugins"`. `"."` means plugin folders sit directly in the repo root (the repo root itself stays reserved for the marketplace project). |
| `namePrefix`     | `string`                           | `""`                    | Prefix for **generated** plugin names, e.g. `"acme-"`. Org-specific; the default is none.                                                                                                                                                     |
| `author`         | `string \| { name, email?, url? }` | —                       | Author written into **generated** `plugin.json`. Omitted by default.                                                                                                                                                                          |
| `owner`          | `{ name, email?, url? }`           | `{ "name": "Unknown" }` | Default owner for the `marketplace` generator.                                                                                                                                                                                                |

The plugin ships no organization-specific defaults — set `namePrefix`/`author`/`owner` to your
org's values in `nx.json`. The `plugin` generator will **not** create a marketplace (it fails
if the repo-root marketplace is missing) — create one first with the `marketplace` generator.

## How detection works

The plugin's `createNodesV2` globs for `<pluginsRoot>/**/.claude-plugin/plugin.json`. Each match
becomes a project keyed by its folder, named from the manifest's `name`, tagged
`claude-plugin` (so the release group matches it), and given the `lint` target and release
configuration. There are **no `project.json` files** — delete the plugin from `nx.json` and
`nx show projects` drops them all.

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

Executor: `nx-claude:lint`. It runs these checks and fails on any **error**. Each rule has a
human-readable **slug** (the documented identifier) and a stable short **id** (a permanent
alias); either can be used to configure it (see below).

| Group       | Slug                             | ID     | Sev     | Check                                                                   |
| ----------- | -------------------------------- | ------ | ------- | ----------------------------------------------------------------------- |
| plugin.json | `plugin-json-valid`              | `P000` | error   | manifest missing / invalid JSON                                         |
| plugin.json | `plugin-json-schema`             | `P001` | error   | fails `plugin.schema.json` (e.g. `name` not `^[a-z0-9-]+$`, bad semver) |
| marketplace | `marketplace-json-valid`         | `M000` | error   | repo-root marketplace file missing / invalid JSON                       |
| marketplace | `marketplace-schema`             | `M001` | error   | fails `marketplace.schema.json`                                         |
| marketplace | `marketplace-entry-present`      | `M002` | error   | no entry whose `source` points at this plugin                           |
| SKILL.md    | `skill-frontmatter-parseable`    | `F000` | error   | frontmatter parse failure / `SKILL.md` missing                          |
| SKILL.md    | `skill-name-present`             | `F001` | error   | frontmatter `name` present                                              |
| SKILL.md    | `skill-name-format`              | `F002` | error   | `name` matches the skill-name rules                                     |
| SKILL.md    | `skill-name-matches-dir`         | `F003` | error   | `name` equals the skill directory name                                  |
| SKILL.md    | `skill-description-present`      | `F004` | error   | frontmatter `description` present                                       |
| SKILL.md    | `skill-description-length`       | `F005` | error   | `description` ≤ 1024 chars                                              |
| SKILL.md    | `skill-description-third-person` | `F006` | error   | `description` avoids first/second person                                |
| SKILL.md    | `skill-description-not-vague`    | `F007` | error   | `description` avoids vague filler phrases                               |
| SKILL.md    | `skill-body-length`              | `F008` | warning | body ≤ 500 lines                                                        |
| SKILL.md    | `skill-no-backslash-paths`       | `F009` | warning | body uses forward slashes, not backslash paths                          |
| SKILL.md    | `skill-listed-in-readme`         | `F010` | warning | skill is listed in the plugin README                                    |
| SKILL.md    | `skill-description-use-when`     | `F011` | warning | `description` contains "Use when"                                       |
| nx.json     | `nx-json-readable`               | `R000` | error   | `nx.json` is readable                                                   |
| nx.json     | `release-group-present`          | `R001` | error   | a release group matches `tag:claude-plugin`                             |
| nx.json     | `release-tag-pattern`            | `R002` | error   | its releaseTag pattern is `{projectName}--v{version}`                   |
| nx.json     | `release-independent`            | `R003` | warning | that release group versions plugins independently                       |
| plugin.json | `no-self-dependency`             | `D001` | error   | a plugin does not depend on itself                                      |
| plugin.json | `dependency-semver-valid`        | `D003` | error   | dependency `version` ranges are valid semver                            |
| plugin.json | `dependency-in-marketplace`      | `D002` | warning | dependency resolves to a marketplace plugin                             |
| plugin.json | `no-duplicate-dependency`        | `D004` | warning | no duplicate dependency entries                                         |

Schemas are bundled in `src/schemas/` and are the plugin's validation contract. The
`SKILL.md` rules follow Anthropic's skill best-practices.

Option: `--warningsAsErrors` (fail on warnings too).

### Configuring rule levels

The `Sev` column above lists each rule's **default** level. Override any of them with a
`.nx-claude-lint.config.js` file, looked up at **both** the workspace root and the plugin's
project root:

```js
// .nx-claude-lint.config.js
module.exports = {
  rules: {
    'skill-body-length': 'off', // too noisy for this plugin
    'skill-description-use-when': 'error', // require the "Use when" convention
    D002: 'off', // ids work too: depends on external plugins on purpose
  },
};
```

- **Rule keys** are the slug _or_ the id from the table above — both resolve to the same
  rule, so existing id-based configs keep working. Issue output shows `slug (id)`.
- **Levels:** `'off'` (suppress entirely — never reported, never fails the target),
  `'warning'`, or `'error'`.
- **Precedence** (highest first): project-root config → workspace-root config → built-in
  default. A project file overrides the workspace file per rule; unlisted rules keep the
  level from the next source down.
- **Interaction with `--warningsAsErrors`:** applies after overrides, so an `'off'` rule is
  never escalated and a rule demoted to `'off'` can't fail the target.
- **Bad config is reported, not ignored** (under a `lint config` scope): `config-level-valid`
  / `C002` (error) for an invalid level, `config-known-rule` / `C003` (warning) for an
  unknown rule, and `config-loadable` / `C000` or `config-shape` / `C001` (error) for an
  unloadable or misshaped file. These config diagnostics can't be silenced by an override.

The file is plain JS (`module.exports`), so CommonJS or — in an ESM workspace — an
`export default { rules: { … } }` both work.

## Versioning (Nx Release)

Each project gets a release config using a custom `VersionActions` that reads/writes the
`version` field in `.claude-plugin/plugin.json` — **no `package.json` needed**. Current
version resolves from the project's git release tag, falling back to the manifest on first
release. Release tags follow `<plugin-name>--v<version>` (e.g. `my-plugin--v1.2.0`).

The `marketplace` generator scaffolds the matching release group into `nx.json` (the tag
pattern is group-level config that project inference cannot set), and `lint` guards it
against drift:

```jsonc
{
  "release": {
    "groups": {
      "claude-plugins": {
        "projects": ["tag:claude-plugin"],
        "projectsRelationship": "independent",
        "version": { "specifierSource": "conventional-commits" },
        "releaseTag": { "pattern": "{projectName}--v{version}" },
      },
    },
  },
}
```

```bash
nx release version --dry-run              # preview per-plugin bumps
nx release --dry-run                      # version + changelog
```

## Plugin dependencies

A manifest may declare dependencies on other plugins, as a bare name or with a semver range:

```jsonc
{
  "name": "deploy-kit",
  "version": "3.1.0",
  "dependencies": [
    "audit-logger",
    { "name": "secrets-vault", "version": "~2.1.0" },
  ],
}
```

`createDependencies` turns entries that resolve to a workspace plugin into **static edges**
in the Nx project graph — they show up in `nx graph` and drive `nx affected`. Names that
don't match a marketplace plugin are treated as external (lint flags them with `D002`).

Because nx release reads dependencies from the project graph, releasing a plugin also
handles its dependents (nx release `updateDependents`, on by default): version ranges are
rewritten preserving the `~`/`^`/`=` prefix (bare names stay unversioned), and each
dependent gets a **patch** bump with reason `DEPENDENCY_WAS_BUMPED` — transitively. So a
`fix:` commit to `secrets-vault` releases `secrets-vault@2.1.1` and automatically bumps
`deploy-kit` to `3.1.1` with its manifest pointing at `~2.1.1`.

The catalog surfaces all of this: `plugins-catalog.json` carries each plugin's resolved
dependencies (declared range, current local version, whether the range is satisfied), and
the catalog app renders "Depends on" / "Used by" sections per plugin plus a "used by N"
count on the overview cards.

## Generators

### `init` — initialize the plugin (run by `nx add`)

```bash
nx g nx-claude:init [--skill] [--skillDir=.claude/skills] [--link]
```

`nx add @thdk/nx-claude` runs this automatically. On its own it does nothing beyond a hint —
pass `--skill` (or answer the prompt) to install the bundled **nx-claude usage skill** (which
teaches these generators and the marketplace conventions) into `<skillDir>/nx-claude/SKILL.md`.

- **Opt-in.** The default is `--skill=false`, so a non-interactive `nx add` (CI) installs
  nothing; interactive runs get a yes/no prompt. Opt out later by deleting the skill folder.
- **Copy, not link, by default.** The skill is copied so it is present on a fresh clone
  (before `install`), portable to Windows/Docker/CI, and reliably discovered. `--link` symlinks
  it from `node_modules` instead (auto version-matches, but not portable) — only for
  single-repo, POSIX-only setups.
- **Safe to re-run.** A copy carries an `x-managed-*` marker; re-running refreshes an untouched
  copy but never overwrites one you have edited (it warns and leaves it). `nx migrate` refreshes
  it on version bumps via the same guard.

### `plugin` — scaffold a plugin

```bash
nx g nx-claude:plugin <name> [--directory=<namespace>] \
     [--pluginName=<name>] [--description="…"]
```

Creates `<directory>/<name>/` with a valid `plugin.json`, a README, and a lint-clean example
skill, then registers it in the repo-root marketplace.

- `--directory` is **workspace-relative**; default base is the configured `pluginsRoot`
  (`plugins` unless overridden). Use it to nest a plugin:
  - `--directory=plugins/team-a` ⇒ `plugins/team-a/<name>`
- `name` may carry a sub-namespace under the base: `team-a/payments` (default base) ⇒
  `plugins/team-a/payments`.
- The resulting folder must lie under `pluginsRoot` — the generator refuses locations project
  inference would never pick up.
- Default plugin/marketplace name is `<namePrefix><path minus the plugins root>`; override
  with `--pluginName`.

```bash
# with namePrefix: "acme-" configured in nx.json:
nx g nx-claude:plugin payments --directory=plugins/team-a
# → plugins/team-a/payments, name "acme-team-a-payments"
```

### `skill` — add a skill to a plugin

```bash
nx g nx-claude:skill <name> --project=<plugin> [--description="…"] [--userInvocable]
```

Creates `<plugin>/skills/<name>/SKILL.md` with lint-clean frontmatter and lists the skill in
the plugin's README (`F010`). `--project` accepts a folder path (`plugins/team-a/payments`)
or a plugin/marketplace name (`acme-team-a-payments` — the same as the inferred Nx project
name). The skill name is kebab-cased and validated against the `F002` name rules up front;
provide a `--description` containing "Use when …" trigger conditions or replace the
placeholder before shipping.

```bash
nx g nx-claude:skill review-terraform --project=acme-team-a-payments \
     --description="Use when reviewing terraform plans before apply."
```

### `move-skill` — move a skill between plugins

```bash
nx g nx-claude:move-skill <name> --from=<plugin> --to=<plugin>
```

Moves `skills/<name>/` (all its files) from one plugin to another, updates the `## Skills`
list in **both** READMEs, and rewrites `from-plugin:<name>` skill references to
`to-plugin:<name>` in every workspace plugin's skill markdown so dependents keep working.
`--from`/`--to` accept a folder path or a plugin/marketplace name. Run `nx sync` afterwards
to pull the implied `plugin.json` dependency changes (see `sync-deps`).

### `move-plugin` — move / rename a plugin

```bash
nx g nx-claude:move-plugin <plugin> <destination> [--newName=<name>]
```

Moves the plugin folder to a new location **under the configured `pluginsRoot`** and repoints the marketplace
entry's `source`. Dependents reference plugins by _name_, so a pure move needs nothing more.
With `--newName` it also renames the plugin: `plugin.json` `name`, the marketplace entry,
every dependent's `dependencies` entry (bare string or `{ name, version }` — ranges are
preserved), and `old-name:<skill>` references in skill markdown. Note that release tags
follow `{projectName}--v{version}`, so after a rename the next release resolves its current
version from `plugin.json` (disk fallback) instead of the old git tags.

```bash
nx g nx-claude:move-plugin payments plugins/team-a/payments --newName=acme-team-a-payments
```

### `rename-plugin` — rename a plugin in place

```bash
nx g nx-claude:rename-plugin <plugin> [newName]
```

Renames the plugin without moving it, applying the exact same name-chasing as
`move-plugin --newName`: `plugin.json` `name`, the marketplace entry, every
dependent's `dependencies` entry, and `old-name:<skill>` references in skill
markdown. This is the companion to a **pure** `move-plugin` (which keeps the old
name): move the folder first, then run `rename-plugin` to bring the name in line
with its new directory. Omit `newName` and it defaults to the directory-derived
name a fresh scaffold at that folder would use (`namePrefix` + the folder path
under the plugins root), so the common "match the name to the directory" case
needs no argument. The same release-tag caveat as `move-plugin` applies.

```bash
# after: nx g nx-claude:move-plugin payments plugins/team-a/payments
nx g nx-claude:rename-plugin plugins/team-a/payments   # -> acme-team-a-payments
```

### `sync-deps` — keep `dependencies` in sync (sync generator)

Skills invoke other plugins' skills as `plugin-name:skill-name` (e.g.
`/payments:review-terraform`). The `sync-deps` [sync generator](https://nx.dev/concepts/sync-generators)
scans every plugin's skill markdown for references to other **workspace** plugins' skills and
reconciles that plugin's `plugin.json` `dependencies` — which is what feeds the project graph,
`nx affected`, and the nx release dependency cascade. It **adds** any missing workspace-plugin
dependency and **prunes** any workspace-plugin dependency no skill still references.

It is attached to every inferred `lint` target via `syncGenerators`, so `nx lint <plugin>`
prompts to sync when out of date; `nx sync` applies it directly and `nx sync:check` guards CI.
Boundaries to keep in mind:

- Added entries are **bare names** (a version range can't be inferred — tighten to
  `{ "name": "…", "version": "~1.2.0" }` by hand where it matters); the version on an existing
  object-form entry is preserved.
- Pruning is scoped to **workspace** plugins. A dependency whose name isn't a workspace plugin
  points outside this repo (another marketplace) and is never touched.
- Because prune treats skill markdown as the source of truth, a workspace dependency kept for a
  reason markdown doesn't show (hooks, MCP servers, agents) **will be removed** — keep a
  referencing skill, or re-add it after the fact. Plugins with no skill markdown at all are
  skipped entirely, so a fresh scaffold keeps its declared deps.

### `marketplace` — create a marketplace

```bash
nx g nx-claude:marketplace <path> [--name=<name>] [--owner="<owner>"]
```

Creates an empty, schema-valid `marketplace.json` (`{ name, owner, plugins: [] }`) at the given
workspace-relative path, and adds the `claude-plugins` release group to `nx.json` if no group
matches `tag:claude-plugin` yet. `name` defaults to the file-name stem; `owner` defaults to the
`owner` plugin option (or a placeholder). Fails if the file already exists. Create the
marketplace **before** generating plugins into it — for GitHub distribution it must live at the
repo root.

```bash
nx g nx-claude:marketplace .claude-plugin/marketplace.json
```

### `remove-plugin` — delete a plugin

```bash
nx g nx-claude:remove-plugin <folder-path-or-marketplace-name>
```

Deletes the folder and removes **all** marketplace entries pointing at it (including legacy
aliases that share the folder). Accepts a path (`plugins/team-a/payments`) or a marketplace
name (`acme-team-a-payments`). Use `--dry-run` to preview. (`remove` remains as an alias.)

### `remove-skill` — delete a skill

```bash
nx g nx-claude:remove-skill <name> --project=<plugin>
```

Deletes `skills/<name>/` and its README bullet. Dangling `plugin:skill` references in other
plugins cannot be auto-fixed (there is no new target), so the generator lists them as a
warning — use `move-skill` instead when the skill should live elsewhere.

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
  src/generators/skill/            # add-a-skill generator
  src/generators/move-skill/       # move a skill between plugins
  src/generators/move-plugin/      # move (and optionally rename) a plugin
  src/generators/rename-plugin/    # rename a plugin in place
  src/generators/sync-deps/        # sync generator: deps from plugin:skill references
  src/generators/remove-plugin/    # remove-plugin generator (alias: remove)
  src/generators/remove-skill/     # remove-skill generator
  src/generators/marketplace/      # marketplace scaffold generator
  src/generators/shared.ts         # nx.json org config (namePrefix/author/owner)
  executors.json  generators.json  package.json
```

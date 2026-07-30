---
name: nx-claude
description: Manage Claude plugins, skills, and the repo marketplace in an Nx workspace that uses the @thdk/nx-claude plugin. Use when creating, moving, or removing a Claude plugin or skill, editing marketplace.json or a plugin.json, wiring plugin dependencies, or building the plugin catalog.
---

# nx-claude

This workspace uses the `@thdk/nx-claude` Nx plugin. Claude plugins live under a
configured plugins root and are **inferred** as Nx projects — they have no
`project.json`. Manage them ONLY through the generators below; never hand-edit
`marketplace.json`, a `plugin.json`, or a plugin's `dependencies` by hand — the
generators keep the marketplace, READMEs, plugin:skill references, and the graph
in sync, and lint enforces the invariants they maintain.

Run every generator through the workspace package manager and Nx (e.g.
`pnpm nx g @thdk/nx-claude:<generator>`). Pass `--dry-run` first to preview the
file changes.

## Pick the generator by intent

| You want to… | Generator |
| --- | --- |
| Create a new plugin folder + register it in the marketplace | `plugin` |
| Add a lint-clean starter skill to an existing plugin | `skill` |
| Move a skill between plugins (rewrites both READMEs + references) | `move-skill` |
| Move/rename a plugin folder (updates marketplace + dependents) | `move-plugin` |
| Delete a skill from a plugin | `remove-skill` |
| Delete a plugin folder + its marketplace entries | `remove-plugin` |
| Add plugin.json dependencies implied by plugin:skill references | `sync-deps` |
| Create a new, empty marketplace.json | `marketplace` |
| Scaffold the static catalog SPA that renders the plugin catalog | `catalog-app` |

Discover the exact flags with `pnpm nx g @thdk/nx-claude:<generator> --help`.

## Rules that lint enforces — follow them up front

- **A plugin must be registered in the repo-root marketplace.** The `plugin`
  generator fails if the marketplace is missing; create one first with
  `marketplace`.
- **The Nx project name equals the `name` in `plugin.json`** (and the git release
  tag is `{plugin-name}--v{version}`). Renaming a plugin means `move-plugin`, not
  a manual edit.
- **Skill frontmatter needs a third-person `description` with "Use when …"**
  trigger conditions. The `skill` generator scaffolds a lint-clean starter.
- **`plugin:skill` references imply a plugin dependency.** Run `sync-deps` (or let
  the lint target's sync generator do it) rather than editing `dependencies`.

## Build / inspect

- Lint a plugin: `pnpm nx lint <plugin-name>`.
- Build the aggregated catalog JSON: `pnpm nx catalog <marketplace-project>`.
- Everything is an Nx target — prefer `nx run`, `nx run-many`, `nx affected`
  over the underlying tooling.

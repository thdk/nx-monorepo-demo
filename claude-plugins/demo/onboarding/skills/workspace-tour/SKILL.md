---
name: workspace-tour
description: Use when onboarding a new contributor to this workspace; tours the folder layout and points to the git and review skills.
---

# Workspace Tour

Walk a new contributor through this workspace in this order:

1. **Folder layout** — summarize the scope folders from the root `CLAUDE.md`
   (`apps/nx-demo`, `packages/nx-demo`, `packages/nx-plugins`, `terraform/nx-demo`,
   `claude-plugins`, `tools`) and the `scope:<domain>` tagging convention.
2. **Everyday commands** — show `pnpm nx affected -t lint test build` and
   `pnpm nx show projects` before pointing at any project-specific tooling.
3. **Committing** — hand off to demo-git-workflows:conventional-commits for commit
   message and branch naming rules.
4. **Getting reviewed** — hand off to demo-code-review:review-checklist so their first
   merge request passes review in one round.

Keep the tour to one message; link deeper docs instead of inlining them.

> This plugin is part of the `demo` namespace showcasing `@thdk/nx-claude`: the two
> hand-offs above are `plugin:skill` references, and `nx sync` turns them into
> `dependencies` entries in this plugin's `plugin.json` automatically.

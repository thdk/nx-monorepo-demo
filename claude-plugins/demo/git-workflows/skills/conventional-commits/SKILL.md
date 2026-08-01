---
name: conventional-commits
description: Use when writing commit messages or naming branches in this workspace; enforces conventional commit types and scopes.
---

# Conventional Commits

Format every commit as `<type>(<scope>): <subject>`:

- **type** — one of `feat`, `fix`, `docs`, `build`, `chore`, `refactor`, `test`.
  `feat` and `build` bump minor, `fix` and `docs` bump patch (see `release.conventionalCommits`
  in `nx.json`).
- **scope** — the Nx project name the change belongs to (e.g. `nx-claude`,
  `demo-onboarding`). Omit only for workspace-wide changes.
- **subject** — imperative mood, lower case, no trailing period.

Branch names follow `<type>/<short-kebab-description>`, e.g. `feat/nx-claude-plugins-root`.

Breaking changes get a `!` after the scope and a `BREAKING CHANGE:` footer — these drive
major bumps in the release groups, so never use them casually in demo projects.

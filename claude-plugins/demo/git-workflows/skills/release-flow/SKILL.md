---
name: release-flow
description: Use when cutting a release of a workspace package or plugin; walks through nx release version, changelog, and tagging.
---

# Release Flow

Releases are driven by `nx release` groups configured in `nx.json`:

1. Make sure the working tree is clean and commits follow
   demo-git-workflows:conventional-commits — versions are derived from them
   (`specifierSource: conventional-commits`).
2. Preview with `pnpm nx release version --dry-run` before touching anything.
3. Claude plugins version in the `claude-plugins` group: the bump lands in
   `.claude-plugin/plugin.json` (not `package.json`) and tags follow
   `{projectName}--v{version}`, e.g. `demo-onboarding--v0.2.0`.
4. Dependent plugins get automatic patch cascades — releasing a plugin that others
   depend on bumps the dependents too.

Never hand-edit versions or create tags manually; the group configuration owns both.

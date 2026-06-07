#!/usr/bin/env node

// Workaround for https://github.com/nrwl/nx/issues/34655.
// @nx/js:prune-lockfile emits importer blocks for workspace_modules/* in the
// pruned pnpm-lock.yaml (PR #35532), but pnpm only acts on those importer
// blocks when the paths are declared as workspaces. Without this file, pnpm
// install skips installing the transitive npm deps of pruned workspace
// modules, and the runtime crashes with ERR_MODULE_NOT_FOUND.
// Drop this script and the corresponding nx.json target override once Nx
// writes pnpm-workspace.yaml itself.

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distDir = resolve(process.argv[2] ?? 'dist');

writeFileSync(
  join(distDir, 'pnpm-workspace.yaml'),
  'packages:\n  - "workspace_modules/**"\n',
);

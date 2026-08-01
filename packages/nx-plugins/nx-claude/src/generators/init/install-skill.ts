import { type Tree, joinPathFragments } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
// import-equals: gray-matter is CJS without a `.default` (see lint/rules.ts).
import matter = require('gray-matter');

/** Subdirectory the skill is installed into, under the resolved skillDir. */
export const SKILL_SUBDIR = 'nx-claude';

/** Marker written into managed skills so re-runs/migrations can tell ours from a user's edits. */
const MANAGED_BY = '@thdk/nx-claude';

export type InstallStatus =
  | 'installed' // no skill existed → wrote a fresh copy
  | 'updated' // an unmodified managed copy existed → refreshed it
  | 'unchanged' // managed copy already matches the shipped skill
  | 'skipped-modified' // managed copy was edited by the user → left as-is
  | 'skipped-foreign' // a non-managed SKILL.md sits at the path → left as-is
  | 'absent'; // onlyIfPresent and nothing was there → did nothing

export interface InstallResult {
  status: InstallStatus;
  /** Workspace-relative path of the skill file. */
  dest: string;
}

/** Hash of the skill body (frontmatter excluded), trimmed so trailing-newline noise is ignored. */
function bodyHash(content: string): string {
  return createHash('sha256').update(content.trim()).digest('hex');
}

/** This plugin's own version, read from its installed package.json (dist and src both resolve here). */
function pluginVersion(): string {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf-8'),
  ) as { version?: string };
  return pkg.version ?? '0.0.0';
}

/** Render the shipped skill with its provenance marker injected into the frontmatter. */
function renderShippedSkill(): {
  rendered: string;
  hash: string;
  version: string;
} {
  const raw = readFileSync(
    join(__dirname, 'files', SKILL_SUBDIR, 'SKILL.md'),
    'utf-8',
  );
  const parsed = matter(raw);
  const hash = bodyHash(parsed.content);
  const version = pluginVersion();
  const rendered = matter.stringify(parsed.content, {
    ...parsed.data,
    'x-managed-by': MANAGED_BY,
    'x-managed-version': version,
    'x-managed-hash': hash,
  });
  return { rendered, hash, version };
}

/** Absolute path (on disk) of the shipped skill directory — the symlink target for `--link`. */
export function shippedSkillDir(): string {
  return join(__dirname, 'files', SKILL_SUBDIR);
}

/**
 * Copy the shipped skill into `skillDir/nx-claude/SKILL.md`, never clobbering user edits.
 *
 * Idempotent and safe to re-run (that's what the migration does). It compares the marker hash
 * stored in an existing file against that file's actual body: if they still match, the file is
 * an untouched managed copy and gets refreshed; if they differ, the user edited it and we skip.
 * A SKILL.md without our marker is treated as user-owned and left alone.
 *
 * @param onlyIfPresent when true, do nothing unless a managed copy already exists (migration mode).
 */
export function installSkill(
  tree: Tree,
  skillDir: string,
  { onlyIfPresent = false }: { onlyIfPresent?: boolean } = {},
): InstallResult {
  const dest = joinPathFragments(skillDir, SKILL_SUBDIR, 'SKILL.md');
  const { rendered, hash, version } = renderShippedSkill();

  if (!tree.exists(dest)) {
    if (onlyIfPresent) return { status: 'absent', dest };
    tree.write(dest, rendered);
    return { status: 'installed', dest };
  }

  const current = matter(tree.read(dest, 'utf-8') ?? '');
  if (current.data['x-managed-by'] !== MANAGED_BY) {
    return { status: 'skipped-foreign', dest };
  }
  // Stored marker vs. the file's actual body: a mismatch means someone edited it.
  if (current.data['x-managed-hash'] !== bodyHash(current.content)) {
    return { status: 'skipped-modified', dest };
  }
  if (
    current.data['x-managed-version'] === version &&
    bodyHash(current.content) === hash
  ) {
    return { status: 'unchanged', dest };
  }
  tree.write(dest, rendered);
  return { status: 'updated', dest };
}

import { sep } from 'path';

// A repository has exactly one marketplace, and Claude only discovers it at the
// repo root: `<repo>/.claude-plugin/marketplace.json`. Plugin `source` paths are
// therefore always resolved relative to the workspace root.
export const MARKETPLACE_PATH = '.claude-plugin/marketplace.json';

const toPosix = (p: string): string => p.split(sep).join('/');

/** Build a plugin `source` value (relative to the repo root) for a project root. */
export function sourceFor(projectRootRel: string): string {
  const rel = toPosix(projectRootRel);
  return rel.startsWith('.') ? rel : `./${rel}`;
}

// The workspace folder Claude plugins live under, configurable via the `pluginsRoot`
// option on the nx-claude registration in nx.json. "." (or "") means plugin folders
// sit directly in the repo root. Shared by project inference (index.ts) and the
// generators, so both always agree on where plugins are allowed to live.

export const DEFAULT_PLUGINS_ROOT = 'plugins';

/** Normalize a configured plugins root: strip "./" and slashes; ""/"." → "." (repo root). */
export function normalizePluginsRoot(root: string | undefined): string {
  const cleaned = (root ?? DEFAULT_PLUGINS_ROOT)
    .replace(/^\.\//, '')
    .replace(/^\/+|\/+$/g, '');
  return cleaned === '' || cleaned === '.' ? '.' : cleaned;
}

/**
 * Whether a workspace-relative folder lies under the plugins root (the root folder
 * itself counts). With root "." every folder qualifies EXCEPT "." itself — the repo
 * root is reserved for the marketplace project, so a plugin.json inside the repo-root
 * `.claude-plugin/` directory is never inferred as a plugin project.
 */
export function isUnderPluginsRoot(
  folder: string,
  pluginsRoot: string,
): boolean {
  if (pluginsRoot === '.') return folder !== '.' && folder !== '';
  return folder === pluginsRoot || folder.startsWith(`${pluginsRoot}/`);
}

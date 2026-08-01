import { type Tree, names, readJson, readNxJson } from '@nx/devkit';
import { MARKETPLACE_PATH } from '../marketplace';
import { normalizePluginsRoot } from '../plugins-root';

export interface Person {
  name: string;
  email?: string;
  url?: string;
}

// Org-specific scaffolding config read from the nx-claude registration in nx.json.
// A repo has a single registration and a single (repo-root) marketplace.
export interface Registration {
  /** Prefix for generated plugin names (org-specific, e.g. "acme-"). Default: none. */
  namePrefix?: string;
  /** Author written into generated plugin.json. Default: omitted. */
  author?: string | Person;
  /** Default owner for the `marketplace` generator. Default: a placeholder. */
  owner?: Person;
  /**
   * Workspace-relative folder plugins live under ("." for the repo root).
   * Must match what project inference uses — it reads the same registration.
   * Default: "plugins".
   */
  pluginsRoot?: string;
}

/** Minimal shape of nx.json needed to read registrations (Tree-free, so executors can use it). */
export interface NxJsonLike {
  plugins?: unknown[];
}

/** Pure parse of nx-claude registrations from an nx.json object (no Tree required). */
export function registrationsFromNxJson(nx: NxJsonLike): Registration[] {
  const regs: Registration[] = [];
  for (const entry of (nx.plugins ?? []) as unknown[]) {
    const name =
      typeof entry === 'string'
        ? entry
        : (entry as { plugin?: string })?.plugin;
    if (typeof name === 'string' && /nx-claude/.test(name)) {
      regs.push(
        typeof entry === 'object'
          ? ((entry as { options?: Registration }).options ?? {})
          : {},
      );
    }
  }
  return regs.length ? regs : [{}];
}

/** Org author fallback used when a plugin.json omits `author` (plugin.json wins over this). */
export function orgAuthorFromNxJson(
  nx: NxJsonLike,
): string | Person | undefined {
  return registrationsFromNxJson(nx)
    .map((r) => r.author)
    .find(Boolean);
}

/** All nx-claude registrations from nx.json (normally exactly one). */
export function getRegistrations(tree: Tree): Registration[] {
  return registrationsFromNxJson(readNxJson(tree) ?? {});
}

/** The nx-claude registration's org config (name prefix, author, owner). */
export function optionsForRoot(tree: Tree): Registration {
  return getRegistrations(tree)[0] ?? {};
}

/** Default owner configured on the registration (used by the marketplace generator). */
export function configuredOwner(tree: Tree): Person | undefined {
  return getRegistrations(tree)
    .map((r) => r.owner)
    .find(Boolean);
}

/** The normalized plugins root from the registration ("." = repo root; default "plugins"). */
export function configuredPluginsRoot(tree: Tree): string {
  return normalizePluginsRoot(
    getRegistrations(tree)
      .map((r) => r.pluginsRoot)
      .find(Boolean),
  );
}

/** Claude Code rejects string authors in plugin.json — normalize to { name }. */
export function normalizeAuthor(
  author: string | Person | undefined,
): Person | undefined {
  if (author === undefined) return undefined;
  return typeof author === 'string' ? { name: author } : author;
}

/** Strip a leading "./" and surrounding slashes from a plugin folder/source path. */
export function normalizePluginPath(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
}

/**
 * The plugin name a fresh scaffold at `folder` would get: the org `namePrefix`
 * followed by the folder path relative to the plugins root, kebab-cased per
 * segment and joined with "-". Used by the `plugin` generator (default name)
 * and `rename-plugin` (rename a moved plugin to match its directory).
 */
export function defaultPluginNameForFolder(tree: Tree, folder: string): string {
  const pluginsRoot = configuredPluginsRoot(tree);
  const segs = normalizePluginPath(folder).split('/').filter(Boolean);
  const rootSegs = pluginsRoot === '.' ? [] : pluginsRoot.split('/');
  const rel = rootSegs.every((seg, i) => segs[i] === seg)
    ? segs.slice(rootSegs.length)
    : segs;
  const prefix = optionsForRoot(tree).namePrefix ?? '';
  return `${prefix}${rel.map((s) => names(s).fileName).join('-')}`;
}

/**
 * Resolve an existing plugin folder from user input: a workspace-relative path
 * (`plugins/team-a/payments`), a bare folder name under the plugins root, or a
 * plugin/marketplace name (which equals the inferred Nx project name).
 * Returns the workspace-relative folder, or undefined when nothing matches.
 */
export function resolvePluginFolder(
  tree: Tree,
  input: string,
): string | undefined {
  const cleaned = normalizePluginPath(input);
  const pluginsRoot = configuredPluginsRoot(tree);
  const candidates =
    pluginsRoot === '.' ? [cleaned] : [cleaned, `${pluginsRoot}/${cleaned}`];
  for (const candidate of candidates) {
    if (tree.exists(`${candidate}/.claude-plugin/plugin.json`)) {
      return candidate;
    }
  }
  if (tree.exists(MARKETPLACE_PATH)) {
    const doc = readJson<{ plugins?: { name?: string; source?: string }[] }>(
      tree,
      MARKETPLACE_PATH,
    );
    const hit = (doc.plugins ?? []).find((p) => p.name === cleaned);
    if (hit && typeof hit.source === 'string') {
      return normalizePluginPath(hit.source);
    }
  }
  return undefined;
}

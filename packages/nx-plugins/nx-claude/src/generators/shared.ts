import { type Tree, readNxJson } from '@nx/devkit';

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

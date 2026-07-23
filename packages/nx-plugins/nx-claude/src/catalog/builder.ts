import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { readSkills, type SkillMeta } from '../lint/rules';
import { MARKETPLACE_PATH } from '../marketplace';
import type { Person } from '../generators/shared';

export interface CatalogPlugin {
  name: string;
  version: string;
  source: string;
  strict?: boolean;
  /**
   * Folder segments that distinguish the plugin, shared container prefix removed,
   * e.g. ["group","sub-group"]. The first segment is the top-level grouping ("domain").
   */
  path: string[];
  description?: string;
  keywords?: string[];
  author?: Person;
  repository?: string;
  license?: string;
  skills: SkillMeta[];
}

export interface CatalogDocument {
  schemaVersion: number;
  marketplace: {
    name: string;
    owner?: Person;
    description?: string;
  };
  plugins: CatalogPlugin[];
}

export interface BuildCatalogParams {
  workspaceRoot: string;
  /** Workspace-relative marketplace.json. Default: repo-root marketplace. */
  marketplacePathRel?: string;
  /** Fallback author when a plugin.json omits `author`. */
  orgAuthor?: string | Person;
  /** Warn + skip a plugin on missing/malformed source instead of throwing. */
  warnOnMissing?: boolean;
  warn?: (msg: string) => void;
}

// Bump when the output shape changes in a breaking way (mirrors catalog.schema.json const).
const SCHEMA_VERSION = 1;

/** Normalize a plugin.json/marketplace `author`/`owner` (string or object) to a Person. */
function normPerson(value: unknown): Person | undefined {
  if (typeof value === 'string')
    return value.trim() ? { name: value.trim() } : undefined;
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as Person).name === 'string'
  ) {
    const v = value as Person;
    return {
      name: v.name,
      ...(v.email ? { email: v.email } : {}),
      ...(v.url ? { url: v.url } : {}),
    };
  }
  return undefined;
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** A marketplace `source` ("./plugins/foo/") → workspace-relative root ("plugins/foo"). */
const toRootRel = (source: string): string =>
  source.replace(/^\.\//, '').replace(/\/+$/, '');
const toSegments = (rootRel: string): string[] =>
  rootRel.split('/').filter(Boolean);

/** Count of leading path segments shared by every plugin; never consumes a plugin's own leaf. */
function commonDirPrefixLength(segmentLists: string[][]): number {
  if (segmentLists.length === 0) return 0;
  const minLen = Math.min(...segmentLists.map((s) => s.length));
  let prefix = 0;
  for (let i = 0; i < minLen - 1; i++) {
    const seg = segmentLists[0][i];
    if (segmentLists.every((s) => s[i] === seg)) prefix++;
    else break;
  }
  return prefix;
}

/**
 * Aggregate every marketplace-registered plugin's metadata + skills into one document.
 * Pure (filesystem reads only) and deterministic — no timestamps — so the target caches well.
 * Iterates `marketplace.plugins[]` (the source of truth for what's published), preserving order.
 */
export function buildCatalog(params: BuildCatalogParams): CatalogDocument {
  const { workspaceRoot, orgAuthor, warnOnMissing = false } = params;
  const warn =
    params.warn ?? ((m: string) => console.warn(`nx-claude:catalog: ${m}`));
  const marketplacePathRel = params.marketplacePathRel ?? MARKETPLACE_PATH;
  const marketplacePath = join(workspaceRoot, marketplacePathRel);

  if (!existsSync(marketplacePath)) {
    throw new Error(`marketplace.json not found at "${marketplacePathRel}"`);
  }
  let marketplace: any;
  try {
    marketplace = readJson(marketplacePath);
  } catch (e) {
    throw new Error(
      `marketplace.json is invalid JSON: ${(e as Error).message}`,
    );
  }

  const orgAuthorNorm = normPerson(orgAuthor);
  const entries: any[] = Array.isArray(marketplace.plugins)
    ? marketplace.plugins
    : [];

  // The meaningful hierarchy is whatever DIFFERS between plugins. A folder shared by every
  // plugin (e.g. a "plugins/" container) carries no grouping information, so drop the common
  // leading prefix — layout-agnostic, no hardcoded segment. The plugin's own leaf is preserved.
  const prefixLen = commonDirPrefixLength(
    entries
      .map((e) => (typeof e?.source === 'string' ? toRootRel(e.source) : ''))
      .filter(Boolean)
      .map(toSegments),
  );

  const seenNames = new Set<string>();
  const seenSources = new Set<string>();
  const plugins: CatalogPlugin[] = [];

  for (const entry of entries) {
    const source = typeof entry?.source === 'string' ? entry.source : undefined;
    if (!source) {
      const msg = `marketplace entry ${JSON.stringify(entry?.name ?? '?')} has no string source`;
      if (warnOnMissing) {
        warn(msg);
        continue;
      }
      throw new Error(msg);
    }

    // Resolve `source` (relative to repo root) → workspace-relative plugin folder.
    const rootRel = toRootRel(source);

    // A later entry pointing at an already-cataloged folder is a legacy alias (same plugin under
    // an old name, kept so existing installs resolve). Catalog the canonical (first) entry only.
    if (seenSources.has(rootRel)) continue;

    const manifestPath = join(
      workspaceRoot,
      rootRel,
      '.claude-plugin',
      'plugin.json',
    );
    if (!existsSync(manifestPath)) {
      const msg = `plugin.json not found for source "${source}" (expected ${rootRel}/.claude-plugin/plugin.json)`;
      if (warnOnMissing) {
        warn(msg);
        continue;
      }
      throw new Error(msg);
    }
    let manifest: any;
    try {
      manifest = readJson(manifestPath);
    } catch (e) {
      const msg = `plugin.json for source "${source}" is invalid JSON: ${(e as Error).message}`;
      if (warnOnMissing) {
        warn(msg);
        continue;
      }
      throw new Error(msg);
    }

    const name = typeof manifest.name === 'string' ? manifest.name : undefined;
    const version =
      typeof manifest.version === 'string' ? manifest.version : undefined;
    if (!name || !version) {
      const msg = `plugin at "${source}" is missing required name/version`;
      if (warnOnMissing) {
        warn(msg);
        continue;
      }
      throw new Error(msg);
    }
    if (seenNames.has(name)) {
      throw new Error(
        `duplicate plugin name "${name}" across distinct sources`,
      );
    }
    seenNames.add(name);
    seenSources.add(rootRel);

    // Hierarchy = the segments that distinguish this plugin (common container prefix removed).
    const path = toSegments(rootRel).slice(prefixLen);

    const author = normPerson(manifest.author) ?? orgAuthorNorm;
    plugins.push({
      name,
      version,
      source,
      path,
      ...(entry.strict === true ? { strict: true } : {}),
      ...(typeof manifest.description === 'string'
        ? { description: manifest.description }
        : {}),
      ...(Array.isArray(manifest.keywords)
        ? {
            keywords: manifest.keywords.filter(
              (k: unknown): k is string => typeof k === 'string',
            ),
          }
        : {}),
      ...(author ? { author } : {}),
      ...(typeof manifest.repository === 'string'
        ? { repository: manifest.repository }
        : {}),
      ...(typeof manifest.license === 'string'
        ? { license: manifest.license }
        : {}),
      skills: readSkills(join(workspaceRoot, rootRel, 'skills')),
    });
  }

  const owner = normPerson(marketplace.owner);
  const mpDescription =
    marketplace.metadata && typeof marketplace.metadata.description === 'string'
      ? marketplace.metadata.description
      : undefined;

  return {
    schemaVersion: SCHEMA_VERSION,
    marketplace: {
      name:
        typeof marketplace.name === 'string' ? marketplace.name : 'marketplace',
      ...(owner ? { owner } : {}),
      ...(mpDescription ? { description: mpDescription } : {}),
    },
    plugins,
  };
}

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';
import { pathToFileURL } from 'url';
import Ajv, { type ErrorObject } from 'ajv';
// import-equals: gray-matter is CJS without a `.default`, and this file must load
// under both tsc output (dist) and Nx's src transpilers (path-registered plugin).
import matter = require('gray-matter');
import { validRange } from 'semver';

// Loaded via fs, not `import`: JSON imports break under Node's native type
// stripping when Nx runs this executor straight from src/ (path-registered plugin).
const schemasDir = join(__dirname, '..', 'schemas');
const pluginSchema = JSON.parse(
  readFileSync(join(schemasDir, 'plugin.schema.json'), 'utf8'),
) as object;
const marketplaceSchema = JSON.parse(
  readFileSync(join(schemasDir, 'marketplace.schema.json'), 'utf8'),
) as object;
import { sourceFor } from '../marketplace';
import {
  RELEASE_GROUP_PROJECTS_MATCHER,
  RELEASE_TAG_PATTERN,
  findClaudePluginsReleaseGroup,
  type ReleaseGroupLike,
} from '../release-group';
import { parsePluginDependencies } from '../plugin-manifest';
import { skillNameProblems } from '../skill-name';

export type Severity = 'error' | 'warning';
/** Configurable level for a rule. `off` suppresses it entirely (never becomes an Issue). */
export type RuleLevel = Severity | 'off';

export interface Issue {
  scope: string; // e.g. "plugin.json", "marketplace.json", or a skill name
  ruleId: string;
  severity: Severity;
  message: string;
}

export interface LintParams {
  workspaceRoot: string;
  projectRoot: string; // absolute path to the plugin folder
  projectRootRel: string; // workspace-relative plugin folder
  marketplacePathRel: string; // workspace-relative marketplace.json (repo-root)
  warningsAsErrors?: boolean;
}

export interface LintResult {
  ok: boolean;
  issues: Issue[];
}

// ── Ported thresholds from gitlab-templates skill-quality/lint_rules.py ────────
// (name constraints live in ../skill-name.ts, shared with the `skill` generator)
const DESCRIPTION_MAX_LEN = 1024;
const FIRST_SECOND_PERSON_PATTERNS: RegExp[] = [
  /\b(I|I'm|I've|I'll)\b/,
  /\bwe\b/i,
  /\bmy\b/i,
  /\byou\b/i,
  /\byour\b/i,
];
const VAGUE_PHRASES = [
  'helps with',
  'processes data',
  'does stuff',
  'handles things',
];
const REQUIRED_DESCRIPTION_PHRASES = ['use when'];
const BODY_MAX_LINES = 500;
const BACKSLASH_PATH_PATTERN = /\b[A-Za-z]:\\[A-Za-z]/;

interface RuleDef {
  /** Stable short id, e.g. "F011". Never changes — a permanent alias. */
  id: string;
  /** Human-readable slug, e.g. "skill-description-use-when". The documented identifier. */
  slug: string;
  /** Default level. */
  level: Severity;
  /**
   * `false` for internal `lint config` diagnostics: they are reported but cannot be
   * reconfigured (a config must not be able to silence the report of its own mistakes),
   * so their id/slug are not accepted as config keys.
   */
  configurable?: boolean;
}

// Authoritative registry of every rule: its stable id, human-readable slug, and default
// level. All lookup tables below are derived from it, so this is the single place to add
// or retune a rule. Slug is the documented identifier; the id stays a permanent alias.
const RULES: readonly RuleDef[] = [
  { id: 'P000', slug: 'plugin-json-valid', level: 'error' },
  { id: 'P001', slug: 'plugin-json-schema', level: 'error' },
  { id: 'M000', slug: 'marketplace-json-valid', level: 'error' },
  { id: 'M001', slug: 'marketplace-schema', level: 'error' },
  { id: 'M002', slug: 'marketplace-entry-present', level: 'error' },
  { id: 'F000', slug: 'skill-frontmatter-parseable', level: 'error' },
  { id: 'F001', slug: 'skill-name-present', level: 'error' },
  { id: 'F002', slug: 'skill-name-format', level: 'error' },
  { id: 'F003', slug: 'skill-name-matches-dir', level: 'error' },
  { id: 'F004', slug: 'skill-description-present', level: 'error' },
  { id: 'F005', slug: 'skill-description-length', level: 'error' },
  { id: 'F006', slug: 'skill-description-third-person', level: 'error' },
  { id: 'F007', slug: 'skill-description-not-vague', level: 'error' },
  { id: 'F008', slug: 'skill-body-length', level: 'warning' },
  { id: 'F009', slug: 'skill-no-backslash-paths', level: 'warning' },
  { id: 'F010', slug: 'skill-listed-in-readme', level: 'warning' },
  { id: 'F011', slug: 'skill-description-use-when', level: 'warning' },
  { id: 'R000', slug: 'nx-json-readable', level: 'error' },
  { id: 'R001', slug: 'release-group-present', level: 'error' },
  { id: 'R002', slug: 'release-tag-pattern', level: 'error' },
  { id: 'R003', slug: 'release-independent', level: 'warning' },
  { id: 'D001', slug: 'no-self-dependency', level: 'error' },
  { id: 'D002', slug: 'dependency-in-marketplace', level: 'warning' },
  { id: 'D003', slug: 'dependency-semver-valid', level: 'error' },
  { id: 'D004', slug: 'no-duplicate-dependency', level: 'warning' },
  // Internal `lint config` diagnostics — reported, never reconfigurable.
  { id: 'C000', slug: 'config-loadable', level: 'error', configurable: false },
  { id: 'C001', slug: 'config-shape', level: 'error', configurable: false },
  { id: 'C002', slug: 'config-level-valid', level: 'error', configurable: false },
  { id: 'C003', slug: 'config-known-rule', level: 'warning', configurable: false },
];

// id → default level (also the fallback used by add() and addConfigIssue).
const SEVERITY: Record<string, Severity> = Object.fromEntries(
  RULES.map((r) => [r.id, r.level]),
);
// id → slug, for display.
const SLUG_BY_ID: Record<string, string> = Object.fromEntries(
  RULES.map((r) => [r.id, r.slug]),
);
// Every accepted config key (both id and slug of each configurable rule) → canonical id.
const ID_BY_CONFIG_KEY: Record<string, string> = Object.fromEntries(
  RULES.filter((r) => r.configurable !== false).flatMap((r) => [
    [r.id, r.id],
    [r.slug, r.id],
  ]),
);

/** Display label for a rule id: `slug (id)`, or just the id if it has no slug. */
export function ruleLabel(ruleId: string): string {
  const slug = SLUG_BY_ID[ruleId];
  return slug ? `${slug} (${ruleId})` : ruleId;
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validatePlugin = ajv.compile(pluginSchema as object);
const validateMarketplace = ajv.compile(marketplaceSchema as object);

function fmtAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) =>
    `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim(),
  );
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Config file (looked up at both workspace root and project root) that overrides
 * default rule levels. Project-root config wins over workspace-root config, which
 * wins over the built-in {@link SEVERITY} defaults.
 *
 * ```js
 * // .nx-claude-lint.config.js
 * module.exports = { rules: { F008: 'off', F011: 'error' } };
 * ```
 */
export const LINT_CONFIG_FILENAME = '.nx-claude-lint.config.js';

const RULE_LEVELS: readonly RuleLevel[] = ['off', 'warning', 'error'];

// Load a JS config module by absolute path. `require` covers CommonJS configs (the
// common case); the dynamic-import fallback keeps it working when the consumer
// workspace is ESM ("type":"module"), where require() throws ERR_REQUIRE_ESM.
async function importConfigModule(path: string): Promise<unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ERR_REQUIRE_ESM') {
      return await import(pathToFileURL(path).href);
    }
    throw e;
  }
}

/**
 * Build the rule-level override map from the workspace-root then project-root config
 * files (project wins on conflict). Config problems are surfaced via `addConfigIssue`
 * so they show up as lint issues under the `lint config` scope — never silently
 * dropped, and (because they bypass the override-aware `add`) never silenceable.
 */
async function loadRuleOverrides(
  workspaceRoot: string,
  projectRoot: string,
  addConfigIssue: (ruleId: string, message: string) => void,
): Promise<Record<string, RuleLevel>> {
  const overrides: Record<string, RuleLevel> = {};
  // Workspace first (base), project second (wins). Dedupe when a plugin sits at the
  // workspace root so the same file isn't loaded — and reported — twice.
  const paths = [
    ...new Set([
      join(workspaceRoot, LINT_CONFIG_FILENAME),
      join(projectRoot, LINT_CONFIG_FILENAME),
    ]),
  ];

  for (const path of paths) {
    if (!existsSync(path)) continue;

    let mod: unknown;
    try {
      mod = await importConfigModule(path);
    } catch (e) {
      addConfigIssue('C000', `could not load ${path}: ${(e as Error).message}`);
      continue;
    }

    const cfg = (mod as { default?: unknown })?.default ?? mod;
    const rules = (cfg as { rules?: unknown })?.rules;
    if (!rules || typeof rules !== 'object') {
      addConfigIssue(
        'C001',
        `${path} must export { rules: { <rule>: "off" | "warning" | "error" } }`,
      );
      continue;
    }

    for (const [key, level] of Object.entries(rules as Record<string, unknown>)) {
      if (!RULE_LEVELS.includes(level as RuleLevel)) {
        addConfigIssue(
          'C002',
          `rule "${key}" has invalid level ${JSON.stringify(level)} (use "off", "warning", or "error")`,
        );
        continue;
      }
      // Accept either the slug or the stable id; resolve to the canonical id.
      const canonicalId = ID_BY_CONFIG_KEY[key];
      if (!canonicalId) {
        addConfigIssue('C003', `unknown rule "${key}"`);
        continue;
      }
      overrides[canonicalId] = level as RuleLevel;
    }
  }

  return overrides;
}

export async function lintPlugin(params: LintParams): Promise<LintResult> {
  const { workspaceRoot, projectRoot, projectRootRel, marketplacePathRel } =
    params;
  const issues: Issue[] = [];

  // Config issues bypass the override map (a config can't silence the report of its
  // own mistakes) and are collected before any rule runs.
  const overrides = await loadRuleOverrides(
    workspaceRoot,
    projectRoot,
    (ruleId, message) =>
      issues.push({
        scope: 'lint config',
        ruleId,
        message,
        severity: SEVERITY[ruleId] ?? 'error',
      }),
  );

  const add = (
    scope: string,
    ruleId: string,
    message: string,
    severity?: Severity,
  ) => {
    const level = overrides[ruleId] ?? severity ?? SEVERITY[ruleId] ?? 'error';
    if (level === 'off') return;
    issues.push({ scope, ruleId, message, severity: level });
  };

  // ── plugin.json ────────────────────────────────────────────────────────────
  const pluginJsonPath = join(projectRoot, '.claude-plugin', 'plugin.json');
  let pluginJson: any;

  if (!existsSync(pluginJsonPath)) {
    add('plugin.json', 'P000', '.claude-plugin/plugin.json is missing');
  } else {
    try {
      pluginJson = readJson(pluginJsonPath);
    } catch (e) {
      add('plugin.json', 'P000', `invalid JSON: ${(e as Error).message}`);
    }
    if (pluginJson) {
      if (!validatePlugin(pluginJson)) {
        for (const msg of fmtAjvErrors(validatePlugin.errors)) {
          add('plugin.json', 'P001', `schema: ${msg}`);
        }
      }
    }
  }

  // ── marketplace.json entry (repo-root; a repo has exactly one marketplace) ────
  const marketplacePluginNames = new Set<string>();
  const marketplacePath = join(projectRoot, marketplacePathRel);
  if (existsSync(marketplacePath)) {
    let marketplace: any;
    try {
      marketplace = readJson(marketplacePath);
    } catch (e) {
      add('marketplace.json', 'M000', `invalid JSON: ${(e as Error).message}`);
    }
    if (marketplace) {
      if (!validateMarketplace(marketplace)) {
        for (const msg of fmtAjvErrors(validateMarketplace.errors)) {
          add('marketplace.json', 'M001', `schema: ${msg}`);
        }
      }
      const expected = sourceFor(projectRootRel);
      const entries: any[] = Array.isArray(marketplace.plugins)
        ? marketplace.plugins
        : [];
      for (const p of entries) {
        if (typeof p?.name === 'string') marketplacePluginNames.add(p.name);
      }
      const referenced = entries.some((p) => {
        const src = typeof p?.source === 'string' ? p.source : undefined;
        return src === expected || src === expected.replace(/^\.\//, '');
      });
      if (!referenced) {
        add(
          'marketplace.json',
          'M002',
          `no entry in ${marketplacePathRel} has source "${expected}"`,
        );
      }
    }
  }

  // ── dependencies on other plugins ────────────────────────────────────────────
  if (pluginJson) lintDependencies(pluginJson, marketplacePluginNames, add);

  // ── nx.json release group (tags must be `<plugin-name>--v<version>`) ─────────
  lintReleaseGroup(workspaceRoot, add);

  // ── SKILL.md files ────────────────────────────────────────────────────────────
  const skillsRoot = join(projectRoot, 'skills');
  for (const skillDir of discoverSkillDirs(skillsRoot)) {
    lintSkill(skillDir, projectRoot, add);
  }

  const hasError = issues.some((i) => i.severity === 'error');
  const ok = params.warningsAsErrors ? issues.length === 0 : !hasError;
  return { ok, issues };
}

// Dependency shape is validated by the schema (P001); these rules check what a schema
// can't: self-references, duplicates, unresolvable names, and unparsable semver ranges.
function lintDependencies(
  pluginJson: unknown,
  marketplacePluginNames: Set<string>,
  add: (
    scope: string,
    ruleId: string,
    message: string,
    severity?: Severity,
  ) => void,
): void {
  const ownName = (pluginJson as { name?: unknown })?.name;
  const seen = new Set<string>();
  for (const dep of parsePluginDependencies(pluginJson)) {
    if (dep.name === ownName) {
      add('plugin.json', 'D001', `plugin depends on itself ("${dep.name}")`);
      continue;
    }
    if (seen.has(dep.name)) {
      add('plugin.json', 'D004', `duplicate dependency "${dep.name}"`);
    }
    seen.add(dep.name);
    if (dep.versionSpec && validRange(dep.versionSpec) === null) {
      add(
        'plugin.json',
        'D003',
        `dependency "${dep.name}" has invalid semver range "${dep.versionSpec}"`,
      );
    }
    if (!marketplacePluginNames.has(dep.name)) {
      add(
        'plugin.json',
        'D002',
        `dependency "${dep.name}" is not in the workspace marketplace; assuming an external plugin (no graph edge, no auto-bump)`,
      );
    }
  }
}

// Release tag pattern is group-level-only nx.json config, so it cannot be enforced by
// project inference — the marketplace generator scaffolds it and this rule guards drift.
function lintReleaseGroup(
  workspaceRoot: string,
  add: (
    scope: string,
    ruleId: string,
    message: string,
    severity?: Severity,
  ) => void,
): void {
  const nxJsonPath = join(workspaceRoot, 'nx.json');
  let nxJson: {
    release?: { groups?: Record<string, ReleaseGroupLike> };
  };
  try {
    nxJson = readJson(nxJsonPath) as typeof nxJson;
  } catch (e) {
    add('nx.json', 'R000', `could not read nx.json: ${(e as Error).message}`);
    return;
  }

  const match = findClaudePluginsReleaseGroup(nxJson.release?.groups);
  if (!match) {
    add(
      'nx.json',
      'R001',
      `no release group matches "${RELEASE_GROUP_PROJECTS_MATCHER}"; add one with releaseTag.pattern "${RELEASE_TAG_PATTERN}" (the marketplace generator scaffolds it)`,
    );
    return;
  }

  const pattern = match.group.releaseTag?.pattern;
  if (pattern !== RELEASE_TAG_PATTERN) {
    add(
      'nx.json',
      'R002',
      `release group "${match.name}" has releaseTag.pattern ${pattern ? `"${pattern}"` : '(unset)'}; Claude plugin tags must use "${RELEASE_TAG_PATTERN}"`,
    );
  }

  if (match.group.projectsRelationship !== 'independent') {
    add(
      'nx.json',
      'R003',
      `release group "${match.name}" should set projectsRelationship "independent" so plugins version separately`,
    );
  }
}

export function discoverSkillDirs(skillsRoot: string): string[] {
  if (!existsSync(skillsRoot) || !statSync(skillsRoot).isDirectory()) return [];
  return readdirSync(skillsRoot)
    .filter((n) => !n.startsWith('.'))
    .map((n) => join(skillsRoot, n))
    .filter((p) => statSync(p).isDirectory())
    .sort();
}

type SkillParse =
  | { ok: true; data: Record<string, unknown>; body: string }
  | { ok: false; reason: 'missing' | string };

/** Read + parse a skill's SKILL.md frontmatter (shared by lint and the catalog builder). */
function parseSkillMd(skillDir: string): SkillParse {
  const skillMd = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMd)) return { ok: false, reason: 'missing' };
  try {
    // eslint-disable-next-line no-irregular-whitespace
    const raw = readFileSync(skillMd, 'utf8').replace(/^﻿/, '');
    const parsed = matter(raw);
    return { ok: true, data: parsed.data ?? {}, body: parsed.content ?? '' };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export interface SkillMeta {
  name: string;
  description: string;
  userInvocable: boolean;
  /** Raw Markdown body of SKILL.md (frontmatter stripped). */
  body: string;
}

/** Metadata for every skill under `skillsRoot`; unparseable/missing SKILL.md files are skipped. */
export function readSkills(skillsRoot: string): SkillMeta[] {
  const skills: SkillMeta[] = [];
  for (const skillDir of discoverSkillDirs(skillsRoot)) {
    const parsed = parseSkillMd(skillDir);
    if (!parsed.ok) continue;
    const raw = parsed.data;
    const name =
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : basename(skillDir);
    const description =
      typeof raw.description === 'string' ? raw.description.trim() : '';
    skills.push({
      name,
      description,
      userInvocable: raw['user-invocable'] === true,
      body: parsed.body.trim(),
    });
  }
  return skills;
}

function lintSkill(
  skillDir: string,
  projectRoot: string,
  add: (
    scope: string,
    ruleId: string,
    message: string,
    severity?: Severity,
  ) => void,
): void {
  const skillName = basename(skillDir);
  const parsed = parseSkillMd(skillDir);
  if (!parsed.ok) {
    add(
      skillName,
      'F000',
      parsed.reason === 'missing'
        ? 'SKILL.md missing'
        : `frontmatter parse error: ${parsed.reason}`,
    );
    return;
  }
  const { data, body } = parsed;

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) {
    add(skillName, 'F001', 'frontmatter `name` is missing');
  } else {
    for (const problem of skillNameProblems(name)) {
      add(skillName, 'F002', problem);
    }
    if (name !== skillName)
      add(
        skillName,
        'F003',
        `\`name\` ("${name}") must match directory name ("${skillName}")`,
      );
  }

  const description =
    typeof data.description === 'string' ? data.description.trim() : '';
  if (!description) {
    add(skillName, 'F004', 'frontmatter `description` is missing');
  } else {
    if (description.length > DESCRIPTION_MAX_LEN)
      add(
        skillName,
        'F005',
        `\`description\` exceeds ${DESCRIPTION_MAX_LEN} chars (got ${description.length})`,
      );
    for (const p of FIRST_SECOND_PERSON_PATTERNS) {
      const m = p.exec(description);
      if (m) {
        add(
          skillName,
          'F006',
          `\`description\` uses first/second person ("${m[0]}"); use third-person`,
        );
        break;
      }
    }
    const lowered = description.toLowerCase();
    for (const phrase of VAGUE_PHRASES) {
      if (lowered.includes(phrase))
        add(
          skillName,
          'F007',
          `\`description\` contains vague phrase "${phrase}"; be specific about triggers`,
        );
    }
    for (const req of REQUIRED_DESCRIPTION_PHRASES) {
      if (!lowered.includes(req))
        add(
          skillName,
          'F011',
          `\`description\` should contain "${req}" (recommended convention)`,
        );
    }
  }

  const bodyLines = body.split('\n').length;
  if (bodyLines > BODY_MAX_LINES)
    add(
      skillName,
      'F008',
      `SKILL.md body is ${bodyLines} lines; recommend <= ${BODY_MAX_LINES}`,
    );
  if (BACKSLASH_PATH_PATTERN.test(body))
    add(
      skillName,
      'F009',
      'SKILL.md body appears to contain backslash paths; use forward slashes',
    );

  const readmePath = join(projectRoot, 'README.md');
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, 'utf8');
    if (!readme.includes(`\`${skillName}\``))
      add(skillName, 'F010', `skill "${skillName}" is not listed in README.md`);
  }
}

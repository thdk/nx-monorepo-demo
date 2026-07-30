import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';
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

const SEVERITY: Record<string, Severity> = {
  F000: 'error',
  F001: 'error',
  F002: 'error',
  F003: 'error',
  F004: 'error',
  F005: 'error',
  F006: 'error',
  F007: 'error',
  F008: 'warning',
  F009: 'warning',
  F010: 'warning',
  F011: 'warning',
  R000: 'error',
  R001: 'error',
  R002: 'error',
  R003: 'warning',
  D001: 'error',
  D002: 'warning',
  D003: 'error',
  D004: 'warning',
};

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

export function lintPlugin(params: LintParams): LintResult {
  const { workspaceRoot, projectRoot, projectRootRel, marketplacePathRel } =
    params;
  const issues: Issue[] = [];
  const add = (
    scope: string,
    ruleId: string,
    message: string,
    severity?: Severity,
  ) =>
    issues.push({
      scope,
      ruleId,
      message,
      severity: severity ?? SEVERITY[ruleId] ?? 'error',
    });

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
  const marketplacePath = join(workspaceRoot, marketplacePathRel);
  if (!existsSync(marketplacePath)) {
    add(
      'marketplace.json',
      'M000',
      `marketplace.json not found at "${marketplacePathRel}"`,
    );
  } else {
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

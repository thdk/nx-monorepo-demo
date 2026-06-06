import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import type { SkillMeta } from '../types.js';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(source: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const match = source.match(FRONTMATTER_RE);
  if (!match) return { meta: {}, body: source };

  const block = match[1] ?? '';
  const parsed = parseYaml(block) as unknown;
  const meta =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { meta, body: source.slice(match[0].length) };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseSkillMd(skillPath: string): SkillMeta {
  const skillFile = join(skillPath, 'SKILL.md');
  const source = readFileSync(skillFile, 'utf-8');
  const { meta } = parseFrontmatter(source);

  const name = asString(meta.name);
  const description = asString(meta.description);

  if (!name) {
    throw new Error(
      `SKILL.md at ${skillFile} is missing a 'name' frontmatter field`
    );
  }
  if (!description) {
    throw new Error(
      `SKILL.md at ${skillFile} is missing a 'description' frontmatter field`
    );
  }

  return { name, description };
}

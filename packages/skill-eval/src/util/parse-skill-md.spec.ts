import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseFrontmatter, parseSkillMd } from './parse-skill-md.js';

describe('parseFrontmatter', () => {
  it('extracts simple key/value pairs', () => {
    const { meta, body } = parseFrontmatter(`---
name: example
description: a short description
---

body content
`);
    expect(meta.name).toBe('example');
    expect(meta.description).toBe('a short description');
    expect(body).toBe('\nbody content\n');
  });

  it('handles block scalar (pipe) descriptions across multiple lines', () => {
    const { meta } = parseFrontmatter(`---
name: example
description: |
  first line
  second line
---
body
`);
    expect(meta.description).toBe('first line\nsecond line\n');
  });

  it('handles quoted strings with embedded colons', () => {
    const { meta } = parseFrontmatter(`---
name: tricky
description: "Use this when: condition X happens"
---
`);
    expect(meta.description).toBe('Use this when: condition X happens');
  });

  it('handles folded block scalars (>)', () => {
    const { meta } = parseFrontmatter(`---
name: folded
description: >
  one line
  becomes joined
---
`);
    expect(meta.description).toBe('one line becomes joined\n');
  });

  it('returns empty meta when no frontmatter present', () => {
    const { meta, body } = parseFrontmatter('# Just a heading\n\nhi');
    expect(meta).toEqual({});
    expect(body).toBe('# Just a heading\n\nhi');
  });
});

describe('parseSkillMd', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'skill-eval-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reads name + description from SKILL.md', () => {
    writeFileSync(
      join(tmp, 'SKILL.md'),
      `---
name: fake-skill
description: a fake test skill
---

# body
`
    );
    expect(parseSkillMd(tmp)).toEqual({
      name: 'fake-skill',
      description: 'a fake test skill',
    });
  });

  it('throws when description is missing', () => {
    writeFileSync(join(tmp, 'SKILL.md'), '---\nname: fake\n---\n');
    expect(() => parseSkillMd(tmp)).toThrow(/description/);
  });
});

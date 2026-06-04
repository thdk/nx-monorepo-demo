import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initEvalSet } from './run.js';

const SKILL_MD = `---
name: example-skill
description: A test skill.
---

# Example

Stuff.
`;

describe('initEvalSet', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'skill-eval-init-spec-'));
    writeFileSync(join(tmp, 'SKILL.md'), SKILL_MD);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('writes a validated eval set to <skill>/evals.json by default', async () => {
    const runClaudeP = vi.fn(async () =>
      JSON.stringify({
        skill_name: 'example-skill',
        evals: [
          { id: 1, name: 'pos-1', query: 'a realistic query', should_trigger: true },
          { id: 2, name: 'neg-1', query: 'a near-miss', should_trigger: false },
        ],
      }),
    );

    const result = await initEvalSet({
      skillPath: tmp,
      runClaudeP,
      positiveCount: 1,
      negativeCount: 1,
    });

    expect(result.outPath).toBe(join(tmp, 'evals.json'));
    expect(result.evalSet.evals).toHaveLength(2);

    const onDisk = JSON.parse(readFileSync(result.outPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk.skill_name).toBe('example-skill');
    expect(Array.isArray(onDisk.evals)).toBe(true);
  });

  it('coerces skill_name to match the actual skill, even if the model returns a different one', async () => {
    const runClaudeP = vi.fn(async () =>
      JSON.stringify({
        skill_name: 'wrong-name-from-model',
        evals: [{ query: 'q', should_trigger: true }],
      }),
    );

    const result = await initEvalSet({ skillPath: tmp, runClaudeP });
    expect(result.evalSet.skill_name).toBe('example-skill');
  });

  it('respects --force and overwrites an existing file', async () => {
    const runClaudeP = vi.fn(async () =>
      JSON.stringify({
        skill_name: 'example-skill',
        evals: [{ query: 'q', should_trigger: true }],
      }),
    );

    const outPath = join(tmp, 'evals.json');
    await initEvalSet({ skillPath: tmp, outPath, runClaudeP });
    // Second call without --force should throw
    await expect(initEvalSet({ skillPath: tmp, outPath, runClaudeP })).rejects.toThrow(
      /already exists/,
    );
    // With --force it should succeed
    await expect(initEvalSet({ skillPath: tmp, outPath, runClaudeP, force: true })).resolves.toBeDefined();
  });

  it('handles a response wrapped in a ```json fence', async () => {
    const runClaudeP = vi.fn(
      async () =>
        '```json\n{"skill_name":"example-skill","evals":[{"query":"q","should_trigger":true}]}\n```',
    );
    const result = await initEvalSet({ skillPath: tmp, runClaudeP });
    expect(result.evalSet.evals).toHaveLength(1);
  });

  it('surfaces a clear error when the model returns unparseable text', async () => {
    const runClaudeP = vi.fn(async () => 'sorry I cannot do that');
    await expect(initEvalSet({ skillPath: tmp, runClaudeP })).rejects.toThrow(
      /did not return a parsable JSON/,
    );
  });

  it('surfaces a clear error when the JSON is parsable but the shape is wrong', async () => {
    const runClaudeP = vi.fn(async () => JSON.stringify({ skill_name: 'example-skill', evals: [] }));
    // empty evals[] is rejected by zod (min length 1)
    await expect(initEvalSet({ skillPath: tmp, runClaudeP })).rejects.toThrow();
  });
});

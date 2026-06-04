import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runQuery } from './run-query.js';

/**
 * The trigger ID is generated inside runQuery, so the fake binary can't echo a
 * literal match. Instead it reads the contents of the only file under
 * `.claude/commands/*.md` (which contains the trigger ID in its filename) and
 * emits a stream-json line that includes that exact ID.
 */
const FAKE_BIN_TEMPLATE = (script: string) => `#!/usr/bin/env node
${script}
`;

function writeFakeClaude(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, FAKE_BIN_TEMPLATE(body));
  chmodSync(path, 0o755);
  return path;
}

const TRIGGER_SCRIPT = `
import { readdirSync } from 'node:fs';
import { basename } from 'node:path';

const commandsDir = '.claude/commands';
const files = readdirSync(commandsDir);
const id = basename(files[0], '.md');

const event = {
  type: 'stream_event',
  event: {
    type: 'content_block_start',
    content_block: { type: 'tool_use', name: 'Skill' },
  },
};
process.stdout.write(JSON.stringify(event) + '\\n');

const delta = {
  type: 'stream_event',
  event: {
    type: 'content_block_delta',
    delta: { type: 'input_json_delta', partial_json: JSON.stringify({ skill: id }) },
  },
};
process.stdout.write(JSON.stringify(delta) + '\\n');
process.exit(0);
`;

const MISS_SCRIPT = `
// Just exit cleanly with no tool_use.
process.exit(0);
`;

const NONZERO_SCRIPT = `
process.stderr.write('something blew up\\n');
process.exit(7);
`;

const HANG_SCRIPT = `
setInterval(() => {}, 1000);
`;

describe('runQuery', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'skill-eval-rq-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns outcome=trigger when fake claude emits a matching Skill tool_use', async () => {
    const bin = writeFakeClaude(tmp, 'claude', TRIGGER_SCRIPT);
    const result = await runQuery({
      query: 'anything',
      skillName: 'fake-skill',
      skillDescription: 'desc',
      claudeBin: bin,
    });
    expect(result.outcome).toBe('trigger');
    expect(result.error).toBeUndefined();
  });

  it('returns outcome=miss when fake claude exits cleanly without a verdict', async () => {
    const bin = writeFakeClaude(tmp, 'claude', MISS_SCRIPT);
    const result = await runQuery({
      query: 'anything',
      skillName: 'fake-skill',
      skillDescription: 'desc',
      claudeBin: bin,
    });
    expect(result.outcome).toBe('miss');
  });

  it('returns outcome=error with stderr tail when claude exits non-zero', async () => {
    const bin = writeFakeClaude(tmp, 'claude', NONZERO_SCRIPT);
    const result = await runQuery({
      query: 'anything',
      skillName: 'fake-skill',
      skillDescription: 'desc',
      claudeBin: bin,
    });
    expect(result.outcome).toBe('error');
    expect(result.error).toMatch(/exited with code 7/);
    expect(result.error).toMatch(/something blew up/);
  });

  it('returns outcome=error with "timeout" message when claude hangs', async () => {
    const bin = writeFakeClaude(tmp, 'claude', HANG_SCRIPT);
    const result = await runQuery({
      query: 'anything',
      skillName: 'fake-skill',
      skillDescription: 'desc',
      claudeBin: bin,
      timeoutMs: 200,
    });
    expect(result.outcome).toBe('error');
    expect(result.error).toMatch(/timeout/i);
  });

  it('returns outcome=error when claude binary is missing (ENOENT)', async () => {
    const result = await runQuery({
      query: 'anything',
      skillName: 'fake-skill',
      skillDescription: 'desc',
      claudeBin: join(tmp, 'does-not-exist'),
    });
    expect(result.outcome).toBe('error');
    expect(result.error).toBeDefined();
  });

  it('cleans up its tempdir after the run', async () => {
    const { readdirSync } = await import('node:fs');
    const before = readdirSync(tmpdir()).filter((n) =>
      n.startsWith('skill-eval-')
    );
    const bin = writeFakeClaude(tmp, 'claude', MISS_SCRIPT);
    await runQuery({
      query: 'anything',
      skillName: 'fake-skill',
      skillDescription: 'desc',
      claudeBin: bin,
    });
    const after = readdirSync(tmpdir()).filter((n) =>
      n.startsWith('skill-eval-')
    );
    expect(after.length).toBeLessThanOrEqual(before.length);
  });
});

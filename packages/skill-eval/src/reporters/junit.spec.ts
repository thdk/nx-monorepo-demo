import { describe, expect, it } from 'vitest';

import type { TriggerRunOutput } from '../types.js';

import { renderJunit } from './junit.js';

function makeOutput(): TriggerRunOutput {
  return {
    skill_name: 'react-best-practices',
    description: 'desc',
    model: 'claude-sonnet-4-6',
    runs_per_query: 3,
    trigger_threshold: 0.5,
    results: [
      {
        query: 'where does my admin/users page go?',
        should_trigger: true,
        triggers: 3,
        misses: 0,
        errors: 0,
        runs: 3,
        trigger_rate: 1,
        pass: true,
        records: [
          { outcome: 'trigger', duration_ms: 1200 },
          { outcome: 'trigger', duration_ms: 900 },
          { outcome: 'trigger', duration_ms: 1100 },
        ],
      },
      {
        query: 'set up React Router v7 in a new Vite app',
        should_trigger: false,
        triggers: 2,
        misses: 1,
        errors: 0,
        runs: 3,
        trigger_rate: 0.6667,
        pass: false,
        records: [
          { outcome: 'trigger', duration_ms: 500 },
          { outcome: 'miss', duration_ms: 700 },
          { outcome: 'trigger', duration_ms: 600 },
        ],
      },
    ],
    summary: {
      total: 2,
      passed: 1,
      failed: 1,
      errored: 0,
      precision: 0.6,
      recall: 1,
      accuracy: 0.6667,
    },
  };
}

describe('renderJunit', () => {
  it('emits a testsuites element with totals', () => {
    const xml = renderJunit(makeOutput());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('tests="2"');
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('errors="0"');
    expect(xml).toContain('name="trigger:react-best-practices"');
  });

  it('emits a passing testcase with no failure child and a real wall time', () => {
    const xml = renderJunit(makeOutput());
    expect(xml).toContain(
      '[should-trigger] where does my admin/users page go?'
    );
    const passLine = xml.match(
      /<testcase[^>]*should-trigger[^>]*time="3\.200"[^>]*\/>/
    );
    expect(passLine).not.toBeNull();
  });

  it('emits a failing testcase with a failure message describing the rate', () => {
    const xml = renderJunit(makeOutput());
    expect(xml).toContain('Expected NOT to trigger but rate was 67% (2/3)');
  });

  it('escapes XML metacharacters in queries', () => {
    const out = makeOutput();
    const first = out.results[0];
    if (!first) throw new Error('test fixture broken');
    first.query = 'where do <Foo /> & "Bar" go?';
    const xml = renderJunit(out);
    expect(xml).toContain('&lt;Foo /&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;Bar&quot;');
  });

  it('surfaces errored runs as <error> children and bumps errors count', () => {
    const out = makeOutput();
    const second = out.results[1];
    if (!second) throw new Error('test fixture broken');
    second.errors = 1;
    second.records[1] = {
      outcome: 'error',
      duration_ms: 30000,
      error: 'timeout after 30000ms',
    };
    second.misses = 0;
    second.runs = 3;
    out.summary.errored = 1;
    const xml = renderJunit(out);
    expect(xml).toContain('errors="1"');
    expect(xml).toContain('<error message="1 run(s) errored">');
    expect(xml).toContain('timeout after 30000ms');
  });
});

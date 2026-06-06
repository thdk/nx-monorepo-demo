import { describe, expect, it, vi } from 'vitest';

import type { ExecutionResult } from '../types.js';

import { gradeExecution } from './grader.js';

function makeExecution(): ExecutionResult {
  return {
    final_text: 'use app/routes/admin/users/list.route.tsx',
    tool_uses: [],
    output_files: [],
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    duration_ms: 1000,
    ok: true,
  };
}

describe('gradeExecution dispatcher', () => {
  it('short-circuits when expectations is empty (any mode)', async () => {
    const result = await gradeExecution({
      query: 'q',
      expectations: [],
      execution: makeExecution(),
      graderModel: 'claude-sonnet-4-6',
    });
    expect(result).toEqual({
      expectations: [],
      summary: { passed: 0, failed: 0, total: 0, pass_rate: 0 },
    });
  });

  it('defaults to claude-p mode (does not require API key)', async () => {
    const runClaudeP = vi.fn(async () =>
      JSON.stringify({
        expectations: [
          {
            text: 'mentions list.route.tsx',
            passed: true,
            evidence: 'output contains it',
          },
        ],
      })
    );
    const result = await gradeExecution({
      query: 'q',
      expectations: ['mentions list.route.tsx'],
      execution: makeExecution(),
      graderModel: 'claude-sonnet-4-6',
      runClaudeP,
    });
    expect(runClaudeP).toHaveBeenCalledOnce();
    expect(result.summary).toEqual({
      passed: 1,
      failed: 0,
      total: 1,
      pass_rate: 1,
    });
    expect(result.expectations[0]?.passed).toBe(true);
  });

  it('coerces a grader response that wraps JSON in a ```json fence', async () => {
    const runClaudeP = vi.fn(
      async () =>
        '```json\n{"expectations":[{"text":"x","passed":false,"evidence":"missing"}]}\n```'
    );
    const result = await gradeExecution({
      query: 'q',
      expectations: ['x'],
      execution: makeExecution(),
      graderModel: 'claude-sonnet-4-6',
      mode: 'claude-p',
      runClaudeP,
    });
    expect(result.expectations[0]).toEqual({
      text: 'x',
      passed: false,
      evidence: 'missing',
    });
  });

  it('fills missing fields with safe defaults if the grader returns a partial item', async () => {
    const runClaudeP = vi.fn(async () => '{"expectations":[{"text":"x"}]}');
    const result = await gradeExecution({
      query: 'q',
      expectations: ['x'],
      execution: makeExecution(),
      graderModel: 'claude-sonnet-4-6',
      mode: 'claude-p',
      runClaudeP,
    });
    expect(result.expectations[0]).toEqual({
      text: 'x',
      passed: false,
      evidence: 'grader returned no evidence',
    });
  });

  it('throws with a useful message when grader returns garbage', async () => {
    const runClaudeP = vi.fn(async () => 'sorry I can not do that');
    await expect(
      gradeExecution({
        query: 'q',
        expectations: ['x'],
        execution: makeExecution(),
        graderModel: 'claude-sonnet-4-6',
        mode: 'claude-p',
        runClaudeP,
      })
    ).rejects.toThrow(/Grader \(claude-p\)/);
  });

  it('routes to the api path when mode=api (smoke: client is invoked)', async () => {
    const fakeClient = {
      messages: {
        create: vi.fn(async () => ({
          content: [
            {
              type: 'tool_use',
              name: 'submit_grading',
              input: {
                expectations: [{ text: 'x', passed: true, evidence: 'ok' }],
              },
            },
          ],
        })),
      },
    } as unknown as import('@anthropic-ai/sdk').default;

    const result = await gradeExecution({
      query: 'q',
      expectations: ['x'],
      execution: makeExecution(),
      graderModel: 'claude-sonnet-4-6',
      mode: 'api',
      client: fakeClient,
    });
    expect(result.summary.passed).toBe(1);
  });
});

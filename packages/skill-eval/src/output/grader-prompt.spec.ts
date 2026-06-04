import { describe, expect, it } from 'vitest';

import type { ExecutionResult } from '../types.js';

import {
  buildClaudePGraderPrompt,
  buildUserMessage,
  extractJsonObject,
  GRADER_TOOL,
} from './grader-prompt.js';

function makeExecution(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    final_text: 'Place the file at app/routes/admin/users/list.route.tsx',
    tool_uses: [{ name: 'Read', count: 2 }],
    output_files: [],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    duration_ms: 12_000,
    ok: true,
    ...overrides,
  };
}

describe('buildUserMessage', () => {
  it('includes the query, transcript, tool uses, and expectations', () => {
    const msg = buildUserMessage({
      query: 'where does my admin/users list page go?',
      expectations: ['It mentions .route.tsx', 'It mentions feature folders'],
      execution: makeExecution(),
    });
    expect(msg).toContain('where does my admin/users list page go?');
    expect(msg).toContain('app/routes/admin/users/list.route.tsx');
    expect(msg).toContain('Read × 2');
    expect(msg).toContain('1. It mentions .route.tsx');
    expect(msg).toContain('2. It mentions feature folders');
  });

  it('emits (none) when there are no tools or output files', () => {
    const msg = buildUserMessage({
      query: 'q',
      expectations: ['exp'],
      execution: makeExecution({ tool_uses: [], output_files: [] }),
    });
    expect(msg).toContain('# Tool usage during the run\n\n(none)');
    expect(msg).toContain('# Output files written by the model\n\n(none)');
  });

  it('truncates very long final_text but preserves the expectation list intact', () => {
    const longText = 'X'.repeat(50_000);
    const msg = buildUserMessage(
      { query: 'q', expectations: ['exp-1'], execution: makeExecution({ final_text: longText }) },
      1_000,
    );
    expect(msg).toContain('[... transcript truncated ...]');
    expect(msg).toContain('1. exp-1');
  });

  it('falls back to a placeholder when final_text is empty', () => {
    const msg = buildUserMessage({
      query: 'q',
      expectations: ['exp'],
      execution: makeExecution({ final_text: '' }),
    });
    expect(msg).toContain("(no text response)");
  });
});

describe('GRADER_TOOL', () => {
  it('declares the expected JSON schema shape', () => {
    expect(GRADER_TOOL.name).toBe('submit_grading');
    expect(GRADER_TOOL.input_schema.required).toEqual(['expectations']);
    const itemSchema = GRADER_TOOL.input_schema.properties.expectations.items;
    expect(itemSchema.required).toEqual(['text', 'passed', 'evidence']);
  });
});

describe('buildClaudePGraderPrompt', () => {
  it('embeds the rubric, the user message body, and the JSON-only directive', () => {
    const prompt = buildClaudePGraderPrompt({
      query: 'q',
      expectations: ['exp-1', 'exp-2'],
      execution: makeExecution(),
    });
    expect(prompt).toContain('You evaluate'); // GRADER_SYSTEM_PROMPT
    expect(prompt).toContain('1. exp-1');
    expect(prompt).toContain('2. exp-2');
    expect(prompt).toContain('Return ONLY a JSON object');
    expect(prompt).toContain('Keep the array in the same order');
  });
});

describe('extractJsonObject', () => {
  it('parses bare JSON', () => {
    expect(extractJsonObject('{"expectations":[]}')).toEqual({ expectations: [] });
  });

  it('strips a ```json fence', () => {
    const text = '```json\n{"expectations":[{"text":"x","passed":true,"evidence":"y"}]}\n```';
    expect(extractJsonObject(text)).toEqual({
      expectations: [{ text: 'x', passed: true, evidence: 'y' }],
    });
  });

  it('strips a generic ``` fence', () => {
    const text = '```\n{"foo": 1}\n```';
    expect(extractJsonObject(text)).toEqual({ foo: 1 });
  });

  it('extracts a JSON object surrounded by prose', () => {
    const text = "Sure, here's my grading:\n{\"expectations\":[]}\nHope this helps!";
    expect(extractJsonObject(text)).toEqual({ expectations: [] });
  });

  it('handles nested braces correctly via balanced first..last bracket slice', () => {
    const text = 'prose {"a":{"b":1},"c":[1,2,3]} more prose';
    expect(extractJsonObject(text)).toEqual({ a: { b: 1 }, c: [1, 2, 3] });
  });

  it('throws on empty input', () => {
    expect(() => extractJsonObject('')).toThrow(/Empty/);
    expect(() => extractJsonObject('   \n   ')).toThrow(/Empty/);
  });

  it('throws when no JSON object is present', () => {
    expect(() => extractJsonObject('no braces here at all')).toThrow(/No JSON object/);
  });
});

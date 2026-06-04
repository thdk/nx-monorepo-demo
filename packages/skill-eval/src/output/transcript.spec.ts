import { describe, expect, it } from 'vitest';

import { consume, createAccumulator, parseStreamJsonl, summarise } from './transcript.js';

describe('transcript accumulator', () => {
  it('accumulates text_delta into finalText', () => {
    const acc = createAccumulator();
    consume(acc, {
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
    });
    consume(acc, {
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } },
    });
    expect(acc.finalText).toBe('Hello world');
  });

  it('overrides finalText with the latest assistant message', () => {
    const acc = createAccumulator();
    consume(acc, {
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'midstream' } },
    });
    consume(acc, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'final answer' }] },
    });
    expect(acc.finalText).toBe('final answer');
  });

  it('counts tool uses by name', () => {
    const acc = createAccumulator();
    const start = (name: string) => ({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        content_block: { type: 'tool_use', name },
      },
    });
    consume(acc, start('Read'));
    consume(acc, start('Read'));
    consume(acc, start('Bash'));
    const out = summarise(acc);
    expect(out.tool_uses).toEqual([
      { name: 'Read', count: 2 },
      { name: 'Bash', count: 1 },
    ]);
  });

  it('captures usage from result event and marks ok', () => {
    const acc = createAccumulator();
    consume(acc, {
      type: 'result',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const out = summarise(acc);
    expect(out.usage).toEqual({ input_tokens: 100, output_tokens: 50, total_tokens: 150 });
    expect(out.ok).toBe(true);
    expect(out.error).toBeNull();
  });

  it('marks not-ok when result has is_error', () => {
    const acc = createAccumulator();
    consume(acc, { type: 'result', is_error: true, error: 'rate limited', usage: {} });
    const out = summarise(acc);
    expect(out.ok).toBe(false);
    expect(out.error).toBe('rate limited');
  });

  it('parses a multi-line stream_jsonl string end-to-end', () => {
    const jsonl = [
      JSON.stringify({
        type: 'stream_event',
        event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Read' } },
      }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'route file goes under app/routes/users/' }] },
      }),
      JSON.stringify({ type: 'result', usage: { input_tokens: 200, output_tokens: 80 } }),
    ].join('\n');

    const out = parseStreamJsonl(jsonl);
    expect(out.final_text).toBe('route file goes under app/routes/users/');
    expect(out.tool_uses).toEqual([{ name: 'Read', count: 1 }]);
    expect(out.usage.total_tokens).toBe(280);
    expect(out.ok).toBe(true);
  });
});

import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createTableRenderer } from './live-table.js';

function collect(stream: PassThrough): { chunks: string[]; text: () => string } {
  const chunks: string[] = [];
  stream.on('data', (c: Buffer | string) => chunks.push(c.toString()));
  return { chunks, text: () => chunks.join('') };
}

describe('createTableRenderer (append mode)', () => {
  it('emits each final row exactly once, in row-index order', () => {
    const stream = new PassThrough();
    const sink = collect(stream);
    const r = createTableRenderer({ stream, force: 'append' });

    r.render([{ content: 'a', final: false }, { content: 'b', final: false }]);
    expect(sink.text()).toBe('');

    // Row 1 finishes before row 0 — must still wait for row 0.
    r.render([{ content: 'a', final: false }, { content: 'b', final: true }]);
    expect(sink.text()).toBe('');

    // Row 0 finishes — both flush in order.
    r.render([{ content: 'a', final: true }, { content: 'b', final: true }]);
    expect(sink.text()).toBe('a\nb\n');

    // Subsequent renders are a no-op.
    r.render([{ content: 'a', final: true }, { content: 'b', final: true }]);
    expect(sink.text()).toBe('a\nb\n');
  });

  it('does not emit rows that are never marked final', () => {
    const stream = new PassThrough();
    const sink = collect(stream);
    const r = createTableRenderer({ stream, force: 'append' });

    r.render([{ content: 'partial', final: false }]);
    r.done();
    expect(sink.text()).toBe('');
  });
});

describe('createTableRenderer (live mode)', () => {
  it('writes the rendered frame to the stream', () => {
    const stream = new PassThrough();
    Object.assign(stream, { isTTY: true, columns: 200, rows: 50 });
    const sink = collect(stream);
    const r = createTableRenderer({ stream, force: 'live' });

    r.render([{ content: 'row-1' }, { content: 'row-2' }]);
    r.done();

    // log-update writes ANSI escape codes, so we just assert the row text appears.
    expect(sink.text()).toContain('row-1');
    expect(sink.text()).toContain('row-2');
  });
});

describe('TTY detection', () => {
  it('chooses append mode for non-TTY streams', () => {
    const stream = new PassThrough();
    // No isTTY property — defaults to non-TTY behaviour.
    const sink = collect(stream);
    const r = createTableRenderer({ stream });

    r.render([{ content: 'only', final: true }]);
    expect(sink.text()).toBe('only\n');
  });
});

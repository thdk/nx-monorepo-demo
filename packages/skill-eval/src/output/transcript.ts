/**
 * Pure parser for the `claude -p --output-format stream-json` event stream.
 * Consumes parsed JSON events and accumulates the model's final text reply,
 * tool-use counts, and token usage.
 *
 * Kept separate from the subprocess runner so it can be unit-tested with
 * recorded fixtures.
 */

import type { ExecutionUsage, ToolUseSummary } from '../types.js';

export type ParsedEvent = Record<string, unknown>;

export interface TranscriptAccumulator {
  /** Concatenated text deltas from the final assistant turn (in order seen). */
  finalText: string;
  /** Tool invocation counts across the entire run. */
  toolCounts: Map<string, number>;
  usage: ExecutionUsage;
  reachedResult: boolean;
  /** Filled if the result event reports an error string. */
  error: string | null;
}

export function createAccumulator(): TranscriptAccumulator {
  return {
    finalText: '',
    toolCounts: new Map(),
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    reachedResult: false,
    error: null,
  };
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function consume(acc: TranscriptAccumulator, event: ParsedEvent): void {
  const type = event['type'];

  // Mid-stream incremental events.
  if (type === 'stream_event') {
    const se = asRecord(event['event']);
    const seType = se['type'];

    if (seType === 'content_block_start') {
      const cb = asRecord(se['content_block']);
      if (cb['type'] === 'tool_use') {
        const name = isString(cb['name']) ? cb['name'] : '<unknown>';
        acc.toolCounts.set(name, (acc.toolCounts.get(name) ?? 0) + 1);
      }
      return;
    }

    if (seType === 'content_block_delta') {
      const delta = asRecord(se['delta']);
      if (delta['type'] === 'text_delta' && isString(delta['text'])) {
        acc.finalText += delta['text'];
      }
    }
    return;
  }

  // Full assistant message (sent on completion of a turn).
  if (type === 'assistant') {
    const message = asRecord(event['message']);
    const content = Array.isArray(message['content']) ? message['content'] : [];
    // Replace finalText with the latest assistant turn's text content. This
    // ensures the *last* assistant message wins if there are multiple turns.
    const textParts: string[] = [];
    for (const item of content) {
      const block = asRecord(item);
      if (block['type'] === 'text' && isString(block['text'])) {
        textParts.push(block['text']);
      }
    }
    if (textParts.length > 0) {
      acc.finalText = textParts.join('\n');
    }
    return;
  }

  // Terminal result event with usage stats and (optionally) error info.
  if (type === 'result') {
    acc.reachedResult = true;
    const usage = asRecord(event['usage']);
    const input = isNumber(usage['input_tokens']) ? usage['input_tokens'] : 0;
    const output = isNumber(usage['output_tokens'])
      ? usage['output_tokens']
      : 0;
    acc.usage = {
      input_tokens: input,
      output_tokens: output,
      total_tokens: input + output,
    };
    if (event['is_error'] === true) {
      acc.error = isString(event['error'])
        ? event['error']
        : 'unknown error from claude -p';
    }
  }
}

export function summarise(acc: TranscriptAccumulator): {
  final_text: string;
  tool_uses: ToolUseSummary[];
  usage: ExecutionUsage;
  ok: boolean;
  error: string | null;
} {
  const tool_uses: ToolUseSummary[] = Array.from(acc.toolCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return {
    final_text: acc.finalText.trim(),
    tool_uses,
    usage: acc.usage,
    ok: acc.reachedResult && acc.error === null,
    error: acc.error,
  };
}

export function parseStreamJsonl(jsonl: string): ReturnType<typeof summarise> {
  const acc = createAccumulator();
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: ParsedEvent;
    try {
      event = JSON.parse(trimmed) as ParsedEvent;
    } catch {
      continue;
    }
    consume(acc, event);
  }
  return summarise(acc);
}

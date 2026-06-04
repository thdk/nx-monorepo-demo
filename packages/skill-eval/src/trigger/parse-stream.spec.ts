import { describe, expect, it } from 'vitest';

import { createParserState, feedEvent } from './parse-stream.js';

const TRIGGER_ID = 'react-router-file-structure-conventions-skill-abc12345';

function feed(events: Array<Record<string, unknown>>) {
  const state = createParserState();
  for (const event of events) {
    const verdict = feedEvent(state, event, TRIGGER_ID);
    if (verdict.decided) return verdict;
  }
  return { decided: false as const };
}

const startSkill = (name = 'Skill') => ({
  type: 'stream_event',
  event: {
    type: 'content_block_start',
    content_block: { type: 'tool_use', name },
  },
});

const deltaPartial = (partial: string) => ({
  type: 'stream_event',
  event: {
    type: 'content_block_delta',
    delta: { type: 'input_json_delta', partial_json: partial },
  },
});

const stop = () => ({
  type: 'stream_event',
  event: { type: 'content_block_stop' },
});

const messageStop = () => ({
  type: 'stream_event',
  event: { type: 'message_stop' },
});

describe('feedEvent', () => {
  it('returns triggered=true when Skill tool input contains the trigger id', () => {
    const verdict = feed([
      startSkill('Skill'),
      deltaPartial('{"skill":"'),
      deltaPartial(`${TRIGGER_ID}"}`),
    ]);
    expect(verdict).toEqual({ decided: true, triggered: true });
  });

  it('returns triggered=true via Read tool reading the skill file', () => {
    const verdict = feed([
      startSkill('Read'),
      deltaPartial(`{"file_path":"/tmp/${TRIGGER_ID}.md"}`),
    ]);
    expect(verdict).toEqual({ decided: true, triggered: true });
  });

  it('returns triggered=false the moment another tool is selected', () => {
    const verdict = feed([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          content_block: { type: 'tool_use', name: 'Bash' },
        },
      },
    ]);
    expect(verdict).toEqual({ decided: true, triggered: false });
  });

  it('returns triggered=false when Skill/Read is invoked with a different id', () => {
    const verdict = feed([
      startSkill('Skill'),
      deltaPartial('{"skill":"some-other-skill"}'),
      stop(),
    ]);
    expect(verdict).toEqual({ decided: true, triggered: false });
  });

  it('handles trigger id split across delta chunks', () => {
    const half = Math.floor(TRIGGER_ID.length / 2);
    const verdict = feed([
      startSkill('Skill'),
      deltaPartial('{"skill":"'),
      deltaPartial(TRIGGER_ID.slice(0, half)),
      deltaPartial(`${TRIGGER_ID.slice(half)}"}`),
    ]);
    expect(verdict).toEqual({ decided: true, triggered: true });
  });

  it('returns triggered=false on message_stop with no tool use', () => {
    const verdict = feed([messageStop()]);
    expect(verdict).toEqual({ decided: true, triggered: false });
  });

  it('detects via fallback assistant message tool_use', () => {
    const verdict = feed([
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Skill',
              input: { skill: TRIGGER_ID },
            },
          ],
        },
      },
    ]);
    expect(verdict).toEqual({ decided: true, triggered: true });
  });

  it('ignores non-tool_use content blocks (text)', () => {
    const verdict = feed([
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          content_block: { type: 'text' },
        },
      },
    ]);
    expect(verdict).toEqual({ decided: false });
  });
});

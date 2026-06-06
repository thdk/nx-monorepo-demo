/**
 * State machine for detecting whether a skill (registered as a slash command
 * with the unique ID `triggerId`) was invoked by Claude during a `claude -p`
 * stream-json session.
 *
 * The machine is fed parsed JSON events one at a time and returns:
 *   - { decided: false }                — keep feeding
 *   - { decided: true, triggered: bool } — terminal verdict
 *
 * Ported from skill-creator/scripts/run_eval.py::run_single_query.
 */

export type ParsedEvent = Record<string, unknown>;

export interface StreamParserState {
  pendingTool: 'Skill' | 'Read' | null;
  accumulatedJson: string;
}

export interface Verdict {
  decided: boolean;
  triggered?: boolean;
}

const KEEP_FEEDING: Verdict = { decided: false };

export function createParserState(): StreamParserState {
  return { pendingTool: null, accumulatedJson: '' };
}

export function feedEvent(
  state: StreamParserState,
  event: ParsedEvent,
  triggerId: string
): Verdict {
  const type = event['type'];

  if (type === 'stream_event') {
    const se = (event['event'] ?? {}) as ParsedEvent;
    const seType = se['type'];

    if (seType === 'content_block_start') {
      const cb = (se['content_block'] ?? {}) as ParsedEvent;
      if (cb['type'] === 'tool_use') {
        const toolName = cb['name'];
        if (toolName === 'Skill' || toolName === 'Read') {
          state.pendingTool = toolName;
          state.accumulatedJson = '';
        } else {
          return { decided: true, triggered: false };
        }
      }
      return KEEP_FEEDING;
    }

    if (seType === 'content_block_delta' && state.pendingTool) {
      const delta = (se['delta'] ?? {}) as ParsedEvent;
      if (delta['type'] === 'input_json_delta') {
        state.accumulatedJson += (delta['partial_json'] ?? '') as string;
        if (state.accumulatedJson.includes(triggerId)) {
          return { decided: true, triggered: true };
        }
      }
      return KEEP_FEEDING;
    }

    if (seType === 'content_block_stop' && state.pendingTool) {
      return {
        decided: true,
        triggered: state.accumulatedJson.includes(triggerId),
      };
    }

    if (seType === 'message_stop') {
      if (state.pendingTool) {
        return {
          decided: true,
          triggered: state.accumulatedJson.includes(triggerId),
        };
      }
      return { decided: true, triggered: false };
    }

    return KEEP_FEEDING;
  }

  // Fallback: full assistant message with completed tool_use blocks.
  if (type === 'assistant') {
    const message = (event['message'] ?? {}) as ParsedEvent;
    const content = (message['content'] ?? []) as ParsedEvent[];
    for (const item of content) {
      if (item['type'] !== 'tool_use') continue;
      const toolName = item['name'];
      const input = (item['input'] ?? {}) as ParsedEvent;
      if (
        toolName === 'Skill' &&
        typeof input['skill'] === 'string' &&
        input['skill'].includes(triggerId)
      ) {
        return { decided: true, triggered: true };
      }
      if (
        toolName === 'Read' &&
        typeof input['file_path'] === 'string' &&
        input['file_path'].includes(triggerId)
      ) {
        return { decided: true, triggered: true };
      }
      // Some other tool was chosen first — terminate.
      return { decided: true, triggered: false };
    }
    return KEEP_FEEDING;
  }

  if (type === 'result') {
    return { decided: true, triggered: false };
  }

  return KEEP_FEEDING;
}

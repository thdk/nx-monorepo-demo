/**
 * Pure helpers for assembling the grader API call. Kept separate from the SDK
 * call site so prompt assembly can be unit-tested without hitting the network.
 */

import type { ExecutionResult } from '../types.js';

export interface GraderInputs {
  query: string;
  expectations: string[];
  execution: ExecutionResult;
}

export const GRADER_SYSTEM_PROMPT = `You evaluate whether a Claude Code skill's response satisfies a list of objective expectations.

For each expectation, decide PASS or FAIL based on the model's transcript and any output files. Cite specific evidence — a short quote, a file path, or a concise description of what you found.

A PASS requires evidence of genuine, substantive satisfaction — not just surface compliance (e.g. the right filename mentioned with the wrong content fails).

A FAIL requires either no supporting evidence, contradicting evidence, or evidence that the satisfaction is superficial.

The burden of proof to PASS sits on the expectation. When in doubt, FAIL.

Submit your grading via the submit_grading tool. Do not write any prose outside the tool call.`;

// Plain (non-readonly) shape so it matches the SDK's `Tool.input_schema` type,
// which expects mutable string[] for `required`.
export const GRADER_TOOL = {
  name: 'submit_grading',
  description: 'Submit graded expectations for the given response.',
  input_schema: {
    type: 'object' as const,
    properties: {
      expectations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            passed: { type: 'boolean' },
            evidence: { type: 'string' },
          },
          required: ['text', 'passed', 'evidence'],
        },
      },
    },
    required: ['expectations'],
  },
};

function formatExpectations(items: string[]): string {
  return items.map((e, i) => `${i + 1}. ${e}`).join('\n');
}

function formatToolUses(execution: ExecutionResult): string {
  if (execution.tool_uses.length === 0) return '(none)';
  return execution.tool_uses.map((t) => `- ${t.name} × ${t.count}`).join('\n');
}

function formatOutputFiles(execution: ExecutionResult): string {
  if (execution.output_files.length === 0) return '(none)';
  return execution.output_files.map((f) => `- ${f}`).join('\n');
}

const TRANSCRIPT_TRUNCATION_HINT = '\n\n[... transcript truncated ...]';

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - TRANSCRIPT_TRUNCATION_HINT.length) + TRANSCRIPT_TRUNCATION_HINT;
}

export function buildUserMessage(inputs: GraderInputs, transcriptMaxChars = 30_000): string {
  const { query, expectations, execution } = inputs;
  return [
    `# User query`,
    '',
    query,
    '',
    `# Model's final response`,
    '',
    truncate(execution.final_text || '(no text response)', transcriptMaxChars),
    '',
    `# Tool usage during the run`,
    '',
    formatToolUses(execution),
    '',
    `# Output files written by the model`,
    '',
    formatOutputFiles(execution),
    '',
    `# Expectations to grade`,
    '',
    formatExpectations(expectations),
  ].join('\n');
}

/**
 * Combined prompt for the `claude -p` grader path. No structured-output tool
 * forcing available here, so the prompt asks firmly for a JSON-only response
 * and we lean on `extractJsonObject` to recover from minor formatting drift.
 */
export function buildClaudePGraderPrompt(inputs: GraderInputs, transcriptMaxChars = 30_000): string {
  return [
    GRADER_SYSTEM_PROMPT,
    '',
    '---',
    '',
    buildUserMessage(inputs, transcriptMaxChars),
    '',
    '---',
    '',
    'Return ONLY a JSON object (no prose before or after, no markdown fences) with this exact shape:',
    '',
    '```',
    '{',
    '  "expectations": [',
    '    { "text": "<verbatim expectation text>", "passed": true | false, "evidence": "<concise quote or description>" }',
    '  ]',
    '}',
    '```',
    '',
    'Keep the array in the same order as the expectations listed above, one entry per expectation.',
  ].join('\n');
}

const FENCE_RE = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```\s*$/;

/**
 * Best-effort JSON-object extractor for free-form text responses. Handles:
 *  - bare JSON
 *  - JSON wrapped in ```json ... ``` or ``` ... ``` fences
 *  - JSON with extra prose before or after (extracts the first balanced `{...}` block)
 */
export function extractJsonObject(text: string): unknown {
  if (!text || text.trim() === '') {
    throw new Error('Empty grader response');
  }

  let candidate = text.trim();

  const fenceMatch = candidate.match(FENCE_RE);
  if (fenceMatch && fenceMatch[1]) {
    candidate = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(candidate);
  } catch {
    // fall through to brace extraction
  }

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error(`No JSON object found in grader response: ${candidate.slice(0, 200)}`);
  }
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

import Anthropic from '@anthropic-ai/sdk';

import type {
  ExpectationGrade,
  GradingResult,
  ExecutionResult,
} from '../types.js';
import { runClaudeP, type RunClaudePOptions } from '../util/claude-p.js';

import {
  buildClaudePGraderPrompt,
  buildUserMessage,
  extractJsonObject,
  GRADER_SYSTEM_PROMPT,
  GRADER_TOOL,
} from './grader-prompt.js';

export type GraderMode = 'api' | 'claude-p';

export interface GradeOptions {
  query: string;
  expectations: string[];
  execution: ExecutionResult;
  graderModel: string;
  /** Default 'claude-p' — reuses Claude Code's local auth. 'api' uses the SDK directly. */
  mode?: GraderMode;
  /** Soft cap on grader response size (api mode only — claude-p sizes via prompt). */
  maxOutputTokens?: number;
  // --- api mode seams ---
  client?: Anthropic;
  // --- claude-p mode seams ---
  claudeBin?: string;
  timeoutMs?: number;
  /** DI seam for tests — replace the actual subprocess call. */
  runClaudeP?: (prompt: string, opts: RunClaudePOptions) => Promise<string>;
}

const DEFAULT_CLAUDE_P_TIMEOUT_MS = 2 * 60_000;

interface RawGrading {
  expectations: Array<{ text: unknown; passed: unknown; evidence: unknown }>;
}

function coerceGrading(
  raw: unknown,
  expectations: string[]
): ExpectationGrade[] {
  const r = raw as RawGrading | null | undefined;
  const items = Array.isArray(r?.expectations) ? r.expectations : [];

  return expectations.map((text, i) => {
    const item = items[i];
    const passed =
      item && typeof item.passed === 'boolean' ? item.passed : false;
    const evidence =
      item && typeof item.evidence === 'string'
        ? item.evidence
        : 'grader returned no evidence';
    return { text, passed, evidence };
  });
}

function summarise(graded: ExpectationGrade[]): GradingResult {
  const passed = graded.filter((g) => g.passed).length;
  return {
    expectations: graded,
    summary: {
      passed,
      failed: graded.length - passed,
      total: graded.length,
      pass_rate:
        graded.length > 0 ? Number((passed / graded.length).toFixed(4)) : 0,
    },
  };
}

async function gradeViaApi(options: GradeOptions): Promise<GradingResult> {
  const {
    query,
    expectations,
    execution,
    graderModel,
    maxOutputTokens = 1024,
  } = options;
  const client = options.client ?? new Anthropic();

  const response = await client.messages.create({
    model: graderModel,
    max_tokens: maxOutputTokens,
    system: [
      {
        type: 'text',
        text: GRADER_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [GRADER_TOOL],
    tool_choice: { type: 'tool', name: GRADER_TOOL.name },
    messages: [
      {
        role: 'user',
        content: buildUserMessage({ query, expectations, execution }),
      },
    ],
  });

  const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
    throw new Error('Grader (api): no tool_use block returned');
  }

  return summarise(coerceGrading(toolUseBlock.input, expectations));
}

async function gradeViaClaudeP(options: GradeOptions): Promise<GradingResult> {
  const {
    query,
    expectations,
    execution,
    graderModel,
    claudeBin = 'claude',
    timeoutMs = DEFAULT_CLAUDE_P_TIMEOUT_MS,
    runClaudeP: runner = runClaudeP,
  } = options;

  const prompt = buildClaudePGraderPrompt({ query, expectations, execution });
  const responseText = await runner(prompt, {
    model: graderModel,
    claudeBin,
    timeoutMs,
  });

  let raw: unknown;
  try {
    raw = extractJsonObject(responseText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Grader (claude-p): ${message}`);
  }

  return summarise(coerceGrading(raw, expectations));
}

export async function gradeExecution(
  options: GradeOptions
): Promise<GradingResult> {
  if (options.expectations.length === 0) {
    return {
      expectations: [],
      summary: { passed: 0, failed: 0, total: 0, pass_rate: 0 },
    };
  }
  const mode: GraderMode = options.mode ?? 'claude-p';
  return mode === 'api' ? gradeViaApi(options) : gradeViaClaudeP(options);
}

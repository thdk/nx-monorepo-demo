import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { execa, ExecaError } from 'execa';

export interface RunClaudePOptions {
  /** Model passed via `--model`. */
  model: string;
  /** Path to the claude binary (default: 'claude' resolved via PATH). */
  claudeBin?: string;
  /** Hard cap on wall-clock time. Default 2 minutes. */
  timeoutMs?: number;
  /**
   * Extra arguments appended after the prompt. Useful for things like
   * `--max-turns 1` or `--append-system-prompt …`.
   */
  extraArgs?: string[];
}

const DEFAULT_TIMEOUT_MS = 2 * 60_000;
const STDERR_TAIL_BYTES = 4096;

function formatStderrTail(stderr: unknown): string {
  if (typeof stderr !== 'string') return '';
  const tail = stderr.slice(-STDERR_TAIL_BYTES).trim();
  return tail ? `\n--- stderr ---\n${tail}` : '';
}

/**
 * Spawn `claude -p <prompt>` in an isolated tempdir and resolve with the
 * model's plain-text response. Throws on non-zero exit or timeout, including
 * a stderr tail in the error message so callers can surface what went wrong.
 *
 * Used by the grader (claude-p mode) and the init command. Kept here so both
 * call sites share one well-tested wrapper.
 */
export async function runClaudeP(
  prompt: string,
  options: RunClaudePOptions
): Promise<string> {
  const {
    model,
    claudeBin = 'claude',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    extraArgs = [],
  } = options;

  const workdir = mkdtempSync(join(tmpdir(), 'skill-eval-claude-p-'));

  const args = [
    '-p',
    prompt,
    '--output-format',
    'text',
    '--dangerously-skip-permissions',
    '--model',
    model,
    ...extraArgs,
  ];

  const env = { ...process.env };
  delete env.CLAUDECODE;

  try {
    const { stdout } = await execa(claudeBin, args, {
      cwd: workdir,
      env,
      timeout: timeoutMs,
      stdin: 'ignore',
    });
    return stdout;
  } catch (err) {
    if (err instanceof ExecaError) {
      const tail = formatStderrTail(err.stderr);
      if (err.timedOut) {
        throw new Error(`claude -p timed out after ${timeoutMs}ms${tail}`);
      }
      throw new Error(`claude -p exited with code ${err.exitCode}${tail}`);
    }
    throw err;
  } finally {
    try {
      rmSync(workdir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}

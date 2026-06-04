import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

/**
 * Spawn `claude -p <prompt>` in an isolated tempdir and resolve with the
 * model's plain-text response. Throws on non-zero exit or timeout, including
 * a stderr tail in the error message so callers can surface what went wrong.
 *
 * Used by the grader (claude-p mode) and the init command. Kept here so both
 * call sites share one well-tested wrapper.
 */
export async function runClaudeP(prompt: string, options: RunClaudePOptions): Promise<string> {
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

  const controller = new AbortController();
  const started = Date.now();
  let stdout = '';
  let stderrTail = '';
  let timedOut = false;

  try {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(claudeBin, args, {
        cwd: workdir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        signal: controller.signal,
      });

      child.stdout.setEncoding('utf-8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding('utf-8');
      child.stderr.on('data', (chunk: string) => {
        stderrTail = (stderrTail + chunk).slice(-4096);
      });

      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error('timeout'));
      }, timeoutMs);

      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (controller.signal.aborted && err.name === 'AbortError') {
          reject(
            new Error(
              timedOut
                ? `claude -p timed out after ${timeoutMs}ms (elapsed=${Date.now() - started}ms)`
                : 'claude -p aborted',
            ),
          );
          return;
        }
        reject(err);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`claude -p timed out after ${timeoutMs}ms`));
          return;
        }
        if (code !== 0 && code !== null) {
          const tail = stderrTail.trim() ? `\n--- stderr ---\n${stderrTail.trim()}` : '';
          reject(new Error(`claude -p exited with code ${code}${tail}`));
          return;
        }
        resolve(stdout);
      });
    });
  } finally {
    try {
      rmSync(workdir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}

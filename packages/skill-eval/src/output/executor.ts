import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import type { ExecutionResult } from '../types.js';

import { consume, createAccumulator, summarise, type ParsedEvent } from './transcript.js';

export interface ExecutorOptions {
  query: string;
  /** Path to the skill folder to drop into the temp project's .claude/skills/. */
  skillPath: string;
  skillName: string;
  /** If true, run without dropping the skill — the baseline configuration. */
  baseline?: boolean;
  /** Per-run timeout (default 5 minutes — these calls do real work). */
  timeoutMs?: number;
  model?: string | null;
  claudeBin?: string;
  /**
   * If provided, the executor writes:
   *   <artifactsDir>/transcript.jsonl
   *   <artifactsDir>/transcript.md (just the final assistant text)
   *   <artifactsDir>/outputs/      (any files the model created in workdir)
   *   <artifactsDir>/timing.json
   */
  artifactsDir?: string;
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

function collectOutputFiles(workdir: string): string[] {
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // Skip the skill drop directory.
      if (dir === workdir && entry.name === '.claude') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        results.push(relative(workdir, full));
      }
    }
  };
  walk(workdir);
  return results.sort();
}

export async function executeQuery(options: ExecutorOptions): Promise<ExecutionResult> {
  const {
    query,
    skillPath,
    skillName,
    baseline = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    model,
    claudeBin = 'claude',
    artifactsDir,
  } = options;

  const workdir = mkdtempSync(join(tmpdir(), 'skill-eval-output-'));
  const skillsDir = join(workdir, '.claude', 'skills');

  if (!baseline) {
    mkdirSync(skillsDir, { recursive: true });
    // Copy the entire skill folder so the model can read SKILL.md and any
    // referenced files (references/, scripts/).
    cpSync(skillPath, join(skillsDir, skillName), { recursive: true, dereference: true });
  }

  const args = [
    '-p',
    query,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--dangerously-skip-permissions',
  ];
  if (model) args.push('--model', model);

  const env = { ...process.env };
  delete env.CLAUDECODE;

  const startedAt = Date.now();
  const controller = new AbortController();
  const acc = createAccumulator();
  const transcriptLines: string[] = [];
  let timedOut = false;
  let stderrTail = '';

  const cleanup = () => {
    try {
      rmSync(workdir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  };

  try {
    const child = spawn(claudeBin, args, {
      cwd: workdir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: controller.signal,
    });

    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-8192);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('timeout'));
    }, timeoutMs);

    try {
      await new Promise<void>((resolve, reject) => {
        let buffer = '';
        child.stdout.setEncoding('utf-8');
        child.stdout.on('data', (chunk: string) => {
          buffer += chunk;
          let nl: number;
          while ((nl = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            const trimmed = line.trim();
            if (!trimmed) continue;
            transcriptLines.push(trimmed);
            try {
              const event = JSON.parse(trimmed) as ParsedEvent;
              consume(acc, event);
            } catch {
              // ignore non-JSON lines
            }
          }
        });

        child.on('error', (err: NodeJS.ErrnoException) => {
          if (controller.signal.aborted && err.name === 'AbortError') {
            resolve();
            return;
          }
          reject(err);
        });

        child.on('close', (code, signal) => {
          if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            resolve();
            return;
          }
          if (code !== 0 && code !== null && !acc.reachedResult) {
            reject(
              Object.assign(new Error(`claude exited with code ${code}`), {
                code: 'CLAUDE_NONZERO_EXIT',
              }),
            );
            return;
          }
          resolve();
        });
      });
    } finally {
      clearTimeout(timer);
    }

    const summary = summarise(acc);
    const durationMs = Date.now() - startedAt;
    const outputFiles = baseline ? [] : collectOutputFiles(workdir);

    // Persist artifacts before cleanup wipes the workdir.
    if (artifactsDir) {
      mkdirSync(artifactsDir, { recursive: true });
      writeFileSync(join(artifactsDir, 'transcript.jsonl'), transcriptLines.join('\n') + '\n');
      writeFileSync(join(artifactsDir, 'transcript.md'), summary.final_text + '\n');
      writeFileSync(
        join(artifactsDir, 'timing.json'),
        JSON.stringify(
          {
            duration_ms: durationMs,
            input_tokens: summary.usage.input_tokens,
            output_tokens: summary.usage.output_tokens,
            total_tokens: summary.usage.total_tokens,
          },
          null,
          2,
        ),
      );
      if (outputFiles.length > 0) {
        const outDir = join(artifactsDir, 'outputs');
        mkdirSync(outDir, { recursive: true });
        for (const rel of outputFiles) {
          const src = join(workdir, rel);
          const dst = join(outDir, rel);
          try {
            mkdirSync(join(dst, '..'), { recursive: true });
            // Only copy actual files (cp() should already filter, but be defensive)
            if (statSync(src).isFile()) {
              cpSync(src, dst);
            }
          } catch {
            // ignore individual copy failures
          }
        }
      }
    }

    if (timedOut) {
      return {
        final_text: summary.final_text,
        tool_uses: summary.tool_uses,
        output_files: outputFiles,
        usage: summary.usage,
        duration_ms: durationMs,
        ok: false,
        error: `timeout after ${timeoutMs}ms${stderrTail ? `\n--- stderr ---\n${stderrTail.trim()}` : ''}`,
      };
    }

    return {
      final_text: summary.final_text,
      tool_uses: summary.tool_uses,
      output_files: outputFiles,
      usage: summary.usage,
      duration_ms: durationMs,
      ok: summary.ok,
      ...(summary.error ? { error: summary.error } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      final_text: '',
      tool_uses: [],
      output_files: [],
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      duration_ms: Date.now() - startedAt,
      ok: false,
      error: stderrTail ? `${message}\n--- stderr ---\n${stderrTail.trim()}` : message,
    };
  } finally {
    cleanup();
  }
}

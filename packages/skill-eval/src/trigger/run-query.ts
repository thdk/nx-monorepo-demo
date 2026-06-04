import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { stringify as stringifyYaml } from 'yaml';

import type { RunOutcome } from '../types.js';

import {
  createParserState,
  feedEvent,
  type ParsedEvent,
} from './parse-stream.js';

export interface RunQueryOptions {
  query: string;
  skillName: string;
  skillDescription: string;
  /**
   * Optional override for the working directory. When omitted (recommended),
   * each runQuery call creates its own isolated tempdir so concurrent runs
   * never see each other's temp slash-commands in available_skills.
   */
  projectRoot?: string;
  model?: string | null;
  timeoutMs?: number;
  claudeBin?: string;
}

export interface RunQueryResult {
  outcome: RunOutcome;
  triggerId: string;
  durationMs: number;
  /** Populated only when outcome === 'error'. */
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const STDERR_TAIL_BYTES = 8 * 1024;

function makeTriggerId(skillName: string): string {
  const safe = skillName.replace(/[^A-Za-z0-9_-]/g, '-');
  return `${safe}-skill-${randomBytes(8).toString('hex')}`;
}

function makeCommandContent(skillName: string, description: string): string {
  const frontmatter = stringifyYaml({ description }).trimEnd();
  return `---\n${frontmatter}\n---\n\n# ${skillName}\n\nThis skill handles: ${description}\n`;
}

class RingBuffer {
  private chunks: string[] = [];
  private bytes = 0;

  push(chunk: string): void {
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    while (this.bytes > STDERR_TAIL_BYTES && this.chunks.length > 1) {
      const dropped = this.chunks.shift();
      if (dropped) this.bytes -= dropped.length;
    }
  }

  read(): string {
    return this.chunks.join('').slice(-STDERR_TAIL_BYTES);
  }
}

interface ParserOutcome {
  outcome: Exclude<RunOutcome, 'error'>;
}

function consumeStreamLine(
  state: ReturnType<typeof createParserState>,
  line: string,
  triggerId: string
): ParserOutcome | null {
  if (!line) return null;
  let event: ParsedEvent;
  try {
    event = JSON.parse(line) as ParsedEvent;
  } catch {
    return null;
  }
  const verdict = feedEvent(state, event, triggerId);
  if (!verdict.decided) return null;
  return { outcome: verdict.triggered === true ? 'trigger' : 'miss' };
}

export async function runQuery(
  options: RunQueryOptions
): Promise<RunQueryResult> {
  const {
    query,
    skillName,
    skillDescription,
    projectRoot,
    model,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    claudeBin = 'claude',
  } = options;

  const triggerId = makeTriggerId(skillName);

  // Isolation: each runQuery gets its own tempdir so concurrent runs against
  // the same project never share a `.claude/commands/` directory.
  const ownTempRoot = projectRoot == null;
  const workdir = ownTempRoot
    ? mkdtempSync(join(tmpdir(), 'skill-eval-'))
    : projectRoot;
  const commandsDir = join(workdir, '.claude', 'commands');
  const commandFile = join(commandsDir, `${triggerId}.md`);

  mkdirSync(commandsDir, { recursive: true });
  writeFileSync(commandFile, makeCommandContent(skillName, skillDescription));

  const args = [
    '-p',
    query,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
  ];
  if (model) args.push('--model', model);

  const env = { ...process.env };
  delete env.CLAUDECODE;

  const startedAt = Date.now();
  const controller = new AbortController();
  const stderrTail = new RingBuffer();
  let timedOut = false;

  const cleanup = () => {
    try {
      if (ownTempRoot) {
        rmSync(workdir, { recursive: true, force: true });
      } else {
        rmSync(commandFile, { force: true });
      }
    } catch {
      // best-effort cleanup
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
    child.stderr.on('data', (chunk: string) => stderrTail.push(chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('timeout'));
    }, timeoutMs);

    let parsedOutcome: ParserOutcome | null = null;
    try {
      parsedOutcome = await new Promise<ParserOutcome | null>(
        (resolve, reject) => {
          const state = createParserState();
          let buffer = '';

          child.stdout.setEncoding('utf-8');
          child.stdout.on('data', (chunk: string) => {
            buffer += chunk;
            let nl: number;
            while ((nl = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              const result = consumeStreamLine(state, line, triggerId);
              if (result) {
                resolve(result);
                controller.abort();
                return;
              }
            }
          });

          child.on('error', (err: NodeJS.ErrnoException) => {
            if (controller.signal.aborted && err.name === 'AbortError') {
              // Aborted because we already decided — not a real error.
              resolve(null);
              return;
            }
            reject(err);
          });

          child.on('close', (code, signal) => {
            if (signal === 'SIGTERM' || signal === 'SIGKILL') {
              // We aborted (either decided or timeout) — let resolve/reject paths win.
              resolve(null);
              return;
            }
            if (code !== 0 && code !== null) {
              reject(
                Object.assign(new Error(`claude exited with code ${code}`), {
                  code: 'CLAUDE_NONZERO_EXIT',
                  exitCode: code,
                })
              );
              return;
            }
            // Process exited cleanly with no verdict — the model produced no
            // tool_use that matched, treat as a miss.
            resolve({ outcome: 'miss' });
          });
        }
      );
    } finally {
      clearTimeout(timer);
    }

    if (timedOut && !parsedOutcome) {
      const tail = stderrTail.read().trim();
      const msg = `timeout after ${timeoutMs}ms`;
      return {
        outcome: 'error',
        triggerId,
        durationMs: Date.now() - startedAt,
        error: tail ? `${msg}\n--- stderr ---\n${tail}` : msg,
      };
    }

    return {
      outcome: parsedOutcome?.outcome ?? 'miss',
      triggerId,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const tail = stderrTail.read().trim();
    return {
      outcome: 'error',
      triggerId,
      durationMs: Date.now() - startedAt,
      error: tail ? `${message}\n--- stderr ---\n${tail}` : message,
    };
  } finally {
    cleanup();
  }
}

#!/usr/bin/env node

import { mkdirSync, readFileSync } from 'node:fs';
import { isAbsolute, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import yargs, { type InferredOptionTypes } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { evalSetSchema } from './schemas.js';
import { writeJsonReport } from './reporters/json.js';
import { writeJunitReport } from './reporters/junit.js';
import { writeMarkdownReport } from './reporters/markdown.js';
import { runSet } from './trigger/run-set.js';

const triggerOptions = {
  'eval-set': {
    type: 'string',
    demandOption: true,
    describe: 'Path to eval set JSON file',
  },
  'skill-path': {
    type: 'string',
    demandOption: true,
    describe: 'Path to the skill directory (containing SKILL.md)',
  },
  model: {
    type: 'string',
    default: null as string | null,
    describe: 'Model to pass to claude -p (default: Claude Code default)',
  },
  runs: {
    type: 'number',
    default: 3,
    describe: 'Number of runs per query',
  },
  concurrency: {
    type: 'number',
    default: 5,
    describe: 'Max parallel claude -p invocations',
  },
  threshold: {
    type: 'number',
    default: 0.5,
    describe: 'Trigger rate threshold for pass/fail',
  },
  timeout: {
    type: 'number',
    default: 30,
    describe: 'Per-query timeout in seconds',
  },
  out: {
    type: 'string',
    default: './skill-eval-out',
    describe: 'Output directory for results.json / junit.xml / summary.md',
  },
  'claude-bin': {
    type: 'string',
    default: 'claude',
    describe: 'Path to the claude CLI binary',
  },
} as const;

type TriggerArgs = InferredOptionTypes<typeof triggerOptions>;

function abs(p: string, cwd = process.cwd()): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, '..', 'package.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function triggerCommand(args: TriggerArgs): Promise<void> {
  const evalSetPath = abs(args['eval-set']);
  const skillPath = abs(args['skill-path']);
  const outDir = abs(args.out);
  // claude-bin: only resolve to absolute when it looks like a path. Bare names
  // like `claude` should still resolve via PATH.
  const claudeBin = args['claude-bin'].includes('/') ? abs(args['claude-bin']) : args['claude-bin'];

  const raw = JSON.parse(readFileSync(evalSetPath, 'utf-8')) as unknown;
  const evalSet = evalSetSchema.parse(raw);

  mkdirSync(outDir, { recursive: true });

  const totalRuns = evalSet.evals.length * args.runs;
  process.stderr.write(
    `Running ${evalSet.evals.length} queries × ${args.runs} = ${totalRuns} total runs ` +
      `(concurrency=${args.concurrency})\n`,
  );

  const startedAt = Date.now();
  const output = await runSet({
    evalSet,
    skillPath,
    model: args.model,
    runsPerQuery: args.runs,
    concurrency: args.concurrency,
    triggerThreshold: args.threshold,
    timeoutMs: args.timeout * 1000,
    claudeBin,
    onProgress: ({ query, outcome, durationMs, queryIndex, totalQueries, runIndex, runsPerQuery, error }) => {
      const tag = outcome === 'trigger' ? 'HIT  ' : outcome === 'miss' ? 'miss ' : 'ERROR';
      const progress = `${queryIndex + 1}/${totalQueries}·${runIndex + 1}/${runsPerQuery}`;
      const snippet = query.replace(/\s+/g, ' ').slice(0, 64);
      const errSuffix = error ? `  (${error.split('\n')[0]})` : '';
      process.stderr.write(
        `  [${tag}] ${progress.padEnd(9)} ${(durationMs / 1000).toFixed(1)}s  ${snippet}${errSuffix}\n`,
      );
    },
  });

  writeJsonReport(join(outDir, 'results.json'), output);
  writeJunitReport(join(outDir, 'junit.xml'), output);
  writeMarkdownReport(join(outDir, 'summary.md'), output);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const { summary } = output;
  process.stderr.write(
    `\nDone in ${elapsed}s. ${summary.passed}/${summary.total} passed ` +
      `(precision=${(summary.precision * 100).toFixed(0)}% recall=${(summary.recall * 100).toFixed(0)}% ` +
      `accuracy=${(summary.accuracy * 100).toFixed(0)}%)`,
  );
  if (summary.errored > 0) {
    process.stderr.write(` — ${summary.errored} query(ies) had errored runs`);
  }
  process.stderr.write(`\nReports written to: ${outDir}\n`);

  if (summary.failed > 0 || summary.errored > 0) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  await yargs(hideBin(process.argv))
    .scriptName('skill-eval')
    .version(readPackageVersion())
    .command(
      'trigger',
      'Run trigger evals against a skill description',
      (y) => y.options(triggerOptions),
      async (argv) => {
        await triggerCommand(argv as unknown as TriggerArgs);
      },
    )
    .demandCommand(1)
    .strict()
    .help()
    .parseAsync();
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});

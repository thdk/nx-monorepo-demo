#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { isAbsolute, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import yargs, { type InferredOptionTypes } from 'yargs';
import { hideBin } from 'yargs/helpers';

import { evalSetSchema } from './schemas.js';
import { writeJsonReport } from './reporters/json.js';
import { writeJunitReport } from './reporters/junit.js';
import { writeMarkdownReport } from './reporters/markdown.js';
import { writeOutputJunitReport } from './reporters/output-junit.js';
import { writeOutputMarkdownReport } from './reporters/output-markdown.js';
import { runSet } from './trigger/run-set.js';
import { runOutputSet } from './output/run-set.js';
import { initEvalSet } from './init/run.js';

const triggerOptions = {
  'eval-set': {
    type: 'string',
    describe:
      'Path to eval set JSON file. Defaults to `<skill-path>/evals.json` if omitted.',
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

const outputOptions = {
  'eval-set': {
    type: 'string',
    describe:
      'Path to eval set JSON file. Defaults to `<skill-path>/evals.json` if omitted.',
  },
  'skill-path': {
    type: 'string',
    demandOption: true,
    describe: 'Path to the skill directory (containing SKILL.md)',
  },
  'executor-model': {
    type: 'string',
    default: null as string | null,
    describe: 'Model passed to claude -p when running the skill (default: Claude Code default)',
  },
  'grader-model': {
    type: 'string',
    default: 'claude-sonnet-4-6',
    describe: 'Model used for the LLM-as-judge grader',
  },
  'grader-mode': {
    type: 'string',
    choices: ['claude-p', 'api'] as const,
    default: 'claude-p' as 'claude-p' | 'api',
    describe:
      'How the grader calls the model. `claude-p` (default) reuses your Claude Code login (no extra auth). `api` uses the Anthropic SDK directly (needs ANTHROPIC_API_KEY) and gains prompt caching + forced structured output.',
  },
  runs: {
    type: 'number',
    default: 1,
    describe: 'Number of runs per configuration (output evals are expensive; default 1)',
  },
  concurrency: {
    type: 'number',
    default: 3,
    describe: 'Max parallel executor+grader pipelines',
  },
  baseline: {
    type: 'boolean',
    default: false,
    describe: 'Also run a without_skill baseline for delta comparison',
  },
  'executor-timeout': {
    type: 'number',
    default: 300,
    describe: 'Per-execution timeout in seconds (default 300 = 5 minutes)',
  },
  out: {
    type: 'string',
    default: './skill-eval-output',
    describe: 'Output directory for benchmark.json / junit.xml / summary.md and per-eval artifacts',
  },
  'claude-bin': {
    type: 'string',
    default: 'claude',
    describe: 'Path to the claude CLI binary',
  },
} as const;

type OutputArgs = InferredOptionTypes<typeof outputOptions>;

const initOptions = {
  'skill-path': {
    type: 'string',
    demandOption: true,
    describe: 'Path to the skill directory (containing SKILL.md)',
  },
  out: {
    type: 'string',
    describe:
      'Where to write the generated eval set. Defaults to `<skill-path>/evals.json`.',
  },
  force: {
    type: 'boolean',
    default: false,
    describe: 'Overwrite the output file if it already exists',
  },
  positive: {
    type: 'number',
    default: 8,
    describe: 'Number of should-trigger queries to generate',
  },
  negative: {
    type: 'number',
    default: 5,
    describe: 'Number of should-not-trigger (near-miss) queries to generate',
  },
  'with-expectations': {
    type: 'boolean',
    default: false,
    describe: 'Also draft 2-3 expectations per positive case (for output evals)',
  },
  'expectations-per-positive': {
    type: 'number',
    default: 3,
    describe: 'How many expectations to draft per positive case (only used with --with-expectations)',
  },
  model: {
    type: 'string',
    default: 'claude-sonnet-4-6',
    describe: 'Model used to draft the evals (called via `claude -p`)',
  },
  timeout: {
    type: 'number',
    default: 300,
    describe: 'Timeout in seconds for the generation call (default 300 = 5 minutes)',
  },
  'claude-bin': {
    type: 'string',
    default: 'claude',
    describe: 'Path to the claude CLI binary',
  },
} as const;

type InitArgs = InferredOptionTypes<typeof initOptions>;

function abs(p: string, cwd = process.cwd()): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}

function resolveEvalSetPath(skillPath: string, override: string | undefined): string {
  if (override) {
    const resolved = abs(override);
    if (!existsSync(resolved)) {
      process.stderr.write(`Error: --eval-set not found at ${resolved}\n`);
      process.exit(2);
    }
    return resolved;
  }
  const fallback = join(skillPath, 'evals.json');
  if (!existsSync(fallback)) {
    process.stderr.write(
      [
        `Error: no eval set found.`,
        `Pass --eval-set, or place one at the default location:`,
        `  ${fallback}`,
        '',
      ].join('\n'),
    );
    process.exit(2);
  }
  return fallback;
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
  const skillPath = abs(args['skill-path']);
  const evalSetPath = resolveEvalSetPath(skillPath, args['eval-set']);
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

function assertApiGraderAuth(): void {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return;

  process.stderr.write(
    [
      'Error: --grader-mode api calls the Anthropic SDK directly, which only knows how to use an',
      "API key. Claude Code's local /login session is NOT picked up by the SDK.",
      '',
      'Set one of:',
      '  - ANTHROPIC_API_KEY=sk-ant-…   (create at https://console.anthropic.com — note that the',
      '                                  API console is a separate product from Claude Pro/Max,',
      '                                  with its own pay-per-token billing)',
      '  - ANTHROPIC_AUTH_TOKEN=…       (for OAuth bearer tokens)',
      '',
      'Or drop --grader-mode api (or pass --grader-mode claude-p) to use your existing Claude Code',
      'login. That mode loses prompt caching + forced structured output but needs no extra auth.',
      '',
    ].join('\n'),
  );
  process.exit(2);
}

async function outputCommand(args: OutputArgs): Promise<void> {
  if (args['grader-mode'] === 'api') {
    assertApiGraderAuth();
  }

  const skillPath = abs(args['skill-path']);
  const evalSetPath = resolveEvalSetPath(skillPath, args['eval-set']);
  const outDir = abs(args.out);
  const claudeBin = args['claude-bin'].includes('/') ? abs(args['claude-bin']) : args['claude-bin'];

  const raw = JSON.parse(readFileSync(evalSetPath, 'utf-8')) as unknown;
  const evalSet = evalSetSchema.parse(raw);

  const toRun = evalSet.evals.filter(
    (item) => item.should_trigger && (item.expectations?.length ?? 0) > 0,
  );
  if (toRun.length === 0) {
    process.stderr.write(
      'No eval items with expectations found. Add `expectations: [...]` to items you want to grade.\n',
    );
    process.exit(2);
  }

  mkdirSync(outDir, { recursive: true });

  const configurations = args.baseline ? 2 : 1;
  process.stderr.write(
    `Running ${toRun.length} evals × ${configurations} config × ${args.runs} runs = ${
      toRun.length * configurations * args.runs
    } executions (concurrency=${args.concurrency})\n`,
  );

  const startedAt = Date.now();
  const benchmark = await runOutputSet({
    evalSet,
    skillPath,
    executorModel: args['executor-model'],
    graderModel: args['grader-model'],
    graderMode: args['grader-mode'],
    runsPerConfiguration: args.runs,
    concurrency: args.concurrency,
    baseline: args.baseline,
    workspaceDir: outDir,
    executorTimeoutMs: args['executor-timeout'] * 1000,
    claudeBin,
    onProgress: (event) => {
      const tag =
        event.phase === 'execute-start'
          ? 'exec…'
          : event.phase === 'execute-end'
            ? event.error
              ? 'EXEC!'
              : 'exec✓'
            : event.phase === 'grade-start'
              ? 'grade'
              : event.phase === 'grade-end'
                ? event.error
                  ? 'GRD!'
                  : `grade=${event.passRate != null ? (event.passRate * 100).toFixed(0) + '%' : '?'}`
                : 'skip';
      const dur = event.durationMs ? ` ${(event.durationMs / 1000).toFixed(1)}s` : '';
      const err = event.error ? `  (${event.error.split('\n')[0]})` : '';
      process.stderr.write(
        `  [${tag.padEnd(9)}] ${event.evalName}/${event.configuration}/run-${event.runNumber}${dur}${err}\n`,
      );
    },
  });

  writeJsonReport(join(outDir, 'benchmark.json'), benchmark);
  writeOutputJunitReport(join(outDir, 'junit.xml'), benchmark);
  writeOutputMarkdownReport(join(outDir, 'summary.md'), benchmark);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const withSkill = benchmark.run_summary.configurations['with_skill'];
  const passRate = withSkill?.pass_rate.mean ?? 0;
  process.stderr.write(`\nDone in ${elapsed}s. with_skill pass_rate=${(passRate * 100).toFixed(0)}%\n`);
  process.stderr.write(`Artifacts: ${outDir}\n`);

  // Exit non-zero if any run had an exec error or any expectation failed.
  const hasFailures = benchmark.runs.some(
    (r) => !r.execution.ok || (r.grading?.summary.failed ?? 0) > 0 || r.grading === null,
  );
  if (hasFailures) process.exitCode = 1;
}

async function initCommand(args: InitArgs): Promise<void> {
  const skillPath = abs(args['skill-path']);
  const outPath = args.out ? abs(args.out) : undefined;
  const claudeBin = args['claude-bin'].includes('/') ? abs(args['claude-bin']) : args['claude-bin'];

  process.stderr.write(
    `Drafting eval set for skill at ${skillPath} (${args.positive} positive + ${args.negative} negative${
      args['with-expectations'] ? `, +${args['expectations-per-positive']} expectations/case` : ''
    })…\n`,
  );

  try {
    const result = await initEvalSet({
      skillPath,
      outPath,
      force: args.force,
      positiveCount: args.positive,
      negativeCount: args.negative,
      withExpectations: args['with-expectations'],
      expectationsPerPositive: args['expectations-per-positive'],
      model: args.model,
      claudeBin,
      timeoutMs: args.timeout * 1000,
    });
    process.stderr.write(
      `\nWrote ${result.evalSet.evals.length} evals to ${result.outPath} (${(result.durationMs / 1000).toFixed(1)}s)\n`,
    );
    process.stderr.write(
      `\nReview, refine the queries / expectations, then commit the file and run:\n` +
        `  pnpm exec skill-eval trigger --skill-path ${skillPath}\n`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  await yargs(hideBin(process.argv))
    .scriptName('skill-eval')
    .version(readPackageVersion())
    .command(
      'init',
      'Draft an initial eval set for a skill (write to <skill-path>/evals.json)',
      (y) => y.options(initOptions),
      async (argv) => {
        await initCommand(argv as unknown as InitArgs);
      },
    )
    .command(
      'trigger',
      'Run trigger evals against a skill description',
      (y) => y.options(triggerOptions),
      async (argv) => {
        await triggerCommand(argv as unknown as TriggerArgs);
      },
    )
    .command(
      'output',
      'Run output evals (executor + LLM-as-judge grader) against a skill',
      (y) => y.options(outputOptions),
      async (argv) => {
        await outputCommand(argv as unknown as OutputArgs);
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

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
import { execHint } from './util/package-manager.js';
import { createTableRenderer, type TableRow } from './util/live-table.js';

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
    describe:
      'Model passed to claude -p when running the skill (default: Claude Code default)',
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
    describe:
      'Number of runs per configuration (output evals are expensive; default 1)',
  },
  concurrency: {
    type: 'number',
    default: 3,
    describe: 'Max parallel executor+grader pipelines',
  },
  baseline: {
    type: 'boolean',
    default: true,
    describe:
      'Run a without_skill baseline alongside with_skill so you can see whether the skill is worth its token cost. Pass --no-baseline to skip (cuts run time and tokens in half, but you lose the comparison).',
  },
  layout: {
    type: 'string',
    choices: ['compact', 'dense'] as const,
    default: 'dense' as 'compact' | 'dense',
    describe:
      'Live-table layout: `dense` shows every metric inline (with-grade, exec, tokens × both configs + deltas — needs ~110 columns). `compact` shows only verdict + grade + deltas (~75 columns).',
  },
  'executor-timeout': {
    type: 'number',
    default: 300,
    describe: 'Per-execution timeout in seconds (default 300 = 5 minutes)',
  },
  out: {
    type: 'string',
    default: './skill-eval-output',
    describe:
      'Output directory for benchmark.json / junit.xml / summary.md and per-eval artifacts',
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
  expectations: {
    type: 'number',
    default: 0,
    describe:
      'Number of expectations to draft per positive case (for output evals). 0 disables expectation drafting.',
  },
  model: {
    type: 'string',
    default: 'claude-sonnet-4-6',
    describe: 'Model used to draft the evals (called via `claude -p`)',
  },
  timeout: {
    type: 'number',
    default: 300,
    describe:
      'Timeout in seconds for the generation call (default 300 = 5 minutes)',
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

function resolveEvalSetPath(
  skillPath: string,
  override: string | undefined
): string {
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
      ].join('\n')
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
  const claudeBin = args['claude-bin'].includes('/')
    ? abs(args['claude-bin'])
    : args['claude-bin'];

  const raw = JSON.parse(readFileSync(evalSetPath, 'utf-8')) as unknown;
  const evalSet = evalSetSchema.parse(raw);

  mkdirSync(outDir, { recursive: true });

  const evalCount = evalSet.evals.length;
  const runCount = args.runs;
  const totalRuns = evalCount * runCount;
  process.stderr.write(
    `Running ${evalCount} queries × ${runCount} = ${totalRuns} total runs ` +
      `(concurrency=${args.concurrency})\n`
  );

  // One row per query (not per run). Each run lights up an icon in the
  // `runs` column:  ✓ = expected outcome,  ✗ = unexpected,  ! = errored,
  // · = not yet run. Re-rendered after every progress event.
  const evalColWidth = Math.max('eval'.length, String(evalCount).length);
  const runsColWidth = Math.max('runs'.length, runCount);
  const rateColWidth = 4; // "100%"
  const verdictColWidth = 5; // "ERROR"

  process.stderr.write(
    `  ${'eval'.padStart(evalColWidth)}  ${'runs'.padStart(
      runsColWidth
    )}  ${'rate'.padStart(rateColWidth)}  ${'verdict'.padEnd(
      verdictColWidth
    )}  query\n`
  );

  type RunBucket = { outcome: 'trigger' | 'miss' | 'error' };
  const buckets: RunBucket[][] = evalSet.evals.map(() => []);
  const renderer = createTableRenderer();

  const buildRow = (queryIndex: number): TableRow => {
    const item = evalSet.evals[queryIndex];
    const bucket = buckets[queryIndex] ?? [];
    if (!item) return { content: '', final: true };
    const isFinal = bucket.length === runCount;

    const completedIcons = bucket
      .map((r) => {
        if (r.outcome === 'error') return '!';
        return (r.outcome === 'trigger') === item.should_trigger ? '✓' : '✗';
      })
      .join('');
    const icons = completedIcons + '·'.repeat(runCount - bucket.length);

    let rate: string;
    let verdict: string;
    if (!isFinal) {
      rate = '—';
      verdict = '…';
    } else {
      const decided = bucket.filter((r) => r.outcome !== 'error').length;
      const successes = bucket.filter(
        (r) =>
          r.outcome !== 'error' &&
          (r.outcome === 'trigger') === item.should_trigger
      ).length;
      rate = decided > 0 ? `${Math.round((successes / decided) * 100)}%` : '—';
      if (decided === 0) {
        verdict = 'ERROR';
      } else {
        const triggers = bucket.filter((r) => r.outcome === 'trigger').length;
        const triggerRate = triggers / decided;
        const queryPasses = item.should_trigger
          ? triggerRate >= args.threshold
          : triggerRate < args.threshold;
        verdict = queryPasses ? 'pass' : 'FAIL';
      }
    }

    const evalCol = `${queryIndex + 1}`.padStart(evalColWidth);
    const runsCol = icons.padStart(runsColWidth);
    const rateCol = rate.padStart(rateColWidth);
    const verdictCol = verdict.padEnd(verdictColWidth);
    const prefix = `  ${evalCol}  ${runsCol}  ${rateCol}  ${verdictCol}  `;
    const flat = item.query.replace(/\s+/g, ' ');
    const maxCols = process.stderr.columns ?? 200;
    const room = Math.max(20, maxCols - prefix.length - 1);
    const snippet = flat.length > room ? flat.slice(0, room - 1) + '…' : flat;
    return { content: `${prefix}${snippet}`, final: isFinal };
  };

  const renderAll = (): void => {
    renderer.render(evalSet.evals.map((_, i) => buildRow(i)));
  };

  // Initial frame — all rows pending.
  renderAll();

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
    onProgress: ({ queryIndex, outcome }) => {
      const bucket = buckets[queryIndex];
      if (!bucket) return;
      bucket.push({ outcome });
      renderAll();
    },
  });
  renderer.done();

  writeJsonReport(join(outDir, 'results.json'), output);
  writeJunitReport(join(outDir, 'junit.xml'), output);
  writeMarkdownReport(join(outDir, 'summary.md'), output);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const { summary } = output;
  const passPct =
    summary.total > 0
      ? `${((summary.passed / summary.total) * 100).toFixed(0)}%`
      : '—';
  process.stderr.write(
    `\nDone in ${elapsed}s. ${summary.passed}/${summary.total} (${passPct}) passed ` +
      `(precision=${(summary.precision * 100).toFixed(0)}% recall=${(
        summary.recall * 100
      ).toFixed(0)}% ` +
      `accuracy=${(summary.accuracy * 100).toFixed(0)}%)`
  );
  if (summary.errored > 0) {
    process.stderr.write(` — ${summary.errored} query(ies) had errored runs`);
  }
  process.stderr.write(`\nReports written to: ${outDir}\n`);

  if (summary.failed > 0 || summary.errored > 0) {
    process.exitCode = 1;
  }
}

function writeComparisonSummary(
  benchmark: import('./types.js').OutputBenchmark,
  stream: NodeJS.WriteStream
): void {
  const configs = benchmark.run_summary.configurations;
  const withSkill = configs['with_skill'];
  const withoutSkill = configs['without_skill'];

  const fmtPct = (x: number | undefined): string =>
    x == null ? '—' : `${(x * 100).toFixed(0)}%`;
  const fmtSec = (x: number | undefined): string =>
    x == null ? '—' : `${x.toFixed(1)}s`;
  const fmtTok = (x: number | undefined): string => {
    if (x == null) return '—';
    if (x < 1000) return `${Math.round(x)}`;
    if (x < 10000) return `${(x / 1000).toFixed(1)}k`;
    return `${Math.round(x / 1000)}k`;
  };

  if (!withoutSkill) {
    // No baseline — single-config report.
    stream.write(
      `  with_skill: pass=${fmtPct(withSkill?.pass_rate.mean)}  ` +
        `exec=${fmtSec(withSkill?.time_seconds.mean)}  ` +
        `tokens=${fmtTok(withSkill?.tokens.mean)}\n` +
        `  (run with --baseline to see whether the skill is worth its token cost)\n`
    );
    return;
  }

  const passDeltaPp =
    (withSkill?.pass_rate.mean ?? 0) - (withoutSkill?.pass_rate.mean ?? 0);
  const tokenDelta =
    (withSkill?.tokens.mean ?? 0) - (withoutSkill?.tokens.mean ?? 0);
  const timeDelta =
    (withSkill?.time_seconds.mean ?? 0) -
    (withoutSkill?.time_seconds.mean ?? 0);

  const sign = (n: number, fmt: (x: number) => string): string =>
    `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}`;

  // Aligned 2-col table: with_skill, without_skill, Δ
  stream.write(
    `                  with_skill     without_skill  Δ\n` +
      `  pass_rate       ${fmtPct(withSkill?.pass_rate.mean).padEnd(13)}  ${fmtPct(
        withoutSkill?.pass_rate.mean
      ).padEnd(13)}  ${sign(passDeltaPp * 100, (n) => `${n.toFixed(0)}pp`)}\n` +
      `  exec time       ${fmtSec(withSkill?.time_seconds.mean).padEnd(
        13
      )}  ${fmtSec(withoutSkill?.time_seconds.mean).padEnd(13)}  ${sign(
        timeDelta,
        (n) => `${n.toFixed(1)}s`
      )}\n` +
      `  tokens / run    ${fmtTok(withSkill?.tokens.mean).padEnd(13)}  ${fmtTok(
        withoutSkill?.tokens.mean
      ).padEnd(13)}  ${sign(tokenDelta, fmtTok)}\n`
  );

  // Verdict line — was the skill worth it?
  const passPp = passDeltaPp * 100;
  let verdict: string;
  if (passPp > 0.5) {
    verdict =
      `→ Skill helped: +${passPp.toFixed(0)}pp pass rate at ` +
      `${sign(tokenDelta, fmtTok)} tokens/run.`;
  } else if (passPp < -0.5) {
    verdict =
      `→ Skill hurt: ${passPp.toFixed(0)}pp pass rate, and ` +
      `${sign(tokenDelta, fmtTok)} tokens/run. Worth investigating.`;
  } else {
    verdict =
      `→ No measurable benefit: pass rate unchanged, ` +
      `${sign(tokenDelta, fmtTok)} tokens/run for nothing. ` +
      `Either the skill isn't engaging on these evals, or the baseline already nails them.`;
  }
  stream.write(`\n${verdict}\n`);
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
    ].join('\n')
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
  const claudeBin = args['claude-bin'].includes('/')
    ? abs(args['claude-bin'])
    : args['claude-bin'];

  const raw = JSON.parse(readFileSync(evalSetPath, 'utf-8')) as unknown;
  const evalSet = evalSetSchema.parse(raw);

  // Preserve original indices so the eval column matches what's in evals.json
  // (skipping any items without expectations).
  const toRun = evalSet.evals
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        item.should_trigger && (item.expectations?.length ?? 0) > 0
    );
  if (toRun.length === 0) {
    process.stderr.write(
      'No eval items with expectations found. Add `expectations: [...]` to items you want to grade.\n'
    );
    process.exit(2);
  }

  mkdirSync(outDir, { recursive: true });

  const configs: Array<'with_skill' | 'without_skill'> = args.baseline
    ? ['with_skill', 'without_skill']
    : ['with_skill'];
  const runCount = args.runs;
  process.stderr.write(
    `Running ${toRun.length} evals × ${configs.length} config × ${runCount} runs = ${
      toRun.length * configs.length * runCount
    } executions (concurrency=${args.concurrency})\n`
  );

  // ---------------- live table setup ----------------
  // One row per (eval, run). Each row reads state from both the with_skill
  // and (optionally) without_skill slots so the user sees the comparison live.
  const hasBaseline = configs.length > 1;
  const showRun = runCount > 1;

  const evalOrderByIndex = new Map<number, number>();
  toRun.forEach(({ index }, order) => evalOrderByIndex.set(index, order));

  const displayId = (entry: { item: { id?: number }; index: number }): string =>
    `${entry.item.id ?? entry.index + 1}`;
  const displayName = (entry: {
    item: { name?: string; id?: number };
    index: number;
  }): string =>
    entry.item.name ??
    (entry.item.id != null ? `eval-${entry.item.id}` : `eval-${entry.index}`);

  const maxIdWidth = Math.max(...toRun.map((e) => displayId(e).length));
  const evalColWidth = Math.max('eval'.length, maxIdWidth);
  const NAME_MAX = 40;
  const nameColWidth = Math.min(
    NAME_MAX,
    Math.max('name'.length, ...toRun.map((e) => displayName(e).length))
  );
  const runColWidth = Math.max('run'.length, `${runCount}/${runCount}`.length);

  type Status = 'wait' | 'exec…' | 'grade…' | 'pass' | 'FAIL' | 'ERROR';
  interface SlotState {
    status: Status;
    execTimeS?: number;
    tokens?: number;
    passRate?: number;
    final: boolean;
  }
  const totalSlots = toRun.length * configs.length * runCount;
  const slots: SlotState[] = Array.from({ length: totalSlots }, () => ({
    status: 'wait',
    final: false,
  }));

  const slotIndex = (
    evalIndex: number,
    configuration: 'with_skill' | 'without_skill',
    runNumber: number
  ): number => {
    const evalOrder = evalOrderByIndex.get(evalIndex) ?? 0;
    const configIdx = configs.indexOf(configuration);
    return (
      evalOrder * configs.length * runCount +
      configIdx * runCount +
      (runNumber - 1)
    );
  };
  const slotFor = (evalOrder: number, configIdx: number, runIdx: number): SlotState | undefined =>
    slots[evalOrder * configs.length * runCount + configIdx * runCount + runIdx];

  const truncate = (s: string, width: number): string =>
    s.length > width ? `${s.slice(0, width - 1)}…` : s.padEnd(width);

  const formatTokens = (n: number | undefined): string => {
    if (n == null) return '—';
    if (n < 1000) return `${Math.round(n)}`;
    if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
    return `${Math.round(n / 1000)}k`;
  };

  const formatExec = (s: number | undefined): string =>
    s == null ? '—' : `${s.toFixed(1)}s`;

  // Compact-mode "verdict + grade" cell: "✓ 100%", "✗  33%", or a status word.
  const compactCell = (state: SlotState): string => {
    if (state.status === 'pass' || state.status === 'FAIL') {
      const pct = state.passRate != null
        ? `${Math.round(state.passRate * 100).toString().padStart(3)}%`
        : '  —';
      return `${state.status === 'pass' ? '✓' : '✗'} ${pct}`;
    }
    return state.status; // wait, exec…, grade…, ERROR — left-aligned word
  };

  // Dense-mode grade cell: status word while pending, then "%"
  const denseGradeCell = (state: SlotState): string => {
    if (state.passRate != null) return `${Math.round(state.passRate * 100)}%`;
    return state.status;
  };

  // Signed delta string. ±0 when ~zero, — when either side missing.
  const fmtDelta = (
    value: number | undefined,
    epsilon: number,
    formatter: (n: number) => string
  ): string => {
    if (value == null) return '—';
    if (Math.abs(value) < epsilon) return '±0';
    return `${value > 0 ? '+' : '−'}${formatter(Math.abs(value))}`;
  };

  // ---------- column widths per layout ----------
  // Compact: verdict cell holds "✓ 100%" (6), "grade…" (6), "ERROR" (5).
  const compactCellWidth = 6;
  const compactDeltaGradeWidth = 6; // "+100pp"
  const compactDeltaTokWidth = 5; // "+1.2k"

  // Dense: w-grade/b-grade holds "grade…" (6) or "100%" (4). Header is "w-grade" (7).
  const denseGradeWidth = Math.max('w-grade'.length, 'grade…'.length);
  const denseExecWidth = Math.max('w-exec'.length, 6);
  const denseTokWidth = Math.max('w-tok'.length, 5);

  // ---------- header ----------
  const headerCols: string[] = [
    'eval'.padStart(evalColWidth),
    'name'.padEnd(nameColWidth),
  ];
  if (showRun) headerCols.push('run'.padStart(runColWidth));

  if (args.layout === 'compact') {
    headerCols.push('with'.padEnd(compactCellWidth));
    if (hasBaseline) {
      headerCols.push('base'.padEnd(compactCellWidth));
      headerCols.push('Δgrade'.padStart(compactDeltaGradeWidth));
      headerCols.push('Δtok'.padStart(compactDeltaTokWidth));
    }
  } else {
    // dense
    headerCols.push('w-grade'.padStart(denseGradeWidth));
    headerCols.push('w-exec'.padStart(denseExecWidth));
    headerCols.push('w-tok'.padStart(denseTokWidth));
    if (hasBaseline) {
      headerCols.push('b-grade'.padStart(denseGradeWidth));
      headerCols.push('b-exec'.padStart(denseExecWidth));
      headerCols.push('b-tok'.padStart(denseTokWidth));
      headerCols.push('Δgrade'.padStart(compactDeltaGradeWidth));
      headerCols.push('Δtok'.padStart(compactDeltaTokWidth));
    }
  }
  process.stderr.write(`  ${headerCols.join('  ')}\n`);

  const renderer = createTableRenderer();

  const buildRow = (rowIdx: number): TableRow => {
    const evalOrder = Math.floor(rowIdx / runCount);
    const runIdx = rowIdx % runCount;
    const entry = toRun[evalOrder];
    if (!entry) return { content: '', final: true };
    const withState = slotFor(evalOrder, 0, runIdx);
    const baseState = hasBaseline ? slotFor(evalOrder, 1, runIdx) : undefined;
    if (!withState) return { content: '', final: true };

    const isFinal = withState.final && (baseState?.final ?? true);

    const cols: string[] = [
      displayId(entry).padStart(evalColWidth),
      truncate(displayName(entry), nameColWidth),
    ];
    if (showRun) cols.push(`${runIdx + 1}/${runCount}`.padStart(runColWidth));

    if (args.layout === 'compact') {
      cols.push(compactCell(withState).padEnd(compactCellWidth));
      if (baseState) {
        cols.push(compactCell(baseState).padEnd(compactCellWidth));
        // Deltas only meaningful when both sides have graded; otherwise '—'.
        const deltaGrade =
          withState.passRate != null && baseState.passRate != null
            ? (withState.passRate - baseState.passRate) * 100
            : undefined;
        cols.push(
          fmtDelta(deltaGrade, 0.5, (n) => `${n.toFixed(0)}pp`).padStart(
            compactDeltaGradeWidth
          )
        );
        const deltaTok =
          withState.tokens != null && baseState.tokens != null
            ? withState.tokens - baseState.tokens
            : undefined;
        cols.push(
          fmtDelta(deltaTok, 0.5, formatTokens).padStart(compactDeltaTokWidth)
        );
      }
    } else {
      // dense
      cols.push(denseGradeCell(withState).padStart(denseGradeWidth));
      cols.push(formatExec(withState.execTimeS).padStart(denseExecWidth));
      cols.push(formatTokens(withState.tokens).padStart(denseTokWidth));
      if (baseState) {
        cols.push(denseGradeCell(baseState).padStart(denseGradeWidth));
        cols.push(formatExec(baseState.execTimeS).padStart(denseExecWidth));
        cols.push(formatTokens(baseState.tokens).padStart(denseTokWidth));
        const deltaGrade =
          withState.passRate != null && baseState.passRate != null
            ? (withState.passRate - baseState.passRate) * 100
            : undefined;
        cols.push(
          fmtDelta(deltaGrade, 0.5, (n) => `${n.toFixed(0)}pp`).padStart(
            compactDeltaGradeWidth
          )
        );
        const deltaTok =
          withState.tokens != null && baseState.tokens != null
            ? withState.tokens - baseState.tokens
            : undefined;
        cols.push(
          fmtDelta(deltaTok, 0.5, formatTokens).padStart(compactDeltaTokWidth)
        );
      }
    }

    return { content: `  ${cols.join('  ')}`, final: isFinal };
  };

  const rowCount = toRun.length * runCount;
  const renderAll = (): void => {
    const rows: TableRow[] = [];
    for (let i = 0; i < rowCount; i++) rows.push(buildRow(i));
    renderer.render(rows);
  };

  renderAll();

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
      const idx = slotIndex(event.evalIndex, event.configuration, event.runNumber);
      const state = slots[idx];
      if (!state) return;

      switch (event.phase) {
        case 'execute-start':
          state.status = 'exec…';
          break;
        case 'execute-end':
          if (event.durationMs != null) state.execTimeS = event.durationMs / 1000;
          if (event.tokens != null) state.tokens = event.tokens;
          if (event.error) {
            state.status = 'ERROR';
            state.final = true;
          }
          break;
        case 'grade-start':
          state.status = 'grade…';
          break;
        case 'grade-end':
          if (event.error) {
            state.status = 'ERROR';
          } else if (event.passRate != null) {
            state.passRate = event.passRate;
            state.status = event.passRate >= 1.0 ? 'pass' : 'FAIL';
          }
          state.final = true;
          break;
        case 'skipped':
          state.status = 'ERROR';
          state.final = true;
          break;
      }
      renderAll();
    },
  });
  renderer.done();

  writeJsonReport(join(outDir, 'benchmark.json'), benchmark);
  writeOutputJunitReport(join(outDir, 'junit.xml'), benchmark);
  writeOutputMarkdownReport(join(outDir, 'summary.md'), benchmark);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stderr.write(`\nDone in ${elapsed}s.\n`);
  writeComparisonSummary(benchmark, process.stderr);
  process.stderr.write(`Artifacts: ${outDir}\n`);

  // Exit non-zero if any run had an exec error or any expectation failed.
  const hasFailures = benchmark.runs.some(
    (r) =>
      !r.execution.ok ||
      (r.grading?.summary.failed ?? 0) > 0 ||
      r.grading === null
  );
  if (hasFailures) process.exitCode = 1;
}

async function initCommand(args: InitArgs): Promise<void> {
  const skillPath = abs(args['skill-path']);
  const outPath = args.out ? abs(args.out) : undefined;
  const claudeBin = args['claude-bin'].includes('/')
    ? abs(args['claude-bin'])
    : args['claude-bin'];

  process.stderr.write(
    `Drafting eval set for skill at ${skillPath} (${args.positive} positive + ${
      args.negative
    } negative${
      args.expectations > 0 ? `, +${args.expectations} expectations/case` : ''
    })…\n`
  );

  try {
    const result = await initEvalSet({
      skillPath,
      outPath,
      force: args.force,
      positiveCount: args.positive,
      negativeCount: args.negative,
      expectationsPerPositive: args.expectations,
      model: args.model,
      claudeBin,
      timeoutMs: args.timeout * 1000,
    });
    process.stderr.write(
      `\nWrote ${result.evalSet.evals.length} evals to ${result.outPath} (${(
        result.durationMs / 1000
      ).toFixed(1)}s)\n`
    );
    process.stderr.write(
      `\nReview, refine the queries / expectations, then commit the file and run:\n` +
        `  ${execHint('skill-eval', `trigger --skill-path ${skillPath}`)}\n`
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
      }
    )
    .command(
      'trigger',
      'Run trigger evals against a skill description',
      (y) => y.options(triggerOptions),
      async (argv) => {
        await triggerCommand(argv as unknown as TriggerArgs);
      }
    )
    .command(
      'output',
      'Run output evals (executor + LLM-as-judge grader) against a skill',
      (y) => y.options(outputOptions),
      async (argv) => {
        await outputCommand(argv as unknown as OutputArgs);
      }
    )
    .demandCommand(1)
    .strict()
    .help()
    .parseAsync();
}

main().catch((err: unknown) => {
  process.stderr.write(
    `${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
  );
  process.exit(1);
});

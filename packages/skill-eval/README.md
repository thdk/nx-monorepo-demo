# @thdk/skill-eval

CI-agnostic eval runner for Claude Code skills.

Two modes:

- **Trigger eval** (`skill-eval trigger`) — given a skill description, verify which user prompts cause Claude to invoke the skill and which don't. Cheap and fast; suitable for every-PR CI.
- **Output eval** (`skill-eval output`) — actually run the skill against a query and let an LLM-as-judge grader score the response against a list of expectations. Heavier and more expensive; suitable as a labelled / nightly gate.

Plus a bootstrapping helper:

- **`skill-eval init`** — read a skill's `SKILL.md` and draft an initial set of positive + negative queries (and optionally expectations) so you don't have to write the first cut by hand.

Both eval modes emit `results.json` / `benchmark.json`, JUnit XML, and a markdown summary so the same command works under GitHub Actions, GitLab CI, or any runner.

## Bootstrap an eval set

If your skill doesn't have an `evals.json` yet, draft one straight from the `SKILL.md`:

```bash
pnpm exec skill-eval init --skill-path ./skills/react-best-practices
# writes ./skills/react-best-practices/evals.json
```

Defaults to 8 positive + 5 negative queries via `claude -p` (no API key needed). Flags:

- `--positive N` / `--negative N` — tune the counts
- `--expectations N` — also draft N expectations per positive case so the file is ready for `skill-eval output` too (0 / omitted = trigger-only)
- `--force` — overwrite an existing file
- `--out <path>` — write somewhere other than `<skill-path>/evals.json`

The result is a starting point — review the queries (especially the negatives, which need to be genuine near-misses, not obviously irrelevant), refine them, and commit.

## Quick start

```bash
pnpm exec skill-eval trigger \
  --skill-path ./skills/react-best-practices \
  --model claude-sonnet-4-6 \
  --runs 3 \
  --concurrency 5 \
  --out ./out/
```

`--skill-path` is optional when you run the command from inside a skill directory (i.e. one containing a `SKILL.md` — matched case-insensitively). `--eval-set` is also optional: if omitted it defaults to `<skill-path>/evals.json` (the upstream skill-creator convention), so colocating your evals with the skill keeps the CLI invocation minimal. Pass `--eval-set <path>` explicitly only when you want to point at a different file.

Requires `claude` CLI on `PATH` and a valid `claude /login` session.

### Running a subset (`--filter` / `-f`)

Both `trigger` and `output` accept `--filter` (alias `-f`) to narrow a run to one or more evals — useful when iterating on a single failing query without paying for the whole set.

```bash
# Run just eval #3 (id, or 1-based position when no id is set).
pnpm exec skill-eval trigger -f 3

# Repeat the flag or comma-separate to pick several.
pnpm exec skill-eval trigger -f 1 -f 4
pnpm exec skill-eval trigger -f 1,4

# Match by `name` (case-insensitive, exact). Useful in output mode where evals are usually named.
pnpm exec skill-eval output -f flat-route-placement -f nested-route
```

Matching is exact and predictable:

- A purely numeric token matches `item.id`, falling back to the 1-based position shown in the live table when no `id` is set.
- Any other token matches `item.name` (case-insensitive). No substring / regex magic — copy what the table shows.

Unmatched tokens print a warning and the run continues with whatever did match. If nothing matches at all, the command exits with code 2 so a typo in CI doesn't quietly skip the whole eval set.

## Output eval quick start

```bash
pnpm exec skill-eval output \
  --skill-path /path/to/skill \
  --executor-model claude-sonnet-4-6 \
  --grader-model claude-sonnet-4-6 \
  --runs 1 \
  --concurrency 3 \
  --out ./out/
```

Same `--eval-set` default applies — `<skill-path>/evals.json` unless overridden.

No extra credentials needed beyond your existing `claude /login` — by default the grader also goes through `claude -p` and reuses your local Claude Code session.

`output` runs each eval twice by default: once `with_skill` and once `without_skill` (baseline). The footer shows pass-rate, exec time, and tokens for both, plus the delta — that's the comparison that tells you whether the skill is actually pulling its weight. Pass `--no-baseline` to skip the baseline (cuts run time and tokens in half) when you just need to confirm the skill still works.

Per-eval artifacts (`transcript.jsonl`, `transcript.md`, `timing.json`, `grading.json`, any output files the model wrote) land under `<out>/<eval-name>/{with_skill,without_skill}/run-N/`. The aggregated `benchmark.json` + JUnit + markdown summary live at the root of `<out>`.

### Grader modes

`--grader-mode` controls how the LLM-as-judge talks to the model:

| Mode                 | Auth                                                                                | Output                                                                                            | Caching                                                                        | When to use                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `claude-p` (default) | Your `claude /login` session — same as `trigger`. Works with Pro/Max subscriptions. | Free-form text with a JSON-extraction parser (handles ` ```json ` fences and prose-wrapped JSON). | None                                                                           | Default. Zero extra setup.                                                                                      |
| `api`                | `ANTHROPIC_API_KEY` (separate API console billing, distinct from Pro/Max).          | Forced `tool_use` — the model literally cannot return anything but the right shape.               | `cache_control: ephemeral` on the rubric, saving cost when grading many evals. | Opt in when you have an API account and want maximum determinism or you're grading a large eval set repeatedly. |

The CLI pre-flight-checks for `ANTHROPIC_API_KEY` only when `--grader-mode api`, so `claude-p` users never see auth errors.

## Eval set schema

```json
{
  "$schema": "../schema/eval-set.schema.json",
  "skill_name": "react-best-practices",
  "evals": [
    { "query": "where does my admin/users route go?", "should_trigger": true },
    { "query": "how do I configure React Router v7?", "should_trigger": false },
    {
      "id": 1,
      "name": "flat-route-placement",
      "query": "where does my admin/users list page go?",
      "should_trigger": true,
      "expectations": [
        "Recommends a flat `.route.tsx` file (not a subfolder) because nothing is co-located",
        "Recommends the file live under the feature folder, not directly under app/routes/"
      ]
    }
  ]
}
```

The same file feeds both modes. `trigger` uses `query` + `should_trigger`; `output` additionally needs `expectations[]` and only runs items where both `should_trigger: true` and a non-empty `expectations` are present.

### IDE validation

The package ships a JSON Schema at `@thdk/skill-eval/schema/eval-set.schema.json`. Most editors that understand JSON Schema (VS Code, JetBrains, Neovim with coc/lsp) will pick it up from the `$schema` field and offer completion + validation. Two ways to wire it up:

**Relative path** (workspace-local eval files, like the ones under `evals/`):

```json
{ "$schema": "../schema/eval-set.schema.json", ... }
```

**Package-resolved path** (consumers who installed `@thdk/skill-eval` from a registry):

```json
{ "$schema": "./node_modules/@thdk/skill-eval/schema/eval-set.schema.json", ... }
```

The `$schema`, `description`, and per-eval `note` fields are ignored at runtime — they're there for editor tooling only.

## What it does

For each query (×`runs`), the runner:

1. Reads the skill's `SKILL.md`, extracts `name` and `description`
2. Creates an isolated temp project root and writes the temp slash-command into `<temp>/.claude/commands/<id>.md` with a unique ID — each concurrent run gets its own tempdir so they never see each other's temp skills in `available_skills`
3. Spawns `claude -p <query> --output-format stream-json --include-partial-messages --model <m>` with `cwd = <temp>`
4. Watches the stream for a `Skill` or `Read` tool invocation referencing the unique ID
5. Classifies each run as `trigger`, `miss`, or `error` (spawn failure / non-zero exit / timeout). Errors are excluded from precision/recall and surfaced separately in `summary.errored`, the JSON `records[]`, and the JUnit `<error>` child
6. A query passes if `trigger_rate ≥ threshold` for positives or `trigger_rate < threshold` for negatives, where trigger_rate is computed only over decided (non-error) runs

The CLI exits non-zero if any query failed or if any query had at least one errored run.

See `docs/ci/` for ready-to-paste CI snippets.

## What `output` does

For each eval with expectations (and optionally for the baseline configuration), the runner:

1. Creates an isolated temp project root
2. Copies the skill folder into `<temp>/.claude/skills/<name>/` so the model can read `SKILL.md` and any referenced files (skipped for the `without_skill` baseline)
3. Spawns `claude -p <query> --output-format stream-json --include-partial-messages --dangerously-skip-permissions`
4. Captures the full stream as `transcript.jsonl`, distils the final assistant text to `transcript.md`, snapshots any files the model wrote into `outputs/`, and records `timing.json`
5. Calls the **grader** via the Anthropic SDK (not `claude -p`) with the transcript + expectations, forcing structured output via tool use, and writes `grading.json`
6. Aggregates per-config runs into `benchmark.json` with `pass_rate`, `time_seconds`, `tokens` summarised as mean ± stddev, plus a delta vs. baseline if requested

The CLI exits non-zero if any execution failed, the grader couldn't run, or any expectation failed.

## Auth

| What needs auth                            | Where it comes from                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Executor (`claude -p` runs the skill)      | Your local Claude Code session (`claude /login`). Same as interactive use.                                                              |
| Grader, `--grader-mode claude-p` (default) | Same local Claude Code session — no extra setup.                                                                                        |
| Grader, `--grader-mode api` (opt-in)       | `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`) on the environment. The Anthropic SDK does not read Claude Code's `/login` credentials. |

The API console is a separate product from Claude Pro/Max — separate signup, separate per-token billing — so picking `claude-p` for the grader means most users don't need to think about credentials at all.

For `--grader-mode api`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pnpm exec skill-eval output --grader-mode api ...
```

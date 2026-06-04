# @thdk/skill-eval

CI-agnostic eval runner for Claude Code skills.

Phase 1 ships **trigger evals**: for a given skill description, verify which user prompts cause Claude to invoke the skill and which don't. Outputs `results.json`, JUnit XML, and a markdown summary so the same command works under GitHub Actions, GitLab CI, or any runner.

## Quick start

```bash
pnpm exec skill-eval trigger \
  --eval-set ./evals/react-router-file-structure-conventions.json \
  --skill-path /path/to/skill \
  --model claude-sonnet-4-6 \
  --runs 3 \
  --concurrency 5 \
  --out ./out/
```

Requires `claude` CLI on `PATH` and `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_*` auth) in the environment.

## Eval set schema

```json
{
  "$schema": "../schema/eval-set.schema.json",
  "skill_name": "react-router-file-structure-conventions",
  "evals": [
    { "query": "where does my admin/users route go?", "should_trigger": true },
    { "query": "how do I configure React Router v7?", "should_trigger": false }
  ]
}
```

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

## Why claude -p (and not the API)

Trigger evals test the skill-loading machinery of Claude Code itself — which slash commands the model picks up in `available_skills`, and whether the description attracts the right queries. The API doesn't expose that decision surface, so it can't substitute here.

Phase 2 will add output evals, where the **grader** call (LLM-as-judge over a transcript) uses the Anthropic SDK directly with prompt caching.

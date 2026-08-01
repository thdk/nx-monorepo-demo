---
name: review-checklist
description: Use when reviewing a merge request or local diff in this workspace; provides a correctness, tests, and security checklist.
---

# Review Checklist

Work through the diff in this order and report findings grouped by severity:

1. **Correctness** — trace each changed code path; flag behavior changes the description
   doesn't mention.
2. **Tests** — every bug fix needs a regression test; every new feature needs coverage
   run via `pnpm nx affected -t test`.
3. **Boundaries** — imports must respect `scope:<domain>` tags
   (`@nx/enforce-module-boundaries`); new projects must land in the right scope folder.
4. **Security** — no secrets in code or fixtures; infrastructure changes go through the
   Terraform projects, never ad-hoc CLI calls.
5. **History** — commits must follow demo-git-workflows:conventional-commits so release
   automation derives the right version bumps.

Approve only when every category is clean or explicitly waived by the author.

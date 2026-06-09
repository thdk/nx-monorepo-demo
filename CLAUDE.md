- Always use nx targets to run terraform commands
- always use infra as code if the resource are managed in terraform instead of suggesting to use the native cli to make changes

## Folder layout

This workspace groups projects by domain. New projects must land in the right scope folder:

- `apps/nx-demo/<app>` — apps that exist purely to showcase Nx (Fastify/Nest/React/etc. permutations)
- `packages/nx-demo/<lib>` — libraries that exist purely to showcase Nx (lib-a/b/c, nest-lib-a)
- `packages/nx-plugins/<plugin>` — custom Nx plugins consumed by this workspace (real, not demo)
- `packages/skill-eval/` — real product package; flat at `packages/<name>/` when it's the only thing in its scope
- `terraform/nx-demo/<project>` — IaC scoped to the demo (incl. its `bootstrap-infra` for the demo's GCP project); a new domain bringing its own GCP project would go in `terraform/<new-scope>/`
- `tools/` — workspace-internal-only tooling (never published)

Tag each project with `scope:<domain>` (e.g. `scope:nx-demo`, `scope:nx-plugins`, `scope:skill-eval`) and let folder location and tags agree. Cross-scope imports should be restricted via `@nx/enforce-module-boundaries`.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

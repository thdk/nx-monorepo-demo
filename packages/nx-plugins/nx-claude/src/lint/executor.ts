import type { ExecutorContext } from '@nx/devkit';
import { join } from 'path';
import { lintPlugin, type Issue } from './rules';
import { MARKETPLACE_PATH } from '../marketplace';

export interface LintExecutorOptions {
  warningsAsErrors?: boolean;
}

export default async function runExecutor(
  options: LintExecutorOptions,
  context: ExecutorContext,
): Promise<{ success: boolean }> {
  const projectName = context.projectName;
  if (!projectName) {
    console.error('nx-claude:lint must be run against a project.');
    return { success: false };
  }

  const projects = context.projectsConfigurations?.projects ?? {};
  const relRoot = projects[projectName]?.root;
  if (!relRoot) {
    console.error(`Could not resolve root for project "${projectName}".`);
    return { success: false };
  }

  const { ok, issues } = lintPlugin({
    workspaceRoot: context.root,
    projectRoot: join(context.root, relRoot),
    projectRootRel: relRoot,
    marketplacePathRel: MARKETPLACE_PATH,
    warningsAsErrors: options.warningsAsErrors ?? false,
  });

  printIssues(projectName, issues);
  return { success: ok };
}

function printIssues(projectName: string, issues: Issue[]): void {
  if (issues.length === 0) {
    console.log(`✓ ${projectName}: all checks passed.`);
    return;
  }
  const byScope = new Map<string, Issue[]>();
  for (const i of issues) {
    const arr = byScope.get(i.scope) ?? [];
    arr.push(i);
    byScope.set(i.scope, arr);
  }
  for (const [scope, scopeIssues] of [...byScope.entries()].sort()) {
    console.log(`\n${scope}:`);
    for (const i of scopeIssues) {
      const tag = i.severity === 'error' ? 'ERROR' : 'WARN ';
      console.log(`  [${tag}] ${i.ruleId}  ${i.message}`);
    }
  }
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  console.log(`\n${projectName}: ${errors} error(s), ${warnings} warning(s)`);
}

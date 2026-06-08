/**
 * Detect how the user invoked us so output hints can suggest the right
 * package-manager command (e.g. `pnpm exec skill-eval …` vs `npx skill-eval …`).
 *
 * Every modern package manager sets `npm_config_user_agent` when running a
 * script or bin shim. Format is `<pm>/<version> npm/? node/<v> <platform> <arch>`,
 * so the first slash-segment identifies the manager.
 */

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

/** Returns the detected PM, or null if no user-agent env var is set. */
export function detectPackageManager(
  env: NodeJS.ProcessEnv = process.env
): PackageManager | null {
  const ua = env['npm_config_user_agent'];
  if (!ua) return null;
  const name = ua.split('/', 1)[0];
  if (name === 'pnpm' || name === 'yarn' || name === 'bun' || name === 'npm') {
    return name;
  }
  return null;
}

/**
 * The exec-style command prefix for the detected manager:
 *   pnpm → `pnpm exec`
 *   yarn → `yarn`        (Yarn Berry; classic also tolerates this form)
 *   bun  → `bunx`
 *   npm  → `npx`
 * Falls back to bare invocation (empty string) when no PM is detected — the
 * binary is presumed to be on PATH.
 */
export function execPrefix(env: NodeJS.ProcessEnv = process.env): string {
  switch (detectPackageManager(env)) {
    case 'pnpm':
      return 'pnpm exec';
    case 'yarn':
      return 'yarn';
    case 'bun':
      return 'bunx';
    case 'npm':
      return 'npx';
    case null:
      return '';
  }
}

/** Convenience: build a `<prefix> <bin> <args>` invocation string. */
export function execHint(
  bin: string,
  args: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const prefix = execPrefix(env);
  return prefix ? `${prefix} ${bin} ${args}` : `${bin} ${args}`;
}

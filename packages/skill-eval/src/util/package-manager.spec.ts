import { describe, expect, it } from 'vitest';

import {
  detectPackageManager,
  execHint,
  execPrefix,
} from './package-manager.js';

function envWith(ua: string | undefined): NodeJS.ProcessEnv {
  return ua === undefined ? {} : { npm_config_user_agent: ua };
}

describe('detectPackageManager', () => {
  it('returns null when the env var is missing', () => {
    expect(detectPackageManager({})).toBeNull();
  });

  it.each([
    ['pnpm/8.6.0 npm/? node/v20.0.0 darwin arm64', 'pnpm'],
    ['yarn/1.22.19 npm/? node/v20.0.0 darwin arm64', 'yarn'],
    ['yarn/4.0.0 npm/? node/v20.0.0 darwin arm64', 'yarn'],
    ['npm/10.2.0 node/v20.0.0 darwin arm64 workspaces/false', 'npm'],
    ['bun/1.0.0 npm/? node/v20.0.0 darwin arm64', 'bun'],
  ])('parses %s as %s', (ua, expected) => {
    expect(detectPackageManager(envWith(ua))).toBe(expected);
  });

  it('returns null for unknown user agents', () => {
    expect(detectPackageManager(envWith('weirdpm/1.0.0 node/v20'))).toBeNull();
  });
});

describe('execPrefix', () => {
  it('maps each manager to its exec form', () => {
    expect(execPrefix(envWith('pnpm/8.6.0'))).toBe('pnpm exec');
    expect(execPrefix(envWith('yarn/1.22.19'))).toBe('yarn');
    expect(execPrefix(envWith('bun/1.0.0'))).toBe('bunx');
    expect(execPrefix(envWith('npm/10.2.0'))).toBe('npx');
  });

  it('returns empty string when no manager is detected', () => {
    expect(execPrefix({})).toBe('');
  });
});

describe('execHint', () => {
  it('prefixes the bin invocation when a manager is detected', () => {
    expect(execHint('skill-eval', 'trigger', envWith('pnpm/8.6.0'))).toBe(
      'pnpm exec skill-eval trigger'
    );
    expect(execHint('skill-eval', 'trigger', envWith('npm/10.2.0'))).toBe(
      'npx skill-eval trigger'
    );
  });

  it('falls back to the bare command when no manager is detected', () => {
    expect(execHint('skill-eval', 'trigger --foo', {})).toBe(
      'skill-eval trigger --foo'
    );
  });
});

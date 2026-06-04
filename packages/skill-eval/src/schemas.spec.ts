import { describe, expect, it } from 'vitest';

import { evalSetSchema } from './schemas.js';

describe('evalSetSchema', () => {
  it('parses a well-formed eval set', () => {
    const parsed = evalSetSchema.parse({
      skill_name: 'react-best-practices',
      evals: [
        { query: 'where does my admin/users route go?', should_trigger: true },
        { query: 'how do I configure React Router v7?', should_trigger: false },
      ],
    });
    expect(parsed.skill_name).toBe('react-best-practices');
    expect(parsed.evals).toHaveLength(2);
  });

  it('accepts the documented IDE-helper fields ($schema, description, note)', () => {
    const parsed = evalSetSchema.parse({
      $schema: '../schema/eval-set.schema.json',
      description: 'irrelevant at runtime',
      skill_name: 'x',
      evals: [{ query: 'hi', should_trigger: true, note: 'a hint' }],
    });
    expect(parsed.$schema).toBe('../schema/eval-set.schema.json');
    expect(parsed.evals[0]?.note).toBe('a hint');
  });

  it('rejects unknown top-level fields (catches typos)', () => {
    expect(() =>
      evalSetSchema.parse({
        skill_naem: 'oops', // typo
        evals: [{ query: 'x', should_trigger: true }],
      })
    ).toThrow();
  });

  it('rejects unknown per-item fields', () => {
    expect(() =>
      evalSetSchema.parse({
        skill_name: 'x',
        evals: [{ query: 'x', should_triger: true }], // typo
      })
    ).toThrow();
  });

  it('rejects missing skill_name', () => {
    expect(() =>
      evalSetSchema.parse({ evals: [{ query: 'x', should_trigger: true }] })
    ).toThrow();
  });

  it('rejects empty evals array', () => {
    expect(() => evalSetSchema.parse({ skill_name: 'x', evals: [] })).toThrow();
  });

  it('rejects eval item with wrong type for should_trigger', () => {
    expect(() =>
      evalSetSchema.parse({
        skill_name: 'x',
        evals: [{ query: 'x', should_trigger: 'yes' }],
      })
    ).toThrow();
  });
});

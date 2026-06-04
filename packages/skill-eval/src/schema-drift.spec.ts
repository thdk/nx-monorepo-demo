/**
 * Drift test: the runtime Zod schema (src/schemas.ts) and the published JSON
 * Schema (schema/eval-set.schema.json) must agree on every fixture below. If
 * they ever disagree, edit one (or both) until they re-converge.
 *
 * Intentionally kept fixture-based rather than codegen — see PR discussion.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import AjvModule from 'ajv';
import { describe, expect, it } from 'vitest';

// Ajv 8 ships CJS with `module.exports = Ajv` plus a `.default` self-pointer
// for ESM interop. Under TS `nodenext` the default import resolves to the
// namespace, so we reach through `.default` at runtime and cast the
// constructor type manually.
type AjvCtor = new (opts?: { allErrors?: boolean; strict?: boolean }) => {
  compile: (schema: object) => (data: unknown) => boolean;
};
const Ajv: AjvCtor =
  ((AjvModule as unknown as { default?: AjvCtor }).default ?? (AjvModule as unknown as AjvCtor));

import { evalSetSchema } from './schemas.js';

const PACKAGE_ROOT = join(__dirname, '..');

interface Fixture {
  name: string;
  input: unknown;
  expectValid: boolean;
}

const fixtures: Fixture[] = [
  {
    name: 'minimal valid set',
    expectValid: true,
    input: {
      skill_name: 'fake-skill',
      evals: [{ query: 'hello', should_trigger: true }],
    },
  },
  {
    name: 'valid with all IDE-helper fields',
    expectValid: true,
    input: {
      $schema: '../schema/eval-set.schema.json',
      description: 'covers positive and negative cases',
      skill_name: 'fake-skill',
      evals: [
        { query: 'q1', should_trigger: true, note: 'positive case' },
        { query: 'q2', should_trigger: false, note: 'near-miss' },
      ],
    },
  },
  {
    name: 'missing skill_name',
    expectValid: false,
    input: { evals: [{ query: 'q', should_trigger: true }] },
  },
  {
    name: 'empty skill_name',
    expectValid: false,
    input: { skill_name: '', evals: [{ query: 'q', should_trigger: true }] },
  },
  {
    name: 'missing evals',
    expectValid: false,
    input: { skill_name: 'x' },
  },
  {
    name: 'empty evals array',
    expectValid: false,
    input: { skill_name: 'x', evals: [] },
  },
  {
    name: 'eval item missing query',
    expectValid: false,
    input: { skill_name: 'x', evals: [{ should_trigger: true }] },
  },
  {
    name: 'eval item missing should_trigger',
    expectValid: false,
    input: { skill_name: 'x', evals: [{ query: 'q' }] },
  },
  {
    name: 'eval item with empty query',
    expectValid: false,
    input: { skill_name: 'x', evals: [{ query: '', should_trigger: true }] },
  },
  {
    name: 'eval item with should_trigger as string',
    expectValid: false,
    input: { skill_name: 'x', evals: [{ query: 'q', should_trigger: 'yes' }] },
  },
  {
    name: 'unknown top-level field (typo)',
    expectValid: false,
    input: {
      skill_naem: 'oops',
      evals: [{ query: 'q', should_trigger: true }],
    },
  },
  {
    name: 'unknown per-item field (typo)',
    expectValid: false,
    input: {
      skill_name: 'x',
      evals: [{ query: 'q', should_triger: true }],
    },
  },
  {
    name: 'evals is not an array',
    expectValid: false,
    input: { skill_name: 'x', evals: { query: 'q', should_trigger: true } },
  },
];

function zodVerdict(input: unknown): boolean {
  return evalSetSchema.safeParse(input).success;
}

describe('schema drift: Zod vs JSON Schema', () => {
  const jsonSchema = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, 'schema/eval-set.schema.json'), 'utf-8'),
  ) as object;
  const ajv = new Ajv({ allErrors: false, strict: false });
  const validateJsonSchema = ajv.compile(jsonSchema);

  for (const fixture of fixtures) {
    it(`agrees on: ${fixture.name}`, () => {
      const zodOk = zodVerdict(fixture.input);
      const jsonOk = validateJsonSchema(fixture.input);
      expect(
        { zod: zodOk, jsonSchema: jsonOk, expected: fixture.expectValid },
        `Validators disagree on fixture "${fixture.name}". Zod=${zodOk}, JSONSchema=${jsonOk}, expected=${fixture.expectValid}`,
      ).toEqual({ zod: fixture.expectValid, jsonSchema: fixture.expectValid, expected: fixture.expectValid });
    });
  }

  it('JSON Schema document parses and compiles', () => {
    expect(typeof validateJsonSchema).toBe('function');
  });
});

import { describe, expect, it } from 'vitest';

import { buildInitPrompt } from './prompt.js';

function baseOptions() {
  return {
    skillName: 'example-skill',
    skillDescription: 'Does example things.',
    skillContent:
      '---\nname: example-skill\ndescription: Does example things.\n---\n\n# body\n',
    positiveCount: 7,
    negativeCount: 4,
    withExpectations: false,
    expectationsPerPositive: 3,
  };
}

describe('buildInitPrompt', () => {
  it('embeds the SKILL.md body, name, and description', () => {
    const prompt = buildInitPrompt(baseOptions());
    expect(prompt).toContain('# Skill metadata');
    expect(prompt).toContain('- name: `example-skill`');
    expect(prompt).toContain('- description: Does example things.');
    expect(prompt).toContain('# body');
  });

  it('asks for exactly the requested counts', () => {
    const prompt = buildInitPrompt(baseOptions());
    expect(prompt).toContain('exactly 7 positive');
    expect(prompt).toContain('exactly 4 negative');
  });

  it('omits expectations when withExpectations is false', () => {
    const prompt = buildInitPrompt(baseOptions());
    expect(prompt).toContain('Do NOT include the `expectations` field');
    expect(prompt).not.toContain('expectation(s) — objective');
  });

  it('asks for expectations when withExpectations is true', () => {
    const prompt = buildInitPrompt({
      ...baseOptions(),
      withExpectations: true,
      expectationsPerPositive: 2,
    });
    expect(prompt).toContain('2 expectation(s)');
    expect(prompt).not.toContain('Do NOT include the `expectations` field');
  });

  it('includes the bad/good examples baked into the system prompt', () => {
    const prompt = buildInitPrompt(baseOptions());
    expect(prompt).toContain('Q4_sales_FINAL_v2.xlsx');
    expect(prompt).toContain('fibonacci function');
  });

  it('mandates JSON-only output', () => {
    const prompt = buildInitPrompt(baseOptions());
    expect(prompt).toContain('Output ONLY a JSON object');
    expect(prompt).toContain('Return ONLY the JSON object');
  });
});

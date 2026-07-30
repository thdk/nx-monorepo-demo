// Skill `name` constraints (frontmatter + directory name), shared by the lint
// rules (F002) and the `skill` generator so the two cannot drift.
export const SKILL_NAME_MAX_LEN = 64;
export const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;
export const RESERVED_SKILL_NAME_FRAGMENTS = ['anthropic', 'claude'];

/** Problems with a skill `name`; an empty array means the name is valid. */
export function skillNameProblems(name: string): string[] {
  const problems: string[] = [];
  if (name.length > SKILL_NAME_MAX_LEN) {
    problems.push(
      `\`name\` exceeds ${SKILL_NAME_MAX_LEN} chars (got ${name.length})`,
    );
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    problems.push(`\`name\` must match ^[a-z0-9-]+$ (got "${name}")`);
  }
  for (const frag of RESERVED_SKILL_NAME_FRAGMENTS) {
    if (name.toLowerCase().includes(frag)) {
      problems.push(`\`name\` must not contain reserved word "${frag}"`);
    }
  }
  return problems;
}

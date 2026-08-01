export interface InitGeneratorSchema {
  /** Install the nx-claude usage skill into the workspace. Defaults to false (explicit opt-in). */
  skill?: boolean;
  /** Directory the skill is installed into. Default: ".claude/skills". */
  skillDir?: string;
  /** Symlink the shipped skill instead of copying it (advanced; not portable to Windows/CI). */
  link?: boolean;
}

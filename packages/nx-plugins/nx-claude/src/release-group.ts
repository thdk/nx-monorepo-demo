// Single source of truth for how Claude plugins participate in Nx Release.
// Used by createNodesV2 (inferred tag), the marketplace generator (scaffolds the
// release group into nx.json) and the lint executor (guards against config drift).

/** Tag inferred onto every plugin project; the release group matches on it. */
export const CLAUDE_PLUGIN_TAG = 'claude-plugin';

/** Default name of the release group scaffolded into nx.json. */
export const RELEASE_GROUP_NAME = 'claude-plugins';

/** Release tags for Claude plugins must be `<plugin-name>--v<version>`. */
export const RELEASE_TAG_PATTERN = '{projectName}--v{version}';

export const RELEASE_GROUP_PROJECTS_MATCHER = `tag:${CLAUDE_PLUGIN_TAG}`;

/** The release group written to nx.json by the marketplace generator. */
export function claudePluginsReleaseGroup() {
  return {
    projects: [RELEASE_GROUP_PROJECTS_MATCHER],
    projectsRelationship: 'independent' as const,
    version: {
      specifierSource: 'conventional-commits' as const,
    },
    releaseTag: {
      pattern: RELEASE_TAG_PATTERN,
    },
  };
}

/** Minimal shape of an nx.json release group as read back for validation. */
export interface ReleaseGroupLike {
  projects?: string | string[];
  projectsRelationship?: string;
  releaseTag?: { pattern?: string };
}

/** Find the release group that matches Claude plugin projects via the inferred tag. */
export function findClaudePluginsReleaseGroup(
  groups: Record<string, ReleaseGroupLike> | undefined,
): { name: string; group: ReleaseGroupLike } | null {
  for (const [name, group] of Object.entries(groups ?? {})) {
    const projects = Array.isArray(group.projects)
      ? group.projects
      : group.projects
        ? [group.projects]
        : [];
    if (projects.includes(RELEASE_GROUP_PROJECTS_MATCHER)) {
      return { name, group };
    }
  }
  return null;
}

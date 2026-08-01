// The contract between the data producer (nx-claude:catalog) and this app.
// Mirrors tools/nx-claude/src/schemas/catalog.schema.json — bring your own app by
// targeting the same shape.
export interface Person {
  name: string;
  email?: string;
  url?: string;
}

export interface CatalogSkill {
  name: string;
  description: string;
  userInvocable: boolean;
  /** Raw Markdown body of SKILL.md (frontmatter stripped). */
  body: string;
}

export interface CatalogPluginDependency {
  name: string;
  /** Declared semver range; absent for bare-name entries (any version). */
  range?: string;
  /** True when the name resolves to a plugin in this marketplace. */
  local: boolean;
  /** Current version of the local plugin the name resolves to. */
  resolvedVersion?: string;
  /** Whether resolvedVersion satisfies range; only present when both exist. */
  satisfied?: boolean;
}

export interface CatalogPlugin {
  name: string;
  version: string;
  source: string;
  /** Folder segments that distinguish the plugin, e.g. ["group","sub-group"]. The first is the domain. */
  path: string[];
  strict?: boolean;
  description?: string;
  keywords?: string[];
  author?: Person;
  repository?: string;
  license?: string;
  /** Declared plugin dependencies, resolved against this marketplace; omitted when none. */
  dependencies?: CatalogPluginDependency[];
  skills: CatalogSkill[];
}

export interface Catalog {
  schemaVersion: number;
  marketplace: {
    name: string;
    owner?: Person;
    description?: string;
  };
  plugins: CatalogPlugin[];
}

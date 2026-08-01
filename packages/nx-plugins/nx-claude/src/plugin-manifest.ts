// Claude plugin manifests may declare dependencies on other plugins, either as a
// bare name ("audit-logger") or as an object ({ "name": "secrets-vault", "version": "~2.1.0" }).
// Shared by createDependencies (graph edges), the version actions (nx release) and lint.

export interface PluginDependencyRef {
  name: string;
  /** Semver range; only present for object-form entries that carry a version. */
  versionSpec?: string;
}

export function parsePluginDependencies(
  manifest: unknown,
): PluginDependencyRef[] {
  const deps = (manifest as { dependencies?: unknown } | null)?.dependencies;
  if (!Array.isArray(deps)) return [];
  const refs: PluginDependencyRef[] = [];
  for (const entry of deps) {
    if (typeof entry === 'string' && entry.length > 0) {
      refs.push({ name: entry });
    } else if (entry && typeof entry === 'object') {
      const { name, version } = entry as { name?: unknown; version?: unknown };
      if (typeof name === 'string' && name.length > 0) {
        refs.push(
          typeof version === 'string' && version.length > 0
            ? { name, versionSpec: version }
            : { name },
        );
      }
    }
  }
  return refs;
}

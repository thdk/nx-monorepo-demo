import { join } from 'node:path';
import type { Tree } from '@nx/devkit';
import { VersionActions } from 'nx/release';
import { parsePluginDependencies } from './plugin-manifest';

// Nx Release version actions for Claude plugins. The version lives in
// `<projectRoot>/.claude-plugin/plugin.json` — there is no package.json.
// Plugins are versioned independently; `dependencies` entries on other workspace
// plugins are rewritten (and trigger a patch bump of the dependent) when a
// dependency is released, driven by nx release's updateDependents behavior.

function manifestPathFor(projectRoot: string): string {
  return join(projectRoot, '.claude-plugin', 'plugin.json')
    .split(/[\\/]+/)
    .join('/');
}

export default class ClaudePluginVersionActions extends VersionActions {
  // Basename Nx uses to recognise the manifest; the real (nested) path is manifestPath.
  validManifestFilenames = ['plugin.json'];

  get manifestPath(): string {
    return manifestPathFor(this.projectGraphNode.data.root);
  }

  async readCurrentVersionFromSourceManifest(tree: Tree) {
    const raw = tree.read(this.manifestPath, 'utf8');
    if (raw === null) return null;
    const version = JSON.parse(raw)?.version;
    return version
      ? { currentVersion: String(version), manifestPath: this.manifestPath }
      : null;
  }

  async readCurrentVersionFromRegistry() {
    // Claude plugins are not published to a version registry.
    return null;
  }

  async readCurrentVersionOfDependency(
    tree: Tree,
    _projectGraph: unknown,
    dependencyProjectName: string,
  ) {
    const raw = tree.read(this.manifestPath, 'utf8');
    if (raw === null) return { currentVersion: null, dependencyCollection: null };
    const dep = parsePluginDependencies(JSON.parse(raw)).find(
      (d) => d.name === dependencyProjectName,
    );
    // Bare-name entries carry no range: nx then skips rewriting the entry but
    // still patch-bumps this plugin when the dependency is released.
    return {
      currentVersion: dep?.versionSpec ?? null,
      dependencyCollection: dep ? 'dependencies' : null,
    };
  }

  async updateProjectVersion(tree: Tree, newVersion: string) {
    const raw = tree.read(this.manifestPath, 'utf8');
    if (raw === null) throw new Error(`Could not read ${this.manifestPath}`);
    const versionField = /("version"\s*:\s*")([^"]*)(")/;
    const match = versionField.exec(raw);
    if (!match)
      throw new Error(
        `Could not locate "version" field in ${this.manifestPath}`,
      );
    const previous = match[2];
    // Surgical replace of just the version value — preserves all other formatting.
    const updated = raw.replace(versionField, `$1${newVersion}$3`);
    tree.write(this.manifestPath, updated);
    return [
      `Updated ${this.manifestPath} version from ${previous} to ${newVersion}`,
    ];
  }

  async updateProjectDependencies(
    tree: Tree,
    _projectGraph: unknown,
    dependenciesToUpdate: Record<string, string>,
  ) {
    const raw = tree.read(this.manifestPath, 'utf8');
    if (raw === null) throw new Error(`Could not read ${this.manifestPath}`);
    const manifest = JSON.parse(raw) as { dependencies?: unknown[] };
    const deps = Array.isArray(manifest.dependencies)
      ? manifest.dependencies
      : [];

    const logs: string[] = [];
    for (const [name, newSpec] of Object.entries(dependenciesToUpdate)) {
      const index = deps.findIndex((entry) =>
        typeof entry === 'string'
          ? entry === name
          : (entry as { name?: unknown } | null)?.name === name,
      );
      if (index === -1) continue;
      const entry = deps[index];
      const previous =
        entry && typeof entry === 'object'
          ? (entry as { version?: string }).version
          : undefined;
      deps[index] =
        typeof entry === 'string'
          ? { name, version: newSpec }
          : { ...(entry as object), version: newSpec };
      logs.push(
        `Updated dependency "${name}" from ${previous ?? '(unversioned)'} to ${newSpec} in ${this.manifestPath}`,
      );
    }

    if (logs.length > 0) {
      manifest.dependencies = deps;
      // Unlike the surgical version bump above, rewriting an array entry needs
      // re-serialisation — match the file's existing indentation.
      const indent = /^([ \t]+)"/m.exec(raw)?.[1] ?? '  ';
      tree.write(
        this.manifestPath,
        JSON.stringify(manifest, null, indent) +
          (raw.endsWith('\n') ? '\n' : ''),
      );
    }
    return logs;
  }
}

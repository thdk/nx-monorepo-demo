import { join } from 'node:path';
import type { Tree } from '@nx/devkit';
import { VersionActions } from 'nx/release';

// Nx Release version actions for Claude plugins. The version lives in
// `<projectRoot>/.claude-plugin/plugin.json` — there is no package.json.
// Plugins are versioned independently and have no inter-project dependencies.

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

  async readCurrentVersionOfDependency() {
    // Plugins do not depend on one another.
    return { currentVersion: null, dependencyCollection: null };
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

  async updateProjectDependencies() {
    // No inter-project dependency references to rewrite.
    return [];
  }
}

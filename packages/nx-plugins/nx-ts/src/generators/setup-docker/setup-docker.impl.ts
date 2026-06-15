import {
  type GeneratorCallback,
  type Tree,
  formatFiles,
  generateFiles,
  joinPathFragments,
  readJson,
  readNxJson,
  readProjectConfiguration,
  updateNxJson,
  updateProjectConfiguration,
} from '@nx/devkit';
import { join } from 'node:path';

import type { SetupDockerGeneratorSchema } from './schema';

const DEPLOYABLE_DOCKER_TAG = 'deployable:docker';
const PNPM_DEPLOY_PLUGIN = '@thdk/nx-pnpm-deploy/plugin';

export const setupDockerGenerator = async (
  tree: Tree,
  schema: SetupDockerGeneratorSchema,
): Promise<GeneratorCallback> => {
  const project = readProjectConfiguration(tree, schema.project);
  const strategy = schema.strategy ?? 'pnpm-deploy';
  const port = schema.port ?? 3000;

  const packageJsonPath = joinPathFragments(project.root, 'package.json');
  const packageJson = tree.exists(packageJsonPath)
    ? readJson<{ name?: string }>(tree, packageJsonPath)
    : {};
  const packageName = packageJson.name ?? `@thdk/${schema.project}`;

  // 1. Dockerfile — picked from files/<strategy>/.
  generateFiles(tree, join(__dirname, 'files', strategy), project.root, {
    project: schema.project,
    packageName,
    port,
    tmpl: '',
  });

  // 2. Tag the project deployable:docker so the release group picks it up.
  const tags = new Set([...(project.tags ?? []), DEPLOYABLE_DOCKER_TAG]);

  // 3. Strategy-specific wiring.
  if (strategy === 'nx-prune') {
    // The nx-prune strategy relies on nx.json targetDefaults for prune-lockfile
    // and copy-workspace-modules — declaring the targets empty here is enough
    // for Nx to apply those defaults. The `prune` target itself is custom
    // (workspace_modules workaround) and lives on the project.
    project.targets = {
      ...project.targets,
      'prune-lockfile': {},
      'copy-workspace-modules': {},
      prune: {
        executor: 'nx:run-commands',
        dependsOn: ['prune-lockfile', 'copy-workspace-modules'],
        outputs: ['{projectRoot}/dist/pnpm-workspace.yaml'],
        options: {
          command:
            'tsx ./scripts/bin/write-dist-pnpm-workspace.ts {projectRoot}/dist',
        },
      },
    };

    excludeFromPnpmDeployPlugin(tree, schema.project);
  }

  project.tags = [...tags];
  updateProjectConfiguration(tree, schema.project, project);

  if (!schema.skipFormat) {
    await formatFiles(tree);
  }

  return () => {
    /* no install task — runtime deps stay on the consuming app */
  };
};

export default setupDockerGenerator;

function excludeFromPnpmDeployPlugin(tree: Tree, projectName: string): void {
  const nxJson = readNxJson(tree);
  if (!nxJson?.plugins) return;

  const pluginEntry = nxJson.plugins.find(
    (entry): entry is { plugin: string; options?: { exclude?: string[] } } =>
      typeof entry === 'object' &&
      entry !== null &&
      'plugin' in entry &&
      entry.plugin === PNPM_DEPLOY_PLUGIN,
  );

  if (!pluginEntry) return;

  const exclude = new Set(pluginEntry.options?.exclude ?? []);
  if (exclude.has(projectName)) return;

  exclude.add(projectName);
  pluginEntry.options = {
    ...(pluginEntry.options ?? {}),
    exclude: [...exclude],
  };

  updateNxJson(tree, nxJson);
}

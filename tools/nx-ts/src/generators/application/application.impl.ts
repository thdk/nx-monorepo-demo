import {
  type GeneratorCallback,
  type Tree,
  addDependenciesToPackageJson,
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  joinPathFragments,
  offsetFromRoot,
  runTasksInSerial,
} from '@nx/devkit';
import { join } from 'node:path';

import { logShowProjectCommand } from '../_common/log-show-project-command';
import { setupDockerGenerator } from '../setup-docker/setup-docker.impl';
import type { ApplicationGeneratorSchema } from './schema';

const FASTIFY_VERSION = '5.2.1';
const FASTIFY_PLUGIN_VERSION = '5.0.1';
const FASTIFY_SENSIBLE_VERSION = '6.0.2';
const TSLIB_VERSION = '2.8.1';

export const applicationGenerator = async (
  tree: Tree,
  schema: ApplicationGeneratorSchema
): Promise<GeneratorCallback> => {
  if (!/^[a-zA-Z][a-zA-Z0-9-_]*$/.test(schema.name)) {
    throw new Error(
      `Invalid application name "${schema.name}". Use letters, digits, "-" or "_".`
    );
  }

  const tasks: GeneratorCallback[] = [];

  const scope = (schema.scope ?? 'thdk').replace(/^@/, '');
  const packageName = `@${scope}/${schema.name}`;
  const projectRoot =
    schema.directory ?? joinPathFragments('apps', schema.name);
  const framework = schema.framework ?? 'none';
  const docker = schema.docker ?? true;
  const dockerStrategy = schema.dockerStrategy ?? 'pnpm-deploy';
  const port = schema.port ?? 3000;
  const extraTags = schema.tags ?? [];

  const substitutions = {
    name: schema.name,
    packageName,
    scope,
    port,
    offset: offsetFromRoot(projectRoot),
    tmpl: '',
  };

  // 1. project.json — single source of truth for the nx project metadata.
  addProjectConfiguration(tree, schema.name, {
    root: projectRoot,
    projectType: 'application',
    sourceRoot: joinPathFragments(projectRoot, 'src'),
    tags: extraTags,
    targets: {
      serve: {
        executor: '@nx/js:node',
        defaultConfiguration: 'development',
        dependsOn: ['build'],
        options: {
          buildTarget: `${schema.name}:build`,
          runBuildTargetDependencies: false,
        },
        configurations: {
          development: {
            buildTarget: `${schema.name}:build:development`,
          },
          production: {
            buildTarget: `${schema.name}:build:production`,
          },
        },
      },
    },
  });

  // 2. Common file tree: package.json, tsconfigs, eslint, src/main.ts, assets.
  generateFiles(
    tree,
    join(__dirname, 'files', 'common'),
    projectRoot,
    substitutions
  );

  // 3. Framework overlay — currently only fastify replaces src/main.ts and
  //    adds src/app/app.ts.
  if (framework !== 'none') {
    generateFiles(
      tree,
      join(__dirname, 'files', framework),
      projectRoot,
      substitutions
    );
  }

  // 4. Framework runtime dependencies.
  const dependencies: Record<string, string> = { tslib: TSLIB_VERSION };
  if (framework === 'fastify') {
    dependencies.fastify = FASTIFY_VERSION;
    dependencies['fastify-plugin'] = FASTIFY_PLUGIN_VERSION;
    dependencies['@fastify/sensible'] = FASTIFY_SENSIBLE_VERSION;
  }
  tasks.push(
    addDependenciesToPackageJson(
      tree,
      dependencies,
      {},
      joinPathFragments(projectRoot, 'package.json')
    )
  );

  // 5. Docker — delegates Dockerfile + tag + (fetch) prune wiring.
  if (docker) {
    const dockerTask = await setupDockerGenerator(tree, {
      project: schema.name,
      strategy: dockerStrategy,
      port,
      skipFormat: true,
    });
    tasks.push(dockerTask);
  }

  if (!schema.skipFormat) {
    await formatFiles(tree);
  }

  tasks.push(() => {
    logShowProjectCommand(schema.name);
  });

  return runTasksInSerial(...tasks);
};

export default applicationGenerator;

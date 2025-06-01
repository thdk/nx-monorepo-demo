import {
  GeneratorCallback,
  Tree,
  addProjectConfiguration,
  generateFiles,
  logger,
  runTasksInSerial,
} from '@nx/devkit';
import { configurationGenerator } from '../configuration/configuration.impl';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ProjectGeneratorSchema } from './schema';
import providerGenerator from '../provider/provider.impl';
import stateGenerator from '../state/state.impl';
import {
  GeneratorOptions,
  getMergedGeneratorOptions,
} from '../_common/generator-options';
import { logShowProjectCommand } from '../_common/log-show-project-command';
export const projectGenerator = async (
  tree: Tree,
  options: GeneratorOptions<ProjectGeneratorSchema>
) => {
  const tasks: GeneratorCallback[] = [];
  if (!/^[a-zA-Z0-9-_]+$/.test(options.name)) {
    throw new Error('Project name contains invalid characters.');
  }

  const projectRoot = options.directory || `terraform/${options.name}`;

  tasks.push(() => {
    logger.info(`Generating terraform project in directory: ${projectRoot}`);
  });

  addProjectConfiguration(tree, options.name, {
    root: projectRoot,
  });

  const suggestedTerraformVersion = await resolveSuggestedTerraformVersion({
    workspaceRoot: tree.root,
  });

  generateFiles(tree, path.join(__dirname, 'files'), projectRoot, {
    terraformVersion: suggestedTerraformVersion,
    ...options,
  });

  // Add terraform backend configurations
  if (options.backend !== 'none') {
    await stateGenerator(
      tree,
      getMergedGeneratorOptions('@weareoneworld/nx-terraform:state', tree, {
        backend: options.backend,
        bucket: options.terraformStateBucketName,
        project: options.name,
      })
    );
  }

  // Add configurations for different environments
  tasks.push(
    ...(options.configurations ?? []).map((env) =>
      configurationGenerator(
        tree,
        getMergedGeneratorOptions(
          '@weareoneworld/nx-terraform:configuration',
          tree,
          {
            ...options,
            name: env,
            project: options.name,
            skipFormat: true,
          }
        )
      )
    )
  );

  // Add terraform providers
  if (options.aws) {
    tasks.push(
      await providerGenerator(
        tree,
        getMergedGeneratorOptions(
          '@weareoneworld/nx-terraform:provider',
          tree,
          {
            project: options.name,
            provider: 'aws',
          }
        )
      )
    );
  }

  if (options.google) {
    tasks.push(
      await providerGenerator(
        tree,
        getMergedGeneratorOptions(
          '@weareoneworld/nx-terraform:provider',
          tree,
          {
            project: options.name,
            provider: 'google',
          }
        )
      )
    );
  }

  // Return function to be executed after the generator has written the final tree to the file system.
  tasks.push(() => {
    logShowProjectCommand(options.name);
  });

  return runTasksInSerial(...tasks);
};

export default projectGenerator;

async function resolveSuggestedTerraformVersion({
  workspaceRoot,
}: {
  workspaceRoot: string;
}): Promise<string | undefined> {
  // read terraform version from .tool-versions file located in the root of the workspace
  const toolVersionsPath = path.join(workspaceRoot, '.tool-versions');

  // look for a lines that starts with "terraform ", use node fs to read the file
  const toolVersionsContent = await fs.readFile(toolVersionsPath, 'utf-8');
  const terraformVersionMatch = toolVersionsContent.match(
    /terraform\s+([0-9]+\.[0-9]+\.[0-9]+)/
  );
  return terraformVersionMatch ? terraformVersionMatch[1] : undefined;
}

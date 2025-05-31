import {
  generateFiles,
  Tree,
  logger,
  readProjectConfiguration,
  formatFiles,
} from '@nx/devkit';
import * as path from 'path';
import { ConfigurationGeneratorSchema } from './schema';
import { GeneratorOptions } from '../_common/generator-options';

export const configurationGenerator = (
  tree: Tree,
  options: GeneratorOptions<ConfigurationGeneratorSchema>
) => {
  if (!/^[a-zA-Z0-9-_]+$/.test(options.name)) {
    throw new Error('Configuration name contains invalid characters.');
  }

  const { root: projectRoot } = readProjectConfiguration(tree, options.project);

  generateFiles(tree, path.join(__dirname, 'files'), projectRoot, {
    ...options,
  });

  if (!options.skipFormat) {
    formatFiles(tree);
  }

  return () => {
    logger.info(
      `Configuration ${options.name} generated for project ${options.project}`
    );
  };
};

export default configurationGenerator;

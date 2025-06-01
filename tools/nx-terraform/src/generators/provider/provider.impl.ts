import {
  generateFiles,
  Tree,
  readProjectConfiguration,
  formatFiles,
} from '@nx/devkit';
import * as path from 'path';
import { ProviderGeneratorSchema } from './schema';
import { GeneratorOptions } from '../_common/generator-options';

export async function providerGenerator(
  tree: Tree,
  options: GeneratorOptions<ProviderGeneratorSchema>
) {
  const project = readProjectConfiguration(tree, options.project);

  const projectRoot = project.root;
  const templatePath = path.join(__dirname, 'files', options.provider);

  generateFiles(tree, templatePath, projectRoot, options);

  if (!options.skipFormat) {
    formatFiles(tree);
  }

  return () => {
    console.log(
      `Provider ${options.provider} generated for project ${options.project}`
    );
  };
}

export default providerGenerator;

import {
  Tree,
  formatFiles,
  generateFiles,
  joinPathFragments,
  readProjectConfiguration,
} from '@nx/devkit';
import { StateGeneratorSchema } from './schema';
import { GeneratorOptions } from '../_common/generator-options';

export const stateGenerator = async function generator(
  tree: Tree,
  options: GeneratorOptions<StateGeneratorSchema>
) {
  const { root: projectRoot } = readProjectConfiguration(tree, options.project);

  generateFiles(
    tree,
    joinPathFragments(__dirname, './files'),
    projectRoot,
    options
  );

  if (!options.skipFormat) {
    await formatFiles(tree);
  }
};

export default stateGenerator;

import { readNxJson, Tree } from '@nx/devkit';

export type GeneratorOptions<T> = T & {
  skipFormat?: boolean;
};

export function getMergedGeneratorOptions<T>(
  generatorId: string,
  tree: Tree,
  options: Partial<GeneratorOptions<T>> = {}
): GeneratorOptions<T> {
  const nxJson = readNxJson(tree);
  // Get defaults for your generator
  const generatorDefaults = nxJson?.generators?.[generatorId] || {};
  // Merge with user-provided schema/options

  return {
    skipFormat: true, // default to true, as this is only used for calling composable generators from a parent generator
    ...generatorDefaults,
    ...options,
  } as GeneratorOptions<T>; // TODO add validation for schema
}

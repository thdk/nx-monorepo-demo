import { type Tree, writeJson } from '@nx/devkit';
import type { MarketplaceGeneratorSchema } from './schema';
import { configuredOwner } from '../shared';

const DEFAULT_OWNER = { name: 'Unknown' };

export default async function marketplaceGenerator(
  tree: Tree,
  options: MarketplaceGeneratorSchema,
): Promise<void> {
  const path = options.path.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!path.endsWith('.json')) {
    throw new Error(
      `Marketplace path must be a .json file (got "${options.path}").`,
    );
  }
  if (tree.exists(path)) {
    throw new Error(`${path} already exists.`);
  }

  const stem = path
    .split('/')
    .pop()!
    .replace(/\.json$/, '');
  const name = options.name ?? stem;
  const owner = options.owner
    ? { name: options.owner }
    : (configuredOwner(tree) ?? DEFAULT_OWNER);

  writeJson(tree, path, { name, owner, plugins: [] });
  console.log(`Created marketplace "${name}" at ${path}.`);
}

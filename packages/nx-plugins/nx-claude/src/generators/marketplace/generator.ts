import { type Tree, readNxJson, updateNxJson, writeJson } from '@nx/devkit';
import type { MarketplaceGeneratorSchema } from './schema';
import { configuredOwner } from '../shared';
import {
  RELEASE_GROUP_NAME,
  claudePluginsReleaseGroup,
  findClaudePluginsReleaseGroup,
} from '../../release-group';

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

  ensureReleaseGroup(tree);
}

// Plugins release independently, tagged `<plugin-name>--v<version>`. The group matches
// projects via the tag inferred by createNodesV2, so it covers future plugins too.
// releaseTag.pattern is group-level-only nx.json config (projects cannot infer it),
// which is why the marketplace generator — the one-time workspace setup step — owns it.
function ensureReleaseGroup(tree: Tree): void {
  const nxJson = readNxJson(tree);
  if (!nxJson) return;

  const groups = (nxJson.release?.groups ?? {}) as Parameters<
    typeof findClaudePluginsReleaseGroup
  >[0];
  if (findClaudePluginsReleaseGroup(groups)) return;

  if (groups?.[RELEASE_GROUP_NAME]) {
    console.warn(
      `nx.json already has a release group "${RELEASE_GROUP_NAME}" that does not match Claude plugins — leaving it untouched. The lint target will report what to fix.`,
    );
    return;
  }

  nxJson.release = {
    ...nxJson.release,
    groups: {
      ...nxJson.release?.groups,
      [RELEASE_GROUP_NAME]: claudePluginsReleaseGroup(),
    },
  };
  updateNxJson(tree, nxJson);
  console.log(
    `Added release group "${RELEASE_GROUP_NAME}" to nx.json (release tags: <plugin-name>--v<version>).`,
  );
}

import { type Tree, names, readJson, writeJson } from '@nx/devkit';
import type { PluginGeneratorSchema } from './schema';
import { MARKETPLACE_PATH, sourceFor } from '../../marketplace';
import { optionsForRoot } from '../shared';

interface MarketplaceEntry {
  name: string;
  source: string;
  strict?: boolean;
}

export default async function pluginGenerator(
  tree: Tree,
  options: PluginGeneratorSchema,
): Promise<void> {
  // Parent directory is workspace-relative (default base `plugins`); slashes in `name`
  // extend it. Pass --directory to nest a plugin, e.g. --directory=plugins/team-a.
  const nameSegs = options.name
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  const leaf = names(nameSegs.pop() ?? '').fileName; // kebab-case leaf
  const baseDir = (options.directory ?? 'plugins').replace(/^\.?\/+|\/+$/g, '');
  const parentSegs = [
    ...(baseDir ? baseDir.split('/') : []),
    ...nameSegs,
  ].filter(Boolean);
  const root = [...parentSegs, leaf].join('/');

  if (tree.exists(root)) {
    throw new Error(`${root} already exists — pick a different name.`);
  }

  // Org-specific config comes from the nx-claude registration in nx.json (name prefix, author).
  const config = optionsForRoot(tree);

  // Marketplace/plugin name: "<namePrefix><path minus a leading 'plugins'>", ^[a-z0-9-]+$.
  const nameSource =
    parentSegs[0] === 'plugins' ? parentSegs.slice(1) : parentSegs;
  const pluginName =
    options.pluginName ??
    `${config.namePrefix ?? ''}${[...nameSource, leaf].map((s) => names(s).fileName).join('-')}`;
  const description = options.description ?? `${pluginName} skills`;

  // The repo-root marketplace must already exist — this generator does not create one
  // (create it deliberately with `nx g marketplace` before adding plugins).
  if (!tree.exists(MARKETPLACE_PATH)) {
    throw new Error(
      `Marketplace "${MARKETPLACE_PATH}" does not exist. Create it first (nx g marketplace), then generate plugins into it.`,
    );
  }

  // plugin.json (author only when configured)
  writeJson(tree, `${root}/.claude-plugin/plugin.json`, {
    name: pluginName,
    description,
    version: '0.1.0',
    ...(config.author ? { author: config.author } : {}),
    keywords: ['skills'],
  });

  // README (lists the example skill so F010 passes out of the box)
  tree.write(
    `${root}/README.md`,
    [
      `# ${pluginName}`,
      '',
      description,
      '',
      '## Skills',
      '',
      '- `example`: replace with your first real skill.',
      '',
    ].join('\n'),
  );

  // A minimal, lint-clean starter skill.
  tree.write(
    `${root}/skills/example/SKILL.md`,
    [
      '---',
      'name: example',
      'description: Use when demonstrating the plugin scaffold; replace with a real skill.',
      '---',
      '',
      '# Example',
      '',
      'Replace this starter skill with a real one. See CONTRIBUTING for conventions.',
      '',
    ].join('\n'),
  );

  // Register in the repo-root marketplace.
  const marketplace = readJson<{ plugins?: MarketplaceEntry[] }>(
    tree,
    MARKETPLACE_PATH,
  );
  marketplace.plugins = marketplace.plugins ?? [];
  const source = sourceFor(root);
  if (!marketplace.plugins.some((p) => p.source === source)) {
    marketplace.plugins.push({ name: pluginName, source, strict: true });
  }
  writeJson(tree, MARKETPLACE_PATH, marketplace);
  console.log(
    `Registered "${pluginName}" (source "${source}") in ${MARKETPLACE_PATH}.`,
  );
}

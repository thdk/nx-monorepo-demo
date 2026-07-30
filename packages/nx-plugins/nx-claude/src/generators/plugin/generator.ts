import { type Tree, names, readJson, writeJson } from '@nx/devkit';
import type { PluginGeneratorSchema } from './schema';
import { MARKETPLACE_PATH, sourceFor } from '../../marketplace';
import { isUnderPluginsRoot } from '../../plugins-root';
import {
  configuredPluginsRoot,
  defaultPluginNameForFolder,
  normalizeAuthor,
  optionsForRoot,
} from '../shared';

interface MarketplaceEntry {
  name: string;
  source: string;
  strict?: boolean;
}

export default async function pluginGenerator(
  tree: Tree,
  options: PluginGeneratorSchema,
): Promise<void> {
  // Parent directory is workspace-relative (default: the configured plugins root);
  // slashes in `name` extend it. Pass --directory to nest, e.g. --directory=plugins/team-a.
  const pluginsRoot = configuredPluginsRoot(tree);
  const nameSegs = options.name
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  const leaf = names(nameSegs.pop() ?? '').fileName; // kebab-case leaf
  const baseDir = (
    options.directory ?? (pluginsRoot === '.' ? '' : pluginsRoot)
  ).replace(/^\.?\/+|\/+$/g, '');
  const parentSegs = [
    ...(baseDir ? baseDir.split('/') : []),
    ...nameSegs,
  ].filter(Boolean);
  const root = [...parentSegs, leaf].join('/');

  // Project inference only picks up plugins under the configured root — refuse to
  // scaffold one it would never see.
  if (!isUnderPluginsRoot(root, pluginsRoot)) {
    throw new Error(
      `Plugins must live under ${pluginsRoot}/ (got "${root}") — plugins elsewhere are not inferred as Nx projects. Set "pluginsRoot" on the nx-claude registration in nx.json to change the root.`,
    );
  }

  if (tree.exists(root)) {
    throw new Error(`${root} already exists — pick a different name.`);
  }

  // Org-specific config comes from the nx-claude registration in nx.json (name prefix, author).
  const config = optionsForRoot(tree);

  // Marketplace/plugin name: "<namePrefix><path minus the plugins root>", ^[a-z0-9-]+$.
  const pluginName =
    options.pluginName ?? defaultPluginNameForFolder(tree, root);
  const description = options.description ?? `${pluginName} skills`;

  // The repo-root marketplace must already exist — this generator does not create one
  // (create it deliberately with `nx g marketplace` before adding plugins).
  if (!tree.exists(MARKETPLACE_PATH)) {
    throw new Error(
      `Marketplace "${MARKETPLACE_PATH}" does not exist. Create it first (nx g marketplace), then generate plugins into it.`,
    );
  }

  // plugin.json (author only when configured; always object form — Claude Code
  // rejects string authors)
  const author = normalizeAuthor(config.author);
  writeJson(tree, `${root}/.claude-plugin/plugin.json`, {
    name: pluginName,
    description,
    version: '0.1.0',
    ...(author ? { author } : {}),
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

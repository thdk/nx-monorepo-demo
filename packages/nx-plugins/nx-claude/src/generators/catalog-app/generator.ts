import {
  type GeneratorCallback,
  type Tree,
  addDependenciesToPackageJson,
  ensurePackage,
  generateFiles,
  installPackagesTask,
  joinPathFragments,
  readNxJson,
  readProjectConfiguration,
  updateJson,
  updateNxJson,
  updateProjectConfiguration,
} from '@nx/devkit';
import type { CatalogAppGeneratorSchema } from './schema';

const VITE_PLUGIN = '@nx/vite/plugin';
const CATALOG_OUTPUT = 'dist/catalog/plugins-catalog.json'; // nx-claude:catalog default outputPath
const MARKED_VERSION = '^18.0.0'; // renders SKILL.md on the skill detail page

export default async function catalogAppGenerator(
  tree: Tree,
  options: CatalogAppGeneratorSchema,
): Promise<GeneratorCallback> {
  const name = (options.name ?? 'catalog').trim();
  const directory = (options.directory ?? `apps/${name}`).replace(
    /^\.?\/+|\/+$/g,
    '',
  );
  const base = options.base ?? './';
  const dataProject = options.dataProject ?? 'inthepocket';
  const dataTarget = options.dataTarget ?? 'catalog';

  if (tree.exists(directory)) {
    throw new Error(
      `${directory} already exists — pick a different --name or --directory.`,
    );
  }

  // Lazily install + load @nx/react so catalog-only / lint-only workspaces never pull the web
  // stack. Pinned to the workspace's own Nx version (the @nx/* plugins must match it).
  const nxVersion = require('nx/package.json').version as string;
  const { applicationGenerator } = ensurePackage<any>('@nx/react', nxVersion);

  await applicationGenerator(tree, {
    directory,
    name,
    bundler: 'vite',
    style: 'css',
    linter: 'none',
    unitTestRunner: 'none',
    e2eTestRunner: 'none',
    routing: false,
    minimal: true,
    useProjectJson: true,
    skipFormat: true,
  });

  // Overlay the catalog UI + contract over @nx/react's placeholder app.
  generateFiles(tree, joinPathFragments(__dirname, 'files'), directory, {});

  patchAppTsconfig(tree, directory);
  patchViteBase(tree, directory, base);
  scopeVitePlugin(tree);
  wireDataTargets(tree, directory, name, dataProject, dataTarget);
  addDependenciesToPackageJson(tree, { marked: MARKED_VERSION }, {});

  return () => installPackagesTask(tree);
}

// This repo's tsconfig.base.json is node-only (module commonjs, no DOM lib) so plugins can be
// authored in TS. @nx/react assumes a browser-friendly base, so override the app's tsconfig for
// the browser: ES modules (for import.meta) + DOM libs.
function patchAppTsconfig(tree: Tree, dir: string): void {
  const p = `${dir}/tsconfig.json`;
  if (!tree.exists(p)) return;
  updateJson(tree, p, (json) => {
    json.compilerOptions = {
      ...(json.compilerOptions ?? {}),
      module: 'esnext',
      moduleResolution: 'bundler',
      lib: ['es2022', 'dom', 'dom.iterable'],
    };
    return json;
  });
}

// Add a relative Vite base so the static build works under any hosting subpath.
function patchViteBase(tree: Tree, dir: string, base: string): void {
  const p = `${dir}/vite.config.ts`;
  if (!tree.exists(p)) return;
  const src = tree.read(p, 'utf-8') ?? '';
  if (/\n\s*base\s*:/.test(src)) return;
  const anchor = 'root: __dirname,';
  if (src.includes(anchor)) {
    tree.write(
      p,
      src.replace(
        anchor,
        `root: __dirname,\n  // Relative base so the built site works under any static-hosting subpath.\n  base: '${base}',`,
      ),
    );
  }
}

// @nx/react registers an unscoped @nx/vite/plugin; scope it to apps/** so it never tries to
// load stray vite configs shipped as skill starter templates under plugins/.
function scopeVitePlugin(tree: Tree): void {
  const nx = readNxJson(tree);
  if (!nx?.plugins) return;
  const nameOf = (pl: unknown): string | undefined =>
    typeof pl === 'string' ? pl : (pl as { plugin?: string })?.plugin;
  const existing = nx.plugins.find((pl) => nameOf(pl) === VITE_PLUGIN);
  const options = (existing &&
    typeof existing !== 'string' &&
    (existing as { options?: unknown }).options) || {
    buildTargetName: 'build',
    serveTargetName: 'serve',
    previewTargetName: 'preview',
    testTargetName: 'test',
    serveStaticTargetName: 'serve-static',
    typecheckTargetName: 'typecheck',
  };
  nx.plugins = [
    ...nx.plugins.filter((pl) => nameOf(pl) !== VITE_PLUGIN),
    { plugin: VITE_PLUGIN, include: ['apps/**'], options },
  ];
  updateNxJson(tree, nx);
}

// Wire data: sync-data copies the produced catalog JSON into public/; build + serve depend on it.
// The catalog target itself stays app-agnostic (decoupled) — this app owns the sync.
function wireDataTargets(
  tree: Tree,
  dir: string,
  name: string,
  dataProject: string,
  dataTarget: string,
): void {
  const cfg = readProjectConfiguration(tree, name);
  cfg.targets ??= {};
  const dest = `${dir}/public/plugins-catalog.json`;
  const command =
    `node -e "const fs=require('fs');const s='${CATALOG_OUTPUT}';` +
    `fs.mkdirSync('${dir}/public',{recursive:true});` +
    `if(fs.existsSync(s)){fs.copyFileSync(s,'${dest}')}` +
    `else{console.warn('catalog data missing at '+s+' — run nx run ${dataProject}:${dataTarget}')}"`;

  cfg.targets['sync-data'] = {
    executor: 'nx:run-commands',
    cache: true,
    inputs: [`{workspaceRoot}/${CATALOG_OUTPUT}`],
    outputs: [`{projectRoot}/public/plugins-catalog.json`],
    options: { command },
    dependsOn: [`${dataProject}:${dataTarget}`],
  };
  for (const t of ['build', 'serve'] as const) {
    const prev = cfg.targets[t] ?? {};
    cfg.targets[t] = {
      ...prev,
      dependsOn: [...(prev.dependsOn ?? []), 'sync-data'],
    };
  }
  updateProjectConfiguration(tree, name, cfg);
}

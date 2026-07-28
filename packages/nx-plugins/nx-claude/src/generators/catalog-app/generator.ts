import {
  type GeneratorCallback,
  type Tree,
  addDependenciesToPackageJson,
  ensurePackage,
  generateFiles,
  getProjects,
  installPackagesTask,
  joinPathFragments,
  readNxJson,
  updateJson,
  updateNxJson,
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
  const dataTarget = options.dataTarget ?? 'catalog';

  // The catalog data target lives on the root workspace project; resolve its Nx name from the
  // graph (the truth for dependsOn — not necessarily the npm package name if nx.name overrides it).
  const dataProject = [...getProjects(tree)].find(
    ([, cfg]) => cfg.root === '.',
  )?.[0];
  if (!dataProject) {
    throw new Error(
      'Could not resolve the root workspace project that owns the catalog data target.',
    );
  }

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
  const viteOptions = scopeVitePlugin(tree);
  wireDataTargets(tree, directory, dataProject, dataTarget, [
    viteOptions.buildTargetName ?? 'build',
    viteOptions.serveTargetName ?? 'serve',
  ]);
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

type VitePluginOptions = {
  buildTargetName?: string;
  serveTargetName?: string;
  [key: string]: unknown;
};

// @nx/react registers an unscoped @nx/vite/plugin; scope it to apps/** so it never tries to
// load stray vite configs shipped as skill starter templates under plugins/.
// Returns the resolved plugin options so callers can wire dependsOn to the real target names.
function scopeVitePlugin(tree: Tree): VitePluginOptions {
  const defaults: VitePluginOptions = {
    buildTargetName: 'build',
    serveTargetName: 'serve',
    previewTargetName: 'preview',
    testTargetName: 'test',
    serveStaticTargetName: 'serve-static',
    typecheckTargetName: 'typecheck',
  };
  const nx = readNxJson(tree);
  if (!nx?.plugins) return defaults;
  const nameOf = (pl: unknown): string | undefined =>
    typeof pl === 'string' ? pl : (pl as { plugin?: string })?.plugin;
  const existing = nx.plugins.find((pl) => nameOf(pl) === VITE_PLUGIN);
  const options: VitePluginOptions =
    (existing &&
      typeof existing !== 'string' &&
      (existing as { options?: VitePluginOptions }).options) ||
    defaults;
  nx.plugins = [
    ...nx.plugins.filter((pl) => nameOf(pl) !== VITE_PLUGIN),
    { plugin: VITE_PLUGIN, include: ['apps/**'], options },
  ];
  updateNxJson(tree, nx);
  return options;
}

// Wire data: sync-data copies the produced catalog JSON into public/; build + serve depend on it.
// The catalog target itself stays app-agnostic (decoupled) — this app owns the sync.
//
// Edit project.json DIRECTLY (updateJson), not readProjectConfiguration/updateProjectConfiguration:
// under Crystal, reads return the merged view (project.json + inferred targets) and writes are
// literal, so a round-trip would freeze @nx/vite/plugin's inferred build/serve/preview/serve-static
// into project.json. We only want to persist our own delta and let inference own the rest — so the
// build/serve overrides carry ONLY dependsOn, which Nx merges on top of the inferred target.
function wireDataTargets(
  tree: Tree,
  dir: string,
  dataProject: string,
  dataTarget: string,
  consumerTargets: readonly string[],
): void {
  const dest = `${dir}/public/plugins-catalog.json`;
  const command =
    `node -e "const fs=require('fs');const s='${CATALOG_OUTPUT}';` +
    `fs.mkdirSync('${dir}/public',{recursive:true});` +
    `if(fs.existsSync(s)){fs.copyFileSync(s,'${dest}')}` +
    `else{console.warn('catalog data missing at '+s+' — run nx run ${dataProject}:${dataTarget}')}"`;

  updateJson(tree, `${dir}/project.json`, (json) => {
    json.targets ??= {};
    json.targets['sync-data'] = {
      executor: 'nx:run-commands',
      cache: true,
      inputs: [`{workspaceRoot}/${CATALOG_OUTPUT}`],
      outputs: [`{projectRoot}/public/plugins-catalog.json`],
      options: { command },
      dependsOn: [`${dataProject}:${dataTarget}`],
    };
    for (const t of consumerTargets) {
      const prev = json.targets[t] ?? {};
      json.targets[t] = {
        ...prev,
        // '...' is Nx's spread token: at graph time it expands to the inferred target's own
        // dependsOn, so we AUGMENT inference (append sync-data) instead of replacing it.
        dependsOn: [...(prev.dependsOn ?? ['...']), 'sync-data'],
      };
    }
    return json;
  });
}

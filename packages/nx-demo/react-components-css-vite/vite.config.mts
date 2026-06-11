/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { libInjectCss } from 'vite-plugin-lib-inject-css';
import * as path from 'node:path';

// Hand-listed components — this is the lib's public surface.
// Adding a component? Add it here + create src/<name>/index.ts.
const components = ['alert', 'avatar', 'badge', 'button', 'card'] as const;

const entry = {
  index: 'src/index.ts',
  ...Object.fromEntries(components.map((c) => [c, `src/${c}/index.ts`])),
};

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir:
    '../../../node_modules/.vite/packages/nx-demo/react-components-css-vite',
  plugins: [
    react(),
    libInjectCss(),
    dts({
      entryRoot: 'src',
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json'),
    }),
  ],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    cssCodeSplit: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      entry,
      formats: ['es' as const],
    },
    rolldownOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        // Each entry gets a folder: dist/button/index.mjs, dist/card/index.mjs, ...
        // The barrel ends up as dist/index.mjs.
        entryFileNames: (chunk) =>
          chunk.name === 'index' ? 'index.mjs' : '[name]/index.mjs',
        // Shared chunks (e.g. utils/cn) go into _chunks/, hidden from `exports`.
        chunkFileNames: '_chunks/[name]-[hash].mjs',
        // CSS lives next to its entry's JS: dist/button/styles.css.
        assetFileNames: (asset) => {
          if (asset.names?.[0]?.endsWith('.css')) {
            return '[name]/styles.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
  test: {
    name: '@thdk/react-components-css-vite',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));

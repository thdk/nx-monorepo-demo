import type { ExecutorContext } from '@nx/devkit';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import Ajv from 'ajv';
import { buildCatalog } from './builder';
import catalogSchema from '../schemas/catalog.schema.json';
import { orgAuthorFromNxJson } from '../generators/shared';
import { MARKETPLACE_PATH } from '../marketplace';

export interface CatalogExecutorOptions {
  outputPath?: string;
  pretty?: boolean;
  warnOnMissing?: boolean;
}

const DEFAULT_OUTPUT = 'dist/catalog/plugins-catalog.json';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateCatalog = ajv.compile(catalogSchema as object);

export default async function runExecutor(
  options: CatalogExecutorOptions,
  context: ExecutorContext,
): Promise<{ success: boolean }> {
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT;
  try {
    const orgAuthor = orgAuthorFromNxJson(context.nxJsonConfiguration ?? {});
    const doc = buildCatalog({
      workspaceRoot: context.root,
      marketplacePathRel: MARKETPLACE_PATH,
      orgAuthor,
      warnOnMissing: options.warnOnMissing ?? false,
    });

    // Never let a builder bug violate the published contract.
    if (!validateCatalog(doc)) {
      console.error(
        'nx-claude:catalog produced output that fails catalog.schema.json:',
      );
      for (const e of validateCatalog.errors ?? []) {
        console.error(
          `  ${e.instancePath || '(root)'} ${e.message ?? ''}`.trimEnd(),
        );
      }
      return { success: false };
    }

    const abs = join(context.root, outputPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(
      abs,
      JSON.stringify(doc, null, options.pretty === false ? 0 : 2) + '\n',
    );
    console.log(
      `✓ nx-claude:catalog wrote ${doc.plugins.length} plugin(s) to ${outputPath}`,
    );
    return { success: true };
  } catch (e) {
    console.error(`nx-claude:catalog failed: ${(e as Error).message}`);
    return { success: false };
  }
}

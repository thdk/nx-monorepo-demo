/**
 * Config file (looked up at both workspace root and project root) that overrides
 * default rule levels. Project-root config wins over workspace-root config, which
 * wins over the built-in rule severity defaults.
 *
 * ```js
 * // .nx-claude-lint.config.js
 * module.exports = { rules: { F008: 'off', F011: 'error' } };
 * ```
 *
 * Kept in its own lightweight module (no Ajv/gray-matter imports) so the
 * createNodes plugin in `index.ts` can reference the filename for cache inputs
 * without pulling the whole lint runtime into graph construction.
 */
export const LINT_CONFIG_FILENAME = '.nx-claude-lint.config.js';

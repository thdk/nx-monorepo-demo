/**
 * Tiny progress-table renderer with two backends:
 *
 *   - **Live** (TTY): wraps `log-update` to redraw the whole table on each
 *     `render` call. Rows can mutate freely; only changed lines hit the wire.
 *   - **Append-only** (non-TTY: CI, file redirects, pipes): emits each row
 *     exactly once, in row-index order, the moment it goes `final: true`.
 *     This avoids dumping ANSI escapes and avoids replaying intermediate
 *     states into CI logs.
 *
 * The caller never has to branch on TTY — it always calls `render(rows)` /
 * `done()` and gets the right behaviour automatically.
 */

import { createLogUpdate } from 'log-update';

export interface TableRow {
  /** Pre-formatted line content (no trailing newline). */
  content: string;
  /**
   * Whether this row will never change again. The append-only fallback only
   * emits final rows; the live renderer ignores the flag.
   */
  final?: boolean;
}

export interface TableRenderer {
  /** Replace the entire current frame with `rows`. */
  render(rows: TableRow[]): void;
  /** Persist the current frame and release the renderer. */
  done(): void;
}

export interface CreateTableRendererOptions {
  /** Defaults to `process.stderr`. */
  stream?: NodeJS.WritableStream & { isTTY?: boolean };
  /** Force a backend. Mainly for tests. */
  force?: 'live' | 'append';
}

export function createTableRenderer(
  options: CreateTableRendererOptions = {}
): TableRenderer {
  const stream = options.stream ?? process.stderr;
  const mode =
    options.force ?? (stream.isTTY === true ? 'live' : 'append');
  return mode === 'live' ? createLive(stream) : createAppend(stream);
}

function createLive(stream: NodeJS.WritableStream): TableRenderer {
  const update = createLogUpdate(stream);
  return {
    render(rows) {
      update(rows.map((r) => r.content).join('\n'));
    },
    done() {
      update.done();
    },
  };
}

function createAppend(stream: NodeJS.WritableStream): TableRenderer {
  // Track the high-water mark: every index below this has already been
  // printed. We only emit a row when (a) it's final and (b) every preceding
  // row is also final — keeping output in strict row-index order.
  let nextToPrint = 0;
  return {
    render(rows) {
      while (
        nextToPrint < rows.length &&
        rows[nextToPrint]?.final === true
      ) {
        stream.write(`${rows[nextToPrint]?.content ?? ''}\n`);
        nextToPrint++;
      }
    },
    done() {
      // No-op — append-only mode has nothing buffered. (If the caller
      // forgot to mark a row final, it's intentionally dropped; rendering
      // a half-finished row to CI logs would be misleading.)
    },
  };
}

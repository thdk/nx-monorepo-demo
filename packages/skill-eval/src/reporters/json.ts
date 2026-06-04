import { writeFileSync } from 'node:fs';

import type { TriggerRunOutput } from '../types.js';

export function renderJson(output: TriggerRunOutput): string {
  return JSON.stringify(output, null, 2);
}

export function writeJsonReport(path: string, output: TriggerRunOutput): void {
  writeFileSync(path, renderJson(output));
}

import { writeFileSync } from 'node:fs';

export function renderJson(output: unknown): string {
  return JSON.stringify(output, null, 2);
}

export function writeJsonReport(path: string, output: unknown): void {
  writeFileSync(path, renderJson(output));
}

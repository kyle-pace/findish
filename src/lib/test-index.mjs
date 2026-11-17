// For tests that need the real index (public/index.json): builds it from data/ when it
// isn't there yet, the same way `npm run build` does. Not used by the site.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const file = join(root, 'public/index.json');

export function realIndex() {
  if (!existsSync(file)) execFileSync(process.execPath, [join(root, 'scripts/build-index.mjs')], { stdio: 'ignore' });
  return JSON.parse(readFileSync(file, 'utf8'));
}

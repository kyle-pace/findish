// Refreshes the vendored copy of KitchenCatalog (vendor/kitchen-catalog/) from a clone of
// kyle-pace/kitchen-catalog next to this repo (or the path given): the ingredient catalog and
// its matcher, and the recipe sources list (recipe-sources/sources.json) and its loader. The
// catalog repo is private, so builds in the cloud use this copy instead of fetching it.
//
//   node scripts/sync-catalog.mjs [path-to-kitchen-catalog] [--allow-drop]
//
// It stops, copying nothing, when the sync would take away a source or an ingredient id that
// the copy here has (scripts/sync-guard.mjs): that means the clone is behind, or something
// was added here by hand and never made it to KitchenCatalog. --allow-drop goes ahead anyway,
// for a source taken off the list on purpose.
import { copyFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncProblems } from './sync-guard.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowDrop = args.includes('--allow-drop');
const src = resolve(args.find((a) => !a.startsWith('--')) || join(root, '..', 'kitchen-catalog'));
if (!existsSync(join(src, 'js/catalog.mjs'))) {
  console.error(`No KitchenCatalog clone at ${src}. Clone kyle-pace/kitchen-catalog there or pass its path.`);
  process.exit(2);
}
const dest = join(root, 'vendor/kitchen-catalog');
const FILES = [
  ['js/catalog.mjs', 'catalog.mjs'],
  ['Sources/KitchenCatalog/Resources/catalog.json', 'catalog.json'],
  ['js/sources.mjs', 'sources.mjs'],
  ['recipe-sources/sources.json', 'sources.json'],
];
const json = (path) => {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`${path} isn't valid JSON (${e.message}). Nothing was copied.`);
    process.exit(1);
  }
};
const problems = syncProblems(
  { catalog: json(join(dest, 'catalog.json')), sources: json(join(dest, 'sources.json')) },
  { catalog: json(join(src, FILES[1][0])), sources: json(join(src, FILES[3][0])) },
);
if (problems.length && !allowDrop) {
  console.error(`Not syncing from ${src}. Nothing was copied.\n- ${problems.join('\n- ')}\nIf this is meant, run it again with --allow-drop.`);
  process.exit(1);
}
for (const p of problems) console.warn(`Going ahead (--allow-drop): ${p}`);

// The clone's commit, for VERSION. A clone with uncommitted changes is said out loud: the
// copy would then hold something no commit of KitchenCatalog has.
const git = (...a) => {
  try {
    return execFileSync('git', ['-C', src, ...a], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
};
const sha = git('rev-parse', 'HEAD') || 'unknown';
if (git('status', '--porcelain')) console.warn(`Careful: ${src} has changes that aren't committed. Commit and push them in KitchenCatalog too.`);

for (const [from, to] of FILES) copyFileSync(join(src, from), join(dest, to));
writeFileSync(join(dest, 'VERSION'), sha + '\n');
console.log(`KitchenCatalog ${sha.slice(0, 7)} copied to vendor/kitchen-catalog/. Run npm run index to see the effect (and commit the copy).`);

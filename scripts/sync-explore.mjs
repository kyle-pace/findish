// Refreshes vendor/explore/ from a clone of kyle-pace/world-cuisines next to this repo, or
// the path given. That repo still builds the explorer's data from Wikipedia every week;
// this copies what the explorer needs to run (its three pages, its renderer, its libraries
// and the data they load) so finDish can serve it at /explore/ (Kyle's call, 2026-11-26:
// World cuisine becomes a section of finDish).
//
// The copy is word for word. The addresses inside it still say /world-cuisine/; they are
// changed to /explore/ when the build stages it (scripts/stage-explore.mjs), so the rules
// for that live in one place and this folder can always be compared with its source.
//
//   node scripts/sync-explore.mjs [path-to-world-cuisines]
//
// It refuses to replace a good copy with a thin one (fewer than 300 cuisines, or fewer
// pages than five sixths of what's here now), the same floor the explorer's own refresh has.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(process.argv[2] || join(root, '..', 'world-cuisines'));
const dest = join(root, 'vendor/explore');

// The pages, and the data files they fetch while running (found by reading their fetch calls).
export const FILES = ['index.html', 'web.html', 'drop.html', 'render_item.js'];
export const DATA = [
  'cuisines.json',
  'countries.geojson',
  'regions.geojson',
  'picks.json',
  'suggestions.json',
  'food.json',
  'notes.json',
  'grown.json',
  'summaries.json',
  'food_summaries.json',
  'drop.json',
  // Read at build time by the pages here, not by the explorer itself
  'ingredient_groups.json',
  'catalog_links.json',
];

export function countPages(dir) {
  const items = join(dir, 'data/web/items');
  if (!existsSync(items)) return 0;
  let n = 0;
  for (const f of readdirSync(items)) {
    if (f.endsWith('.json')) n += Object.keys(JSON.parse(readFileSync(join(items, f), 'utf8'))).length;
  }
  return n;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(src, 'data/cuisines.json'))) {
    console.error(`No World cuisine clone at ${src}. Clone kyle-pace/world-cuisines there or pass its path.`);
    process.exit(2);
  }
  const cuisines = (JSON.parse(readFileSync(join(src, 'data/cuisines.json'), 'utf8')).cuisines ?? []).length;
  const pages = countPages(src);
  const had = countPages(dest);
  if (cuisines < 300 || pages < (had * 5) / 6) {
    console.error(`Only ${cuisines} cuisines and ${pages} pages there (${had} pages here now); not replacing the copy.`);
    process.exit(1);
  }
  const missing = [...FILES, ...DATA.map((f) => `data/${f}`), 'vendor', 'data/web/skeleton.json', 'data/web/app.json', 'data/web/images.json'].filter(
    (f) => !existsSync(join(src, f)),
  );
  if (missing.length) {
    console.error(`Missing from ${src}: ${missing.join(', ')}. Not replacing the copy.`);
    process.exit(1);
  }

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, 'data'), { recursive: true });
  for (const f of FILES) cpSync(join(src, f), join(dest, f));
  for (const f of DATA) cpSync(join(src, 'data', f), join(dest, 'data', f));
  cpSync(join(src, 'data/web'), join(dest, 'data/web'), { recursive: true });
  cpSync(join(src, 'vendor'), join(dest, 'vendor'), { recursive: true });

  const sha = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD']).toString().trim();
  writeFileSync(join(dest, 'SOURCE.json'), JSON.stringify({ repo: 'kyle-pace/world-cuisines', commit: sha, cuisines, pages }, null, 2) + '\n');
  console.log(`World cuisine ${sha.slice(0, 7)}: ${cuisines} cuisines and ${pages} pages copied to vendor/explore/.`);
}

// Refreshes vendor/world-cuisine/notes.json from a clone of kyle-pace/cuisine-explorer
// (World cuisine) next to this repo, or the path given. Only the first sentence of each
// cuisine's and ingredient's summary is kept (scripts/world-cuisine.mjs). The build copies
// the notes Findish can use into public/notes.json, which the page loads only when a card
// shows.
//
//   node scripts/sync-world-cuisine.mjs [path-to-cuisine-explorer]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNotes } from './world-cuisine.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(process.argv[2] || join(root, '..', 'cuisine-explorer'));
const read = (f) => JSON.parse(readFileSync(join(src, 'data', f), 'utf8'));
if (!existsSync(join(src, 'data/cuisines.json'))) {
  console.error(`No World cuisine clone at ${src}. Clone kyle-pace/cuisine-explorer there or pass its path.`);
  process.exit(2);
}
const notes = buildNotes({
  cuisines: read('cuisines.json'),
  summaries: read('summaries.json'),
  food: read('food.json'),
  foodSummaries: read('food_summaries.json'),
  catalogLinks: read('catalog_links.json'),
});
const sha = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD']).toString().trim();
const nc = Object.keys(notes.cuisines).length;
const ni = Object.keys(notes.ingredients).length;
if (nc < 100 || ni < 50) {
  console.error(`Only ${nc} cuisines and ${ni} ingredients came out; not replacing the copy.`);
  process.exit(1);
}
mkdirSync(join(root, 'vendor/world-cuisine'), { recursive: true });
writeFileSync(join(root, 'vendor/world-cuisine/notes.json'), JSON.stringify({ source: sha, ...notes }) + '\n');
console.log(`World cuisine ${sha.slice(0, 7)}: ${nc} cuisines and ${ni} ingredients copied to vendor/world-cuisine/notes.json.`);

// Fetches a cover for every creator's book (support.books in KitchenCatalog's sources) from
// Open Library by ISBN, shrinks it to 200 px wide and saves it as public/covers/<isbn>.webp.
// The covers are committed and served from findish.now, so the creator pages load nothing
// from another host. Only missing covers are fetched; a book Open Library has no cover for
// is listed and shown as text, and is tried again the next run. Each cover's size goes in
// public/covers/covers.json, which scripts/build-index.mjs reads so the page can reserve
// the space before the image loads.
//
//   npm run covers            (after npm run sync-catalog adds books)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readSources } from '../crawler/lib/sources.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public/covers');
mkdirSync(dir, { recursive: true });

const isbns = new Set();
for (const v of Object.values(readSources().support)) for (const b of v.books) isbns.add(b.isbn);

const missing = [];
let added = 0;
for (const isbn of isbns) {
  const file = join(dir, `${isbn}.webp`);
  if (existsSync(file)) continue;
  try {
    // default=false makes Open Library answer 404 instead of a blank 1×1 image.
    const res = await fetch(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`, {
      headers: { 'user-agent': 'FindishBot (+https://findish.now/about/)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const img = sharp(Buffer.from(await res.arrayBuffer()));
    const { width = 0 } = await img.metadata();
    if (width < 60) throw new Error('too small to be a real cover');
    await img.resize({ width: 200, withoutEnlargement: true }).webp({ quality: 78 }).toFile(file);
    added++;
  } catch (e) {
    missing.push(`${isbn} (${e.message})`);
  }
  await new Promise((r) => setTimeout(r, 1000)); // one at a time, a second apart
}
// Sizes of every cover on disk, for the page's width and height attributes.
const sizes = {};
for (const isbn of isbns) {
  const file = join(dir, `${isbn}.webp`);
  if (!existsSync(file)) continue;
  const { width, height } = await sharp(readFileSync(file)).metadata();
  sizes[isbn] = [width, height];
}
writeFileSync(join(dir, 'covers.json'), JSON.stringify(sizes, null, 1) + '\n');

console.log(`Covers: ${added} added, ${isbns.size - missing.length} of ${isbns.size} books have one.`);
if (missing.length) console.log(`No cover yet (shown as text): ${missing.join(', ')}`);

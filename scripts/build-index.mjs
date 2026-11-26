// Builds the search index: public/index.json, and the same index packed smaller for the
// page (src/lib/index-format.mjs): public/i/recipes.<hash>.json and public/i/videos.<hash>.json,
// named after what's in them so browsers can keep them for good, with their names in
// public/index-files.json for the page (src/pages/index.astro) to point at.
// Reads what the crawler kept (data/<id>.json) and matches every ingredient line to a
// KitchenCatalog id (vendor/kitchen-catalog), so "scallions" and "green onion" find the
// same recipes. Runs before every build (npm run build), so each weekly crawl that
// lands on main ships a fresh index.
//
//   node scripts/build-index.mjs            # writes the index
//   node scripts/build-index.mjs --report   # also lists the most common unmatched lines
//   node scripts/build-index.mjs --allow-drop   # build even with far fewer recipes than the
//                                               # last crawl counted (scripts/index-floor.mjs)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { brotliCompressSync, constants as zlib } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, match } from '../vendor/kitchen-catalog/catalog.mjs';
import { readSources } from '../crawler/lib/sources.mjs';
import { SOURCES_FILE } from '../crawler/lib/sources.mjs';
import { COURSES, courseOf } from './course.mjs';
import { cuisineOf } from './cuisine.mjs';
import { ALL, GROUPS, VEGETARIAN, itemFlags, lineFlags, nameFlags, titleFlags } from './diet.mjs';
import { isNotRecipe } from './not-recipes.mjs';
import { pack } from '../src/lib/index-format.mjs';
import { floorProblems } from './index-floor.mjs';
import { KINDS, supportKind } from './support.mjs';
import { dishPhrases } from './phrases.mjs';
import { allowedHosts, heldBack, heldBackNote, photoHost } from './photo-hosts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/index.json');
const report = process.argv.includes('--report');

// The recipe sources come from KitchenCatalog (vendor/kitchen-catalog/sources.json).
const sources = readSources();
const catalog = load(join(root, 'vendor/kitchen-catalog/catalog.json'));
const status = JSON.parse(readFileSync(join(root, 'data/status.json'), 'utf8'));
const photoHosts = allowedHosts();
const heldPhotos = [];

const decode = (s) =>
  String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|quot|apos|#039|lt|gt|nbsp|rsquo|lsquo|ldquo|rdquo|ndash|mdash|hellip);/g, (_, e) =>
      ({ amp: '&', quot: '"', apos: "'", '#039': "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' })[e],
    )
    .replace(/\s+/g, ' ')
    .trim();

const minutes = (t) => {
  if (t == null || t === '') return null;
  if (typeof t === 'number') return t > 0 ? Math.round(t) : null;
  if (/^\d+$/.test(t)) return Number(t) || null;
  const m = String(t).match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  const n = m ? Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
  return n || null;
};

// An item and everything it's a kind of: pork belly is also pork, so "pork" finds it.
const withParents = (id) => {
  const ids = [id];
  for (let p = catalog.items[id]?.parent, n = 0; p && n < 10; p = catalog.items[p]?.parent, n++) ids.push(p);
  return ids;
};

// Pantry basics everyone has: still matched, but not offered as ingredient suggestions or
// counted as "missing", so "uses 3 of 3" isn't spoiled by salt.
const BASICS = new Set(['salt', 'kosher-salt', 'sea-salt', 'water', 'black-pepper', 'white-pepper', 'vegetable-oil', 'cooking-oil', 'oil', 'neutral-oil', 'ice']);

const srcList = [];
const ingIndex = new Map(); // id -> position in ing[]
const ing = []; // [id, name, recipeCount, parent positions, ...other names]
const cuisineCount = new Map();
const courseCount = new Map();
const recipes = [];
const seenName = new Map(); // "<source>|<name>" -> position in recipes, to fold twins
let folded = 0;
const leftOut = {};
// How often each recipe was opened lately, by "<source id>:<url as stored>"
// (data/popularity.json, written daily by scripts/popularity.mjs from Amplitude).
const popFile = join(root, 'data/popularity.json');
const popularity = existsSync(popFile) ? JSON.parse(readFileSync(popFile, 'utf8')).opens || {} : {};
const unmatched = new Map();
let lines = 0;
let matched = 0;

const ingPos = (id) => {
  if (!ingIndex.has(id)) {
    const item = catalog.items[id];
    ingIndex.set(id, ing.length);
    const names = [...new Set([item.name, ...(item.aliases || [])].map((n) => n.toLowerCase()))];
    ing.push([id, item.name, 0, [], ...names.filter((n) => n !== item.name.toLowerCase())]);
  }
  return ingIndex.get(id);
};

for (const s of sources.recipes) {
  const file = join(root, 'data', `${s.id}.json`);
  if (!existsSync(file)) continue;
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  if (!rows.length) continue;
  const site = s.site.replace(/\/$/, '');
  const srcIdx = srcList.length;
  srcList.push({ id: s.id, name: s.name, site, host: new URL(site).hostname.replace(/^www\./, ''), count: 0 });

  // A recipe a site shows in the margin of many pages (Seonkyoung Longest's "Spicy Enoki
  // Mushroom", read off 74 pages that aren't it) is kept only at the link that carries its
  // name. Only when one name is at three or more links and one of them is plainly its own.
  const strays = new Set();
  leftOut[s.id] = 0; // rows this build leaves out on purpose; the floor counts them as there
  const links = new Map();
  for (const r of rows) links.set(r.n, [...(links.get(r.n) || []), r.u]);
  for (const [n, us] of links) {
    if (us.length < 3) continue;
    const slug = decode(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const own = slug && us.filter((u) => u.toLowerCase().includes(slug));
    if (own && own.length && own.length < us.length) for (const u of us) if (!own.includes(u)) strays.add(u);
  }
  if (strays.size) console.log(`Strays: ${strays.size} pages of ${s.name} that only showed another page's recipe, left out`);

  for (const r of rows) {
    if (isNotRecipe(s.id, r.u) || strays.has(r.u)) { leftOut[s.id]++; continue; } // scripts/not-recipes.mjs
    const ids = new Set();
    const direct = new Set();
    const name = decode(r.n);
    // What's in it that some people leave out (scripts/diet.mjs): from its name, the lines
    // the catalog matched and the ones it didn't. No ingredient list at all means nothing
    // vouches for it, so it gets every flag and is never offered as vegetarian or "no nuts".
    let flags = (r.i || []).length ? titleFlags(name) : ALL;
    for (const line of r.i || []) {
      lines++;
      const m = match(catalog, line);
      if (m && !catalog.items[m.id].product) {
        matched++;
        direct.add(m.id);
        for (const id of withParents(m.id)) ids.add(id);
        // The line's own words are read as well: "olive oil" is what "tuna in olive oil"
        // matched, and "vegan chicken" matched chicken (lineFlags in scripts/diet.mjs).
        flags |= lineFlags(line, itemFlags(withParents(m.id), catalog.items[m.id]));
      } else {
        flags |= lineFlags(line);
        if (report) {
          const k = String(line).toLowerCase();
          unmatched.set(k, (unmatched.get(k) || 0) + 1);
        }
      }
    }
    // Older posts with no ingredient list: fall back to what the title and keywords name.
    if (!direct.size) {
      for (const text of [r.n, ...(r.kw || [])]) {
        const m = match(catalog, decode(text));
        if (m && !catalog.items[m.id].product) {
          direct.add(m.id);
          for (const id of withParents(m.id)) ids.add(id);
        }
      }
    }
    const cuisine = cuisineOf(decode(r.c || ''), s.default_cuisine, name);
    const pos = [...ids].map(ingPos);
    for (const id of direct) if (!BASICS.has(id)) ing[ingPos(id)][2]++;
    // Which of the positions were named by the recipe itself (the rest are parents),
    // and how many non-basic ingredients it has, for "uses 2 of your 3" and "missing 1".
    const own = [...direct].filter((id) => !BASICS.has(id)).map(ingPos);
    const url = r.u.startsWith(site) ? r.u.slice(site.length) : r.u;
    const kw = (r.kw || []).map(decode).filter((k) => k.toLowerCase() !== name.toLowerCase());
    // Smaller photos where the host can resize (WordPress.com's image CDN takes ?w=).
    let img = s.photos === false ? '' : r.img || '';
    if (img.startsWith('https://i0.wp.com/')) img = img.replace(/\?.*$/, '') + '?w=480&quality=80&ssl=1';
    // Only from hosts the site may load from (scripts/photo-hosts.mjs); the rest are noted below.
    if (img && !photoHosts.has(photoHost(img))) { heldPhotos.push(img); img = ''; }
    // Which part of a meal it is (scripts/course.mjs), and the day the crawler first found it.
    const course = courseOf(decode(r.k || ''), name);
    // Position 12, the flags, is left off when there are none.
    const row = [srcIdx, name, url, minutes(r.t), cuisine, pos, own, img, kw.join(' · '), popularity[`${s.id}:${url}`] || 0, course, r.a || ''];
    if (flags) row.push(flags);
    // A site that posts a dish twice under one name (a "v2" page beside the old one) shows
    // once: the one opened more, then the one with a photo, then the one found last.
    const twin = seenName.get(`${srcIdx}|${name.toLowerCase()}`);
    if (twin != null) {
      const old = recipes[twin];
      const better = row[9] - old[9] || Number(!!row[7]) - Number(!!old[7]) || row[11].localeCompare(old[11]) || row[2].length - old[2].length;
      if (better > 0) recipes[twin] = row;
      folded++;
      leftOut[s.id]++;
      continue;
    }
    seenName.set(`${srcIdx}|${name.toLowerCase()}`, recipes.length);
    recipes.push(row);
    srcList[srcIdx].count++;
  }
}
if (folded) console.log(`Twins: ${folded} recipes a site posted twice under one name, shown once`);
{
  const note = heldBackNote(heldBack(heldPhotos, photoHosts));
  if (note) {
    console.log(note);
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `**Note:** ${note}\n`, { flag: 'a' });
  }
}
for (const r of recipes) {
  if (r[4]) cuisineCount.set(r[4], (cuisineCount.get(r[4]) || 0) + 1);
  if (r[10]) courseCount.set(r[10], (courseCount.get(r[10]) || 0) + 1);
}

// A photo that many recipes from one site share is the site's own stand-in ("Photo to come"
// on Alton Brown's site), not the dish: those recipes show as having no photo.
const PLACEHOLDER_SHARED = 5;
{
  const shared = new Map();
  for (const r of recipes) if (r[7]) shared.set(r[7], (shared.get(r[7]) || 0) + 1);
  let cleared = 0;
  for (const r of recipes) if (r[7] && shared.get(r[7]) >= PLACEHOLDER_SHARED) { r[7] = ''; cleared++; }
  if (cleared) console.log(`Photos: ${cleared} recipes had a site's stand-in photo, shown without one`);
}

// Videos from the YouTube Data API, once the key is in place (crawler/lib/youtube.mjs).
// Each row: [channel index, title, video id, published date, ingredient positions, course
// from the title, flags from the title (scripts/diet.mjs; left off when none)].
// A channel's `cuisine` is the first one KitchenCatalog lists for its creator, when the index
// has that cuisine: a video has no cuisine of its own, so a cuisine search goes by the channel.
const videos = [];
const channels = [];
const videoRows = {}; // per channel, every row in its data file (Shorts too), for the floor check
const creatorCuisine = new Map();
for (const s of JSON.parse(readFileSync(SOURCES_FILE, 'utf8')).sources) {
  const c = cuisineOf(String(s.cuisines?.[0] || '').replace(/ cuisine$/i, ''), '', '');
  for (const id of [s.id, s.youtube?.id]) if (id && c) creatorCuisine.set(id, c);
}
for (const v of sources.videos || []) {
  const file = join(root, 'data', `${v.id}.json`);
  const rows = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  const ci = channels.length;
  videoRows[v.id] = rows.length;
  const cuisine = creatorCuisine.get(v.id) || '';
  channels.push({ id: v.id, name: v.name, channel: v.channel, site: v.site || '', count: rows.filter((r) => !r.sh).length, ...(cuisineCount.get(cuisine) >= 5 ? { cuisine } : {}) });
  for (const row of rows) {
    if (row.sh) continue; // Shorts stay out of the search (crawler/lib/youtube.mjs marks them)
    const ids = new Set();
    const m = match(catalog, decode(row.n));
    if (m && !catalog.items[m.id].product) for (const id of withParents(m.id)) ids.add(id);
    const video = [ci, decode(row.n), row.id, row.p || '', [...ids].map(ingPos), courseOf('', decode(row.n))];
    const flags = nameFlags(decode(row.n), m && !catalog.items[m.id].product ? itemFlags(withParents(m.id), catalog.items[m.id]) : 0);
    if (flags) video.push(flags);
    videos.push(video);
  }
}

// Each ingredient's parents, so "pork" chosen covers pork belly in "uses 2 of your 3".
for (const entry of ing) entry[3] = withParents(entry[0]).slice(1).filter((id) => ingIndex.has(id)).map((id) => ingIndex.get(id));

// "Start with what you have": the things people actually have on hand (produce, meat,
// seafood, eggs and dairy), most used first. Meat and seafood roll up to the general item
// (chicken, not chicken thighs). Vague or pantry-staple items are left out.
const NOT_POPULAR = new Set(['fresh-herbs', 'lemons-and-limes', 'butter', 'milk', 'heavy-whipping-cream', 'garlic-and-onions']);
const SECTIONS = new Set(['produce', 'meat', 'seafood', 'dairy-eggs']);
const rollup = ing.map(() => 0);
for (const r of recipes) for (const p of r[5]) rollup[p]++;
const popular = ing
  .map((g, p) => ({ p, id: g[0], n: rollup[p], item: catalog.items[g[0]] }))
  // A kind of something left out is left out too (cilantro and parsley are fresh herbs, lemons are
  // lemons and limes), so splitting an item in KitchenCatalog doesn't change these ideas by itself.
  .filter(({ id, item, n }) => n >= 15 && SECTIONS.has(item.section) && !NOT_POPULAR.has(id) && !NOT_POPULAR.has(item.parent))
  .filter(({ item }) => !(['meat', 'seafood'].includes(item.section) && item.parent && ingIndex.has(item.parent)))
  .sort((a, b) => b.n - a.n)
  .slice(0, 18)
  .map(({ p }) => p);

// "Vegetarian" and "vegan" in a search leave out recipes by the flags above. These lists of
// ingredient positions say the same thing for the matched ingredients alone, and are kept
// for what reads the index without the search (Grocery Deals' site build, older apps).
const flagOf = ing.map((g) => itemFlags(withParents(g[0]), catalog.items[g[0]]));
const diet = {
  vegetarian: ing.map((_, p) => p).filter((p) => flagOf[p] & VEGETARIAN),
  vegan: ing.map((_, p) => p).filter((p) => flagOf[p] & (VEGETARIAN | 4 | 8 | 16)),
};

// "New this week": recipes the latest crawl's week found, leaving out a creator's first
// crawl (adding a whole site isn't news about its recipes, and would flood the list).
const crawled = (status.run || '').slice(0, 10);
const weekStart = crawled ? new Date(Date.parse(crawled) - 6 * 864e5).toISOString().slice(0, 10) : '';
const firstSeen = new Map();
for (const r of recipes) if (r[11] && (!firstSeen.has(r[0]) || r[11] < firstSeen.get(r[0]))) firstSeen.set(r[0], r[11]);
const fresh = recipes
  .map((r, i) => [r, i])
  .filter(([r]) => weekStart && r[11] >= weekStart && r[11] > firstSeen.get(r[0]))
  .sort(([a], [b]) => b[11].localeCompare(a[11]) || Number(!!b[7]) - Number(!!a[7]))
  .map(([, i]) => i);
const courses = COURSES.filter(([id]) => courseCount.get(id)).map(([id, label]) => [id, label, courseCount.get(id)]);

const cuisines = [...cuisineCount].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]);

const paused = sources.recipes
  .filter((s) => s.paused || !srcList.some((x) => x.id === s.id))
  .map((s) => ({ id: s.id, name: s.name, site: s.site, why: s.paused ? 'paused' : 'not indexed yet' }));

// Ways to support each creator (each source's support in KitchenCatalog, hand-maintained),
// most helpful first: join (pay them directly), buy (books, shops), follow (free). The group
// comes from each link's address (scripts/support.mjs). Books become Bookshop.org links by
// ISBN, which sends the sale to the author and an indie shop; `cover` (and its size) is set
// when npm run covers has saved one to public/covers/.
const coversFile = join(root, 'public/covers/covers.json');
const covers = existsSync(coversFile) ? JSON.parse(readFileSync(coversFile, 'utf8')) : {};
const support = Object.fromEntries(
  Object.entries(sources.support).map(([id, v]) => [
    id,
    [
      ...(v.links || []).map((l) => ({ label: l.label, url: l.url, kind: supportKind(l) })),
      ...(v.books || []).map((b) => ({
        label: b.title,
        url: `https://bookshop.org/book/${b.isbn}`,
        kind: 'buy',
        book: true,
        isbn: b.isbn,
        ...(covers[b.isbn] ? { cover: `/covers/${b.isbn}.webp`, coverWidth: covers[b.isbn][0], coverHeight: covers[b.isbn][1] } : {}),
      })),
    ].sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)),
  ]),
);

const index = {
  built: new Date().toISOString().slice(0, 10),
  crawled,
  sources: srcList,
  paused,
  videos: { sources: channels, rows: videos },
  support,
  linkOnly: (sources.link_only || []).map((l) => ({ name: l.name, search: l.search })),
  cuisines,
  courses,
  fresh,
  popular,
  diet,
  // Things to leave out that aren't one ingredient: [id, name, flag, ...other names] (scripts/diet.mjs).
  groups: GROUPS,
  // Common dish phrases from recipe names, most common first, for the search box's
  // completions and the "Related:" line (scripts/phrases.mjs).
  phrases: dishPhrases(recipes.map((r) => [r[1], r[0]])),
  ing,
  recipes,
};

// Far fewer recipes or videos than the last crawl counted means something broke (a data
// file missing or cut short, a site dropped from the list): stop here, so the site keeps
// the index it has instead of quietly shipping a thin one.
{
  const problems = floorProblems({
    status,
    // Every site that's crawled, with 0 for one whose data file is missing or empty. Rows the
    // build left out itself (twins, strays, not-recipes) count: the crawl kept them, and the
    // floor is about data going missing (Seonkyoung Longest, 131 strays of 611, 2026-11-19).
    recipes: Object.fromEntries(sources.recipes.filter((s) => !s.paused).map((s) => [s.id, (srcList.find((x) => x.id === s.id)?.count || 0) + (leftOut[s.id] || 0)])),
    videos: videoRows,
    // Switched off on purpose in the list of sources: not a source that went missing.
    paused: [...sources.recipes, ...(sources.videos || [])].filter((s) => s.paused).map((s) => s.id),
  });
  if (problems.length) {
    console.error(`index: not built. Compared with the last crawl (data/status.json):\n  ${problems.join('\n  ')}`);
    if (!process.argv.includes('--allow-drop') && !process.env.ALLOW_INDEX_DROP) {
      console.error('If the drop is real, build once with: node scripts/build-index.mjs --allow-drop');
      process.exit(1);
    }
    console.error('--allow-drop: building anyway.');
  }
}

mkdirSync(dirname(out), { recursive: true });
const json = JSON.stringify(index);

// The page's copy: the same index in two smaller files named after their contents, and the
// few things that change daily (index-files.json), which the home page carries itself.
const packed = pack(index);
const pageDir = join(dirname(out), 'i');
rmSync(pageDir, { recursive: true, force: true });
mkdirSync(pageDir);
const files = { ...packed.extra };
const sizes = [];
for (const kind of ['recipes', 'videos']) {
  const text = JSON.stringify(packed[kind]);
  const name = `${kind}.${createHash('sha256').update(text).digest('hex').slice(0, 12)}.json`;
  writeFileSync(join(pageDir, name), text);
  files[kind] = `/i/${name}`;
  sizes.push(`${kind} ${Math.round(text.length / 1024)} KB (${Math.round(brotliCompressSync(text, { params: { [zlib.BROTLI_PARAM_QUALITY]: 5 } }).length / 1024)} KB compressed)`);
}
writeFileSync(join(dirname(out), 'index-files.json'), JSON.stringify(files));

// The "Explore Thai cuisine on World cuisine" line above results when a search is one cuisine
// (vendor/world-cuisine/notes.json, from World cuisine; refresh with npm run sync-world-cuisine).
// Just each cuisine's name and World cuisine page, for the cuisines Findish has recipes for,
// in its own file so the page loads it only when the line shows. (Until 2026-11-16 this also
// carried a Wikipedia sentence and ingredient notes; Kyle dropped them as filler.)
const NOTE_CUISINE = { 'chinese american': 'american chinese', 'italian american': 'italian-american' };
const notesFile = join(root, 'vendor/world-cuisine/notes.json');
if (existsSync(notesFile)) {
  const wc = JSON.parse(readFileSync(notesFile, 'utf8'));
  const notes = { cuisines: {} };
  for (const [c] of cuisines) {
    const k = c.toLowerCase();
    const note = wc.cuisines[NOTE_CUISINE[k] || k];
    // The cuisine's page here: /explore/cuisine/<slug>/, which forwards to its browse page
    // (/cuisine/<slug>/#about) when it has one (src/lib/explore.ts). Until 2026-11-26 this
    // was its page on kylepace.dev/world-cuisine/.
    const slug = note?.page?.match(/\/cuisine\/([a-z0-9-]+)\/?$/)?.[1];
    if (slug) notes.cuisines[c] = { name: note.name, page: `/explore/cuisine/${slug}/` };
  }
  writeFileSync(join(dirname(out), 'notes.json'), JSON.stringify(notes));
  console.log(`World cuisine links: ${Object.keys(notes.cuisines).length} of ${cuisines.length} cuisines`);
}
writeFileSync(out, json);
// The repo is private, so the hub's Connections page reads this copy of the list.
copyFileSync(join(root, '.agents/allowed-hosts.txt'), join(dirname(out), 'allowed-hosts.txt'));
console.log(
  `index: ${recipes.length} recipes from ${srcList.length} sites, ${videos.length} videos, ${ing.length} ingredients, ` +
    `${cuisines.length} cuisines, ${courses.length} courses, ${fresh.length} new this week; ${Math.round((matched / lines) * 100)}% of ingredient lines matched; ${Math.round(json.length / 1024)} KB`,
);
console.log(`for the page: ${sizes.join(', ')}`);
if (report) {
  console.log('Most common unmatched lines:');
  for (const [k, n] of [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(String(n).padStart(4), k);
}

// The Discover page's collections (/discover/, added 2026-11-22, Kyle's call): small shelves
// of recipes like "From the pantry in 30 minutes" or "Easy curries", picked by rules from the
// index at build time, never by hand-made lists. Each one is a saved search with a title and
// a sentence. Curation sits on top: `pin` puts recipes first, `block` keeps them out (both by
// recipe key, "source:link" as in the index), and a collection can be switched off with
// `off: true`.
//
// To add a collection, add an entry to COLLECTIONS. The rules a collection can use:
//   words       any of these in the recipe's name, as whole words ("curry", "one pot")
//   notWords    none of these in the name
//   courses     the recipe's course is one of these (scripts/course.mjs ids)
//   notCourses  its course isn't one of these
//   maxMinutes  it says how long it takes, and that's this or less
//   maxOwn      it has this many ingredients or fewer, not counting pantry basics
//   staples     every ingredient (beyond the basics) is something a kitchen keeps on hand
//   season      its name says something in season this month (SEASONS)
//   fresh       found by this week's crawl (index.fresh)
//   spotlight   one creator, a different one each week
//   when        only shown on these dates: a function of the build date (see thanksgiving)
//
// Picking: recipes with a photo first, then most opened, from a pool three times the size of
// the shelf, shuffled by the week so a shelf changes every Monday's crawl but holds still
// between them, and no creator gets more than MAX_PER_CREATOR places on one shelf. A shelf
// with fewer than its `min` recipes isn't shown.
//
// Everything here runs in Node at build time (src/pages/discover.astro, src/pages/discover.json.ts)
// and in its tests (collections.test.mjs). It never ships to the browser.

export const MAX_PER_CREATOR = 2;
const SHOW = 8;
const MIN = 6;

// What a kitchen keeps on hand, beyond the pantry basics the index already leaves out of a
// recipe's own list. Shelf-stable sections count whole; from the fridge and the produce
// drawer, only the things that keep for weeks. An item counts when it or any parent is here.
const STAPLE_SECTIONS = new Set(['pantry', 'spices', 'international']);
const STAPLE_ITEMS = new Set([
  'eggs', 'butter', 'milk', 'cheese', 'parmesan', 'cheese-cheddar', 'yogurt',
  'frozen-vegetables', 'peas', 'edamame',
  'garlic', 'onion', 'shallot', 'ginger', 'potatoes-and-root-vegetables', 'carrots',
  'lemons-and-limes', 'green-onion',
]);

// What's in season, by month, for the Pacific Northwest (where Kyle shops; roughly right for
// most of the northern US). Words are matched in recipe names. TODO: move to KitchenCatalog
// as a field on each produce item, so Grocery Deals' seasonal guide can read the same thing.
export const SEASONS = [
  { months: [12, 1, 2], title: 'Winter produce', blurb: 'Citrus, cabbage, roots and hearty greens: what’s good in the middle of winter.',
    words: ['orange', 'oranges', 'mandarin', 'grapefruit', 'pomelo', 'blood orange', 'cabbage', 'kale', 'leek', 'leeks', 'parsnip', 'parsnips', 'turnip', 'turnips', 'rutabaga', 'celery root', 'celeriac', 'beet', 'beets', 'brussels sprouts', 'cauliflower', 'citrus'] },
  { months: [3, 4, 5], title: 'Spring produce', blurb: 'Asparagus, peas, rhubarb and the first tender greens.',
    words: ['asparagus', 'pea', 'peas', 'snap peas', 'snow peas', 'rhubarb', 'radish', 'radishes', 'leek', 'leeks', 'spinach', 'artichoke', 'artichokes', 'fava', 'ramps', 'morel', 'morels', 'green garlic', 'strawberry', 'strawberries'] },
  { months: [6, 7, 8], title: 'Summer produce', blurb: 'Tomatoes, corn, stone fruit and berries, while they last.',
    words: ['tomato', 'tomatoes', 'corn', 'zucchini', 'eggplant', 'cucumber', 'cucumbers', 'peach', 'peaches', 'nectarine', 'plum', 'plums', 'cherry', 'cherries', 'berry', 'berries', 'blueberry', 'blueberries', 'raspberry', 'raspberries', 'blackberry', 'blackberries', 'watermelon', 'melon', 'green beans'] },
  { months: [9, 10, 11], title: 'Fall produce', blurb: 'Squash, apples, pears and the first cold-weather greens.',
    words: ['squash', 'butternut', 'kabocha', 'delicata', 'acorn squash', 'pumpkin', 'sweet potato', 'sweet potatoes', 'apple', 'apples', 'pear', 'pears', 'persimmon', 'persimmons', 'pomegranate', 'cranberry', 'cranberries', 'brussels sprouts', 'kale', 'chard', 'cauliflower', 'chestnut', 'chestnuts', 'mushroom', 'mushrooms', 'chanterelle', 'chanterelles', 'fig', 'figs'] },
];

// Thanksgiving is the fourth Thursday of November; its shelf shows for the three weeks before.
export function thanksgiving(year) {
  const first = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  return new Date(Date.UTC(year, 10, 1 + ((4 - first + 7) % 7) + 21));
}
const daysBefore = (date, target) => Math.round((target - date) / 86400000);

export const COLLECTIONS = [
  {
    id: 'thanksgiving',
    title: 'For Thanksgiving',
    blurb: 'Stuffing, cranberries, pies and the rest of the table.',
    when: (date) => { const d = daysBefore(date, thanksgiving(date.getUTCFullYear())); return d >= 0 && d <= 21; },
    words: ['stuffing', 'cornbread dressing', 'cranberry', 'cranberries', 'turkey gravy', 'mashed potatoes', 'green bean casserole', 'sweet potato casserole', 'pumpkin pie', 'pecan pie', 'apple pie', 'dinner rolls', 'roast turkey', 'turkey breast', 'whole turkey', 'turkey roast', 'brined turkey', 'thanksgiving'],
    // "Turkey" is also a country, and a pie filling is a step, not a dish.
    notWords: ['sandwich', 'turkey burger', 'turkey burgers', 'ground turkey', 'turkey meatballs', 'in turkey', 'from turkey', 'filling', 'juice', 'smoothie', 'dinner', 'spice', 'pop tarts', 'meatloaf', 'meatloaves'],
    notCourses: ['drink', 'breakfast'],
  },
  {
    id: 'season',
    // Title and blurb come from SEASONS.
    season: true,
    notCourses: ['drink', 'sauce'],
  },
  {
    id: 'new',
    title: 'New this week',
    blurb: 'What this week’s look around the sites turned up.',
    fresh: true,
    min: 4,
    search: '/?new=1',
  },
  {
    id: 'pantry',
    title: 'From the pantry in 30 minutes',
    blurb: 'Nothing to shop for if you keep rice, pasta, eggs, onions and a few sauces around.',
    staples: true,
    maxMinutes: 30,
    // Made from the pantry, but not a meal.
    notWords: ['sauce', 'dip', 'butter', 'dressing', 'soup base', 'stock', 'broth', 'seasoning', 'paste', 'syrup', 'spread'],
    courses: ['main', 'side', 'soup', 'breakfast'],
  },
  {
    id: 'curries',
    title: 'Easy curries',
    blurb: 'Curries in 45 minutes or less, with a dozen ingredients at most.',
    words: ['curry', 'curries', 'dal', 'dhal', 'korma', 'tikka masala', 'chana masala', 'paneer masala', 'egg masala', 'vindaloo', 'rendang', 'massaman', 'kare'],
    notWords: ['curry powder', 'curry paste', 'curry leaves', 'curry sauce', 'sandwich', 'puff', 'puffs', 'bread', 'chips'],
    notCourses: ['sauce', 'drink'],
    maxMinutes: 45,
    maxOwn: 12,
    search: '/?q=curry&time=45',
  },
  {
    id: 'one-pot',
    title: 'One pot, one pan',
    blurb: 'Dinners that leave one thing to wash.',
    words: ['one pot', 'one pan', 'sheet pan', 'one skillet', 'traybake', 'tray bake', 'single pan'],
    notCourses: ['dessert', 'drink', 'sauce'],
  },
  {
    id: 'soups',
    title: 'Soups for cold nights',
    blurb: 'Brothy, creamy and slow-simmered, for the dark part of the year.',
    when: (date) => [10, 11, 12, 1, 2, 3].includes(date.getUTCMonth() + 1),
    courses: ['soup'],
    // Cold soups, and stocks that are a step toward a soup.
    notWords: ['gazpacho', 'chilled', 'cold', 'stock', 'broth for', 'soup base'],
    search: '/?course=soup',
  },
  {
    id: 'weeknight',
    title: 'Weeknight mains in 30 minutes',
    blurb: 'Main dishes with eight ingredients or fewer, beyond the basics.',
    courses: ['main'],
    maxMinutes: 30,
    maxOwn: 8,
  },
  {
    id: 'spotlight',
    // Title and blurb name the creator of the week.
    spotlight: true,
    // Creators with at least this many recipes take turns.
    minRecipes: 60,
  },
];

// Words: lowercase, accents off, anything but letters and numbers as a space, padded so a
// phrase matches only whole words.
const plainText = (s) => ` ${String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
const hasAny = (name, words) => words.some((w) => name.includes(` ${plainText(w).trim()} `));

// A small seeded shuffle, so the same week always gives the same order.
function shuffle(list, seed) {
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** The ISO week a date falls in, as "2026-W47": the shelves change when it does. */
export function weekOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - start) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

/** Index row to what a shelf shows. Rows: [source, name, link, minutes, cuisine, pos, own, img, kw, opens, course, added, flags]. */
function rowOut(index, r) {
  const s = index.sources[r[0]];
  return {
    name: r[1],
    url: r[2].startsWith('http') ? r[2] : s.site + r[2],
    key: `${s.id}:${r[2]}`,
    source: s.id,
    creator: s.name,
    minutes: r[3] || 0,
    cuisine: r[4] || '',
    img: r[7] || '',
  };
}
const keyOf = (index, r) => `${index.sources[r[0]].id}:${r[2]}`;

/** Which ingredient positions count as staples, worked out once per index. */
function staplePositions(index, catalog) {
  const ok = new Set();
  index.ing.forEach((g, p) => {
    for (let id = g[0], hops = 0; id && hops < 6; id = catalog.items[id]?.parent, hops++) {
      const item = catalog.items[id];
      if (STAPLE_ITEMS.has(id) || (item && STAPLE_SECTIONS.has(item.section))) { ok.add(p); break; }
    }
  });
  return ok;
}

/** Does this recipe row meet the collection's rules? */
function matches(c, r, ctx) {
  const name = ctx.names[ctx.at.get(r)];
  if (c.words && !hasAny(name, c.words)) return false;
  if (c.notWords && hasAny(name, c.notWords)) return false;
  if (c.courses && !c.courses.includes(r[10])) return false;
  if (c.notCourses && c.notCourses.includes(r[10])) return false;
  if (c.maxMinutes && !(r[3] > 0 && r[3] <= c.maxMinutes)) return false;
  // A recipe with no ingredient list can't be judged by its ingredients.
  if ((c.maxOwn || c.staples) && !r[5].length) return false;
  if (c.maxOwn && r[6].length > c.maxOwn) return false;
  // Two own ingredients at least, so a bowl of rice isn't "from the pantry".
  if (c.staples && (r[6].length < 2 || !r[6].every((p) => ctx.staples.has(p)))) return false;
  if (c.season && !hasAny(name, ctx.season.words)) return false;
  if (c.fresh && !ctx.fresh.has(ctx.at.get(r))) return false;
  return true;
}

/** Choose a shelf's recipes: pins first, then a week-shuffled pool, creators capped. */
// Most opened first; among equals (most recipes have no opens yet) a draw that changes with
// the week, not the alphabet, or every shelf would be recipes starting with "A".
const byOpens = (index, seed) => (a, b) =>
  Number(!!b[7]) - Number(!!a[7]) || (b[9] || 0) - (a[9] || 0) || hash(`${seed}:${keyOf(index, a)}`) - hash(`${seed}:${keyOf(index, b)}`);

function choose(index, list, { pin = [], show, seed }) {
  const byKey = new Map(list.map((r) => [keyOf(index, r), r]));
  const pinned = pin.map((k) => byKey.get(k)).filter(Boolean);
  const rest = list.filter((r) => !pinned.includes(r)).sort(byOpens(index, seed));
  // With photos first, then the rest, each shuffled within the week's pool.
  const pool = rest.slice(0, show * 3);
  const withPhoto = shuffle(pool.filter((r) => r[7]), seed);
  const without = shuffle(pool.filter((r) => !r[7]), seed + 1);
  const out = [];
  const per = new Map();
  for (const r of [...pinned, ...withPhoto, ...without, ...rest.slice(show * 3)]) {
    if (out.length >= show) break;
    const n = per.get(r[0]) || 0;
    if (!pinned.includes(r) && n >= MAX_PER_CREATOR) continue;
    per.set(r[0], n + 1);
    out.push(r);
  }
  return out;
}

/** A shelf's whole list in the order "See all" shows it: what the shelf shows first, then the rest with creators taking turns, so one big site doesn't fill the first page. */
function seeAllOrder(index, list, shown, seed) {
  const rest = list.filter((r) => !shown.includes(r)).sort(byOpens(index, seed));
  const bySource = new Map();
  for (const r of rest) (bySource.get(r[0]) || bySource.set(r[0], []).get(r[0])).push(r);
  const queues = [...bySource.values()];
  const out = [...shown];
  for (let turn = 0; out.length < list.length; turn++) for (const q of queues) if (q[turn]) out.push(q[turn]);
  return out.map((r) => keyOf(index, r));
}

/**
 * Every collection to show on the build date, in order.
 * @param {any} index public/index.json
 * @param {any} catalog vendor/kitchen-catalog/catalog.json
 * @param {{ date?: Date, collections?: any[] }} [opts] date defaults to the index's build date
 */
export function buildCollections(index, catalog, opts = {}) {
  const date = opts.date || new Date(`${index.built}T12:00:00Z`);
  const week = weekOf(date);
  const month = date.getUTCMonth() + 1;
  const recipes = index.recipes;
  const ctx = {
    names: recipes.map((r) => plainText(r[1])),
    at: new Map(recipes.map((r, i) => [r, i])),
    staples: staplePositions(index, catalog),
    season: SEASONS.find((s) => s.months.includes(month)),
    fresh: new Set(index.fresh || []),
  };
  const shelves = [];
  for (const c of opts.collections || COLLECTIONS) {
    if (c.off || (c.when && !c.when(date))) continue;
    const show = c.show || SHOW;
    const seed = hash(`${week}:${c.id}`);
    const block = new Set(c.block || []);
    if (c.spotlight) {
      const counts = new Map();
      for (const r of recipes) if (r[7]) counts.set(r[0], (counts.get(r[0]) || 0) + 1);
      const eligible = [...counts].filter(([, n]) => n >= (c.minRecipes || 60)).map(([s]) => s).sort((a, b) => index.sources[a].id.localeCompare(index.sources[b].id));
      if (!eligible.length) continue;
      const src = eligible[hash(week) % eligible.length];
      // Their food, not their drinks or sauces.
      const theirs = recipes.filter((r) => r[0] === src && !['drink', 'sauce'].includes(r[10]) && !block.has(keyOf(index, r)));
      const rows = shuffle(
        theirs.sort(byOpens(index, seed)).slice(0, show * 3),
        seed,
      ).slice(0, show);
      const s = index.sources[src];
      shelves.push({
        id: c.id,
        title: `This week: ${s.name}`,
        blurb: `A few of ${s.name}’s ${theirs.length.toLocaleString('en-US')} recipes here. Their page has more, and the ways to back them.`,
        count: theirs.length,
        search: `/?site=${encodeURIComponent(s.id)}`,
        creator: s.id,
        rows: rows.map((r) => rowOut(index, r)),
      });
      continue;
    }
    const list = recipes.filter((r) => !block.has(keyOf(index, r)) && matches(c, r, ctx));
    if (list.length < (c.min || MIN)) continue;
    const rows = choose(index, list, { pin: c.pin, show, seed });
    shelves.push({
      id: c.id,
      title: c.season ? ctx.season.title : c.title,
      blurb: c.season ? ctx.season.blurb : c.blurb,
      count: list.length,
      search: c.search || '',
      rows: rows.map((r) => rowOut(index, r)),
      // Every recipe on the shelf, for "See all" (/discover/keys.json and /?collection=<id>),
      // in the order "See all" shows them: the shelf's own first, then creators taking turns.
      keys: seeAllOrder(index, list, rows, seed),
    });
  }
  return { week, built: index.built, shelves };
}

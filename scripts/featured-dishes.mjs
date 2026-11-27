// Which dishes can be "Today's dish" in the app's Explore tab, and in what order.
//
// The explorer lists 1,500 or so "dishes", and plenty of them aren't something you'd sit down
// to: a thickener (beurre manié), a sauce, a cheese, a wine, a kind of restaurant. Picking
// from all of them at random put those on the front of Explore. This works out the ones worth
// featuring and writes them, in the order to show them, to
// public/explore/app/data/web/daily.json. The app shows one a day, walking the list.
//
// Three steps, each a small function below:
//   1. kindOf():   what the first sentence of its Wikipedia intro says it is ("… is a paste").
//                  A dish whose kind is in NOT_A_DISH is left out.
//   2. scoreOf():  how much there is to see on its page. Only dishes at FEATURE_SCORE or
//                  above are featured.
//   3. rotate():   a fixed shuffle, then spread out so the same part of the world, and the
//                  same cuisine, don't come up on days close together.
//
// It reads only the explorer's copy (vendor/explore/data), so it runs wherever staging runs.
// To keep one dish out or put one in by hand, use BLOCK and ALLOW.
//
// No dependencies; Node 18+.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** A page with less than this isn't featured. See scoreOf() for what earns a point. */
export const FEATURE_SCORE = 5;

/** Days before the same part of the world, and the same cuisine, may come up again. */
export const CONTINENT_GAP = 1;
export const CUISINE_GAP = 7;

/** Fewer than this and something is wrong with the data: staging fails instead of publishing. */
export const MIN_FEATURED = 200;

/** Dish names never to feature, whatever the rules say. */
export const BLOCK = new Set([
  // The intro calls each a "mixture" or a "preparation", which the rules can't tell from a dish
  'Duxelles',
  'Egg butter',
]);
/** Dish names to feature even though the rules would leave them out (they still need a photo). */
export const ALLOW = new Set([
  // "A grilled, steamed, or boiled sausage served in … a bun"
  'Hot dog',
]);

// What something is when it isn't a dish. Matched against the head of the intro's first
// noun phrase ("a thick Georgian sauce" is a sauce), so "a pasta dish with a cheese sauce"
// and "a grilled cheese sandwich" stay dishes.
export const NOT_A_DISH = new Set([
  // things you cook with or put on a dish
  'sauce', 'condiment', 'paste', 'seasoning', 'marinade', 'relish', 'ketchup', 'chutney', 'salsa', 'sambal',
  'thickener', 'roux', 'stock', 'butter', 'oil', 'fat', 'syrup', 'jam', 'vinegar',
  'ingredient', 'garnish', 'topping', 'filling', 'glaze', 'dressing', 'gravy', 'powder', 'flour', 'starch',
  'blend', 'mix', 'masala', 'spice', 'herb', 'pickle',
  // foods that are bought, not cooked as a dish
  'cheese', 'sausage', 'ham', 'salami', 'bacon', 'cut', 'chocolate',
  // drinks
  'drink', 'beverage', 'wine', 'beer', 'liqueur', 'spirit', 'liquor', 'brandy', 'cocktail', 'tea', 'coffee', 'juice',
  // ideas and places, not plates
  'technique', 'method', 'process', 'term', 'category', 'tradition', 'practice', 'custom',
  'restaurant', 'bar', 'pub', 'establishment', 'shop', 'store', 'course', 'concept',
]);

// Words that say it is a dish. Only used to find the head of the phrase: in "a grilled
// cheese sandwich" the last word either list knows is "sandwich", so it is one.
const A_DISH = new Set([
  'dish', 'soup', 'stew', 'cake', 'bread', 'salad', 'dessert', 'pastry', 'sandwich', 'dumpling', 'snack', 'noodle',
  'pie', 'pudding', 'curry', 'porridge', 'pancake', 'biscuit', 'cookie', 'confection', 'confectionery', 'sweet',
  'tart', 'roll', 'bun', 'fritter', 'omelette', 'omelet', 'casserole', 'flatbread', 'pizza', 'pasta', 'kebab',
  'burger', 'hamburger', 'taco', 'doughnut', 'donut', 'candy', 'cracker', 'wrap', 'skewer', 'roast', 'appetizer',
  'appetiser', 'meze', 'delicacy', 'food', 'specialty', 'speciality', 'recipe', 'breakfast', 'meal', 'dough',
  'batter', 'cheesecake', 'torte', 'croquette', 'patty', 'barbecue', 'broth', 'chowder', 'risotto', 'pilaf',
  'waffle', 'crepe', 'custard', 'ice', 'sorbet', 'toast', 'loaf', 'meatball', 'ball', 'cutlet', 'steak', 'chop',
]);

// Words that end the first noun phrase: what follows describes it ("… paste, consisting of").
// Commas and "and" don't end it: "a hot and savoury bean paste", "a fermented, low-alcohol beverage".
const PHRASE_END = /[;:]| (?:of|made|consisting|consists|that|which|who|from|in|with|served|prepared|used|originating|originated|popular|eaten|commonly|traditionally|typically|usually|for|whose|where|when|on|at|by|to|similar|known|found|native|cooked|composed|containing|based|produced|invented|created|associated|consumed|cut|composed) /;
// "a type of sausage" and "a Swedish style of pizza" are a sausage and a pizza
const KIND_OF = /^(?:[\p{L}'-]+\s+){0,3}?(?:type|kind|variety|form|style|sort|class|group|range|number|variant|version|family|category|part)s?\s+of\s+/u;

// Kinds trusted in a name's last word. Shorter than NOT_A_DISH: "Macaroni and cheese" and
// "Rich tea" are named for what's in them.
const NAMED = new Set(['sauce', 'condiment', 'dressing', 'relish', 'chutney', 'restaurant', 'drink', 'beverage', 'liqueur', 'wine', 'beer']);

/** The first sentence of an intro, without the bracketed pronunciations Wikipedia opens with. */
export function firstSentence(intro) {
  let s = String(intro ?? '');
  // Take brackets out (nested ones too), since they hold full stops: "(lit. 'kneaded butter')"
  for (let i = 0; i < 4 && /[([]/.test(s); i++) s = s.replace(/\s*[([][^()[\]]*[)\]]/g, '');
  const end = s.search(/[.!?](?:\s|$)/);
  return (end < 0 ? s : s.slice(0, end)).trim();
}

/**
 * What the intro says the thing is: the head word of "X is a <…>", lowercase and singular,
 * when it is a word either list above knows. '' when the sentence doesn't say.
 */
export function kindOf(intro) {
  const s = firstSentence(intro);
  const m = s.match(/\b(?:is|are|was|were|refers to|means)\s+(?:(?:an?|the|one of the|any of the|any|one of|either)\s+)?(.+)$/i);
  if (!m) return '';
  let phrase = m[1].toLowerCase();
  for (let i = 0; i < 2; i++) phrase = phrase.replace(KIND_OF, '').replace(/^(?:an?|the)\s+/, '');
  const cut = (phrase + ' ').search(PHRASE_END);
  if (cut >= 0) phrase = phrase.slice(0, cut);
  // "A cold soup and drink" is a soup: among parts joined by "and", "or" or a comma, a dish wins
  let found = '';
  for (const part of phrase.split(/,| and | or /)) {
    const words = part.split(/[^\p{L}]+/u).filter(Boolean).slice(0, 12).map(singular);
    const head = words.findLast((w) => NOT_A_DISH.has(w) || A_DISH.has(w));
    if (head && A_DISH.has(head)) return head;
    if (head) found = head;
  }
  return found;
}

function singular(w) {
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(?:ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

/**
 * How much a dish's page has to show, 0 to 6. A point each for: an intro, an intro of some
 * length, a cuisine, a second ingredient, a fourth ingredient, and a recipe site or cookbook
 * listed for one of its cuisines (so "Cook it" leads somewhere).
 */
export function scoreOf(d) {
  const intro = d.intro ?? '';
  return (intro ? 1 : 0)
    + (intro.length >= 240 ? 1 : 0)
    + (d.cuisines.length >= 1 ? 1 : 0)
    + (d.ingredients >= 2 ? 1 : 0)
    + (d.ingredients >= 4 ? 1 : 0)
    + (d.picked ? 1 : 0);
}

/** Why a dish isn't featured, or '' when it is. */
export function reasonOut(d) {
  if (BLOCK.has(d.name)) return 'blocked by hand';
  if (!d.photo) return 'no photo';
  if (ALLOW.has(d.name)) return '';
  const kind = kindOf(d.intro);
  if (NOT_A_DISH.has(kind)) return `a ${kind}, not a dish`;
  // "Albufera sauce", "Mors (drink)", "Korean restaurant": the name says it even when the intro is roundabout
  const named = singular(d.name.toLowerCase().replace(/[()]/g, ' ').trim().split(/\s+/).pop() ?? '');
  if (NAMED.has(named)) return `named as a ${named}`;
  // "Curry in the United Kingdom", "List of Japanese restaurants": an article about a subject
  if (/^List of |\S in (?:the )?\p{Lu}/u.test(d.name)) return 'an overview, not a dish';
  const score = scoreOf(d);
  if (score < FEATURE_SCORE) return `score ${score} of ${FEATURE_SCORE}`;
  return '';
}

/** FNV-1a, so the shuffle is the same on every build and a new dish moves few others. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/**
 * The featured dishes in the order to show them: shuffled the same way every time, then each
 * next day takes the first dish whose part of the world wasn't on in the last CONTINENT_GAP
 * days and whose cuisines weren't on in the last CUISINE_GAP. When nothing fits (near the end,
 * when one continent is all that's left) the rule about cuisines goes first, then continents.
 */
export function rotate(dishes) {
  const pool = [...dishes].sort((a, b) => hash(a.ref) - hash(b.ref) || (a.ref < b.ref ? -1 : 1));
  const out = [];
  const clash = (d, gapC, gapK) => {
    for (let i = 1; i <= Math.max(gapC, gapK) && i <= out.length; i++) {
      const prev = out[out.length - i];
      if (i <= gapC && d.continent && d.continent === prev.continent) return true;
      if (i <= gapK && d.cuisines.some((c) => prev.cuisines.includes(c))) return true;
    }
    return false;
  };
  while (pool.length) {
    let at = pool.findIndex((d) => !clash(d, CONTINENT_GAP, CUISINE_GAP));
    if (at < 0) at = pool.findIndex((d) => !clash(d, CONTINENT_GAP, 0));
    if (at < 0) at = 0;
    out.push(pool.splice(at, 1)[0]);
  }
  return out;
}

/**
 * Every dish with what the rules need, from the explorer's own files.
 *   skeleton: data/web/skeleton.json (every page's address, name and links)
 *   app:      data/web/app.json (photos, each cuisine's part of the world)
 *   intros:   data/food_summaries.json (dish name to its Wikipedia intro)
 *   picked:   names of cuisines with a recipe site or cookbook listed (so "Cook it" has rows)
 * A row that isn't the shape expected is skipped, never fatal.
 */
export function readDishes({ skeleton, app, intros, picked = new Set() }) {
  const nodes = Array.isArray(skeleton?.nodes) ? skeleton.nodes : [];
  const DISH = 1, CUISINE = 0, INGREDIENT = 2;
  const links = new Map();
  for (const l of Array.isArray(skeleton?.links) ? skeleton.links : []) {
    if (!Array.isArray(l) || l.length !== 2 || !nodes[l[0]] || !nodes[l[1]]) continue;
    for (const [a, b] of [l, [l[1], l[0]]]) {
      if (!links.has(a)) links.set(a, new Set());
      links.get(a).add(b);
    }
  }
  const out = [];
  nodes.forEach((n, i) => {
    if (!Array.isArray(n) || n[2] !== DISH || typeof n[0] !== 'string' || typeof n[1] !== 'string') return;
    const near = [...(links.get(i) ?? [])].map((j) => nodes[j]).filter(Array.isArray);
    const cuisines = near.filter((x) => x[2] === CUISINE).map((x) => x[1]).sort();
    // The part of the world most of its cuisines are in
    const tally = new Map();
    for (const x of near) {
      const c = x[2] === CUISINE ? app?.cont?.[x[0]] : null;
      if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
    }
    const continent = [...tally].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? '';
    const intro = intros?.[n[1]];
    out.push({
      ref: n[0],
      name: n[1],
      photo: Boolean(app?.photos?.[n[0]]),
      intro: typeof intro === 'string' ? intro : '',
      cuisines,
      continent,
      ingredients: near.filter((x) => x[2] === INGREDIENT).length,
      picked: cuisines.some((c) => picked.has(c)),
    });
  });
  return out;
}

/** The file the app reads. `dishes` is page addresses ("dish/bibimbap"), in showing order. */
export function buildDaily(sources) {
  const all = readDishes(sources);
  const left = {};
  const featured = [];
  for (const d of all) {
    const why = reasonOut(d);
    if (!why) featured.push(d);
    else {
      const key = why.startsWith('score') ? 'thin page' : /^(?:an? |named)/.test(why) ? 'not a dish' : why;
      left[key] = (left[key] ?? 0) + 1;
    }
  }
  if (featured.length < MIN_FEATURED) {
    throw new Error(`Only ${featured.length} of ${all.length} dishes can be featured (need ${MIN_FEATURED}). The explorer's data or the rules in scripts/featured-dishes.mjs need a look.`);
  }
  return {
    file: { version: 1, dishes: rotate(featured).map((d) => d.ref) },
    counts: { dishes: all.length, featured: featured.length, left },
  };
}

/**
 * Reads the explorer's copy in `src` (vendor/explore) and writes daily.json beside the staged
 * data in `dest` (public/explore/app). Throws, writing nothing, when the data is missing or
 * too few dishes come out.
 */
export function writeDaily(src, dest) {
  const read = (f) => JSON.parse(readFileSync(join(src, 'data', f), 'utf8'));
  const listed = (o) => Object.entries(o?.cuisines ?? {}).filter(([, v]) => v?.sites?.length || v?.cookbooks?.length).map(([k]) => k);
  const { file, counts } = buildDaily({
    skeleton: read('web/skeleton.json'),
    app: read('web/app.json'),
    intros: read('food_summaries.json'),
    picked: new Set([...listed(read('picks.json')), ...listed(read('suggestions.json'))]),
  });
  writeFileSync(join(dest, 'data/web/daily.json'), JSON.stringify(file) + '\n');
  return counts;
}

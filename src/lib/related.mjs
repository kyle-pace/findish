// "Related: twice cooked pork, kung pao chicken." after the results of a dish search.
// Worked out in the browser from the index; nothing is looked up anywhere.
import { ingredientFor, isFiller, words } from './search-core.mjs';

/** How a dish is cooked or what it's like, not what it is: two dishes that share only these aren't related. */
const HOW = new Set(
  'stir fry fried braised steamed roast roasted grilled baked boiled poached smoked pickled stuffed glazed marinated crispy spicy sweet sour hot cold red green white black sauce and'.split(' '),
);
/** A main ingredient is one few recipes use: at most this share of its cuisine's recipes. */
const RARE = 0.1;

/**
 * The index's dish phrases that are some recipe's whole name ("kung pao chicken", not "spicy
 * stir"), by the words a search matches on: `say` is how to write it, `n` how many recipes
 * are named for it. Worked out once per loaded index.
 */
const made = new WeakMap();
function dishesOf(ready, phrases) {
  let dishes = made.get(ready);
  if (dishes) return dishes;
  const whole = new Set(ready.recipes.map((r) => r.core.join(' ')));
  dishes = new Map();
  for (const p of phrases) {
    const key = words(p).filter((w) => !isFiller(w)).join(' ');
    // Not an ingredient's name ("soy sauce"), and a dish in its own right.
    if (whole.has(key) && ingredientFor(ready, p) == null) dishes.set(key, { say: p, n: 0 });
  }
  for (const r of ready.recipes) for (const key of dishesIn(dishes, r)) dishes.get(key).n++;
  made.set(ready, dishes);
  return dishes;
}

/** The dishes a recipe's name holds: runs of two or three of its words that are in `dishes`. */
function dishesIn(dishes, r) {
  const ws = r.phrase.trim().split(' ');
  const out = [];
  for (const size of [3, 2])
    for (let i = 0; i + size <= ws.length; i++) {
      const key = ws.slice(i, i + size).join(' ');
      if (dishes.has(key) && !out.includes(key)) out.push(key);
    }
  return out;
}

const tally = (xs) => {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
};

/**
 * Up to four dishes related to a dish search, or none. `hits` are the search's results
 * (best first), `q` its words (stemmed), `phrases` the index's dish phrases.
 *
 * A dish is related when both hold:
 * - the same cuisine: at least half of the top results share one, and so do at least half
 *   of the dish's own recipes (no shared cuisine, no line);
 * - and either a dish word in common that says what it is ("curry" for green curry, "mein"
 *   for chow mein, "chicken" for kung pao chicken; never just how it's cooked, "fried"),
 *   or a main ingredient: one that's in at least two in five of the top results and in
 *   few of that cuisine's recipes (tofu and doubanjiang for mapo tofu, not garlic). Most of the
 *   dish's recipes, and three at least, must use two of them (one, when the results only
 *   have one).
 * The search's own dish again ("egg fried rice" for "fried rice") is never offered. Shown
 * only when two or more qualify, so often not at all.
 */
export function relatedDishes(ready, phrases, hits, q) {
  if (!phrases?.length || hits.length < 3 || !q.length) return [];
  const dishes = dishesOf(ready, phrases);
  const recipes = ready.recipes;
  const top = hits.slice(0, 20);
  const [cuisine, n] = tally(top.map((h) => h.r.cuisine).filter(Boolean))[0] || ['', 0];
  if (!cuisine || n * 2 < top.length) return [];
  // Main ingredients: in two in five of the top results, and in few of the cuisine's recipes
  // (sake and mirin are in half of everything Japanese, so they say nothing about teriyaki).
  const inCuisine = recipes.filter((r) => r.cuisine === cuisine);
  const main = tally(top.flatMap((h) => h.r.own))
    .filter(([p, k]) => k >= Math.max(2, 0.4 * top.length) && inCuisine.filter((r) => r.pos.has(p)).length <= RARE * inCuisine.length)
    .slice(0, 4)
    .map(([p]) => p);
  // The words that say what the dish is. Not how it's cooked, and not the cuisine's own
  // name: "thai" in "pad thai" would make every "Thai …" dish a relative.
  const place = new Set(ready.index.cuisines.flatMap(([c]) => words(c)));
  const kind = q.filter((w) => !isFiller(w) && !HOW.has(w) && !place.has(w));
  /** dish -> [its recipes in this cuisine, how many of those use the main ingredients] */
  const near = new Map();
  for (const r of inCuisine) {
    // Without a dish word in common, one ingredient isn't much to go on: two, when there are two.
    const shared = main.length > 0 && main.filter((p) => r.pos.has(p)).length >= Math.min(2, main.length);
    for (const key of dishesIn(dishes, r)) {
      const t = near.get(key) || near.set(key, [0, 0]).get(key);
      t[0]++;
      if (shared) t[1]++;
    }
  }
  const ranked = [];
  for (const [key, [mine, using]] of near) {
    const ws = key.split(' ');
    if (mine < 2 || mine < 0.5 * dishes.get(key).n) continue;
    // The same dish again isn't related, it's the search.
    if (q.every((w) => ws.includes(w))) continue;
    const word = kind.some((w) => ws.includes(w));
    const made = using >= (word ? 2 : 3) && using >= 0.6 * mine;
    if (!word && !made) continue;
    // Both beats one; then the dishes with the most recipes to their name.
    ranked.push([key, (word ? 1 : 0) + (made ? 1 : 0) + using / mine / 2 + Math.log2(1 + mine) / 10]);
  }
  ranked.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const out = [];
  for (const [key] of ranked) {
    if (out.length === 4) break;
    // "wonton soup" and "wonton noodle soup" are one idea: the first one stands.
    const ws = key.split(' ');
    const same = (k) => k.split(' ').filter((w) => ws.includes(w) && !kind.includes(w) && !place.has(w) && !HOW.has(w)).length > 0;
    if (!out.some(same)) out.push(key);
  }
  return out.length > 1 ? out.map((k) => dishes.get(k).say) : [];
}

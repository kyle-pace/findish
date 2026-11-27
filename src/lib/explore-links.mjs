// Which of the explorer's dishes finDish has recipes for (2026-11-27), so a dish's page under
// /explore/ can offer "Find recipes" only when the search will find some, and a search that
// is exactly one of those dishes can point at its page.
//
// A dish counts when its name, as the search reads words (search-core's `words`: lowercase,
// accents off, singular), appears whole and in order in at least MIN recipe names. That is
// stricter than the search itself, which also finds by keyword and ingredient, so the search
// the button opens always finds at least this many. Pure: no files, no network.
import { words } from './search-core.mjs';

/** Fewer recipes than this and the page offers nothing. */
export const MIN = 3;

/** How the search reads a name: "Crêpes Suzette" is "crepe suzette". */
export const norm = (text) => words(String(text ?? '')).join(' ');

/**
 * @param {string[]} recipeNames every recipe's name
 * @param {{ ref: string, name: string }[]} dishes the explorer's dishes
 * @returns {Record<string, { name: string, count: number }>} by ref, only dishes with MIN or more
 */
export function dishesWithRecipes(recipeNames, dishes, min = MIN) {
  const names = recipeNames.map((n) => ` ${norm(n)} `);
  const out = {};
  const seen = new Set();
  for (const d of dishes) {
    if (!d || typeof d.ref !== 'string' || typeof d.name !== 'string') continue;
    // "Mors (drink)" is searched for as "Mors"
    const name = d.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const key = norm(name);
    // Two pages for one name ("Fishcake" and "Fish cake" don't collide, "Pie" twice would): the first keeps it
    if (!key || seen.has(key)) continue;
    const needle = ` ${key} `;
    let count = 0;
    for (const n of names) if (n.includes(needle)) count++;
    if (count >= min) {
      seen.add(key);
      out[d.ref] = { name, count };
    }
  }
  return out;
}

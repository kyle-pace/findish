// Common dish phrases, for the search box's completions ("map" offers "mapo tofu") and the
// "Related:" line under results. Built from recipe names only: runs of two or three words
// that several recipes share, most common first. Nothing here comes from what people type.
import { isFiller, words } from '../src/lib/search-core.mjs';

/** Words a dish phrase can't start or end with ("tofu with", "and rice"). */
const EDGE = new Set('with and or of the a an in on for to from by my our your how style ish plus vs & recipe recipes easy best quick simple homemade'.split(' '));
/** Words that say how it's made or served, not what it is: too vague to lead a search. */
const VAGUE = new Set('one pot pan sheet instant slow cooker air fryer minute minutes ingredient ingredients step way ways made make new favorite favourite ft feat 0'.split(' '));

/** Words that end an ingredient's name, so never start a dish's: "(soy) sauce chicken". */
const TAILS = new Set(['sauce', 'paste', 'powder']);

/** Words that join two halves of one name: "sweet and sour", "salt & pepper". */
const JOINS = new Set(['and', 'n']);
/** What can follow a dish's name in a recipe's name: "Mapo Tofu with Pork", "Pad Thai Recipe". */
const AFTER = new Set('with and in on for or from recipe recipes 0'.split(' '));

/**
 * `names`: every recipe's name, or `[name, creator]` pairs (the creator is any id). Gives
 * back up to `max` phrases, lowercase, most common first. Latin letters only. A phrase
 * must be:
 * - in at least `min` names, from two creators or more, or in `minOne` names when they're
 *   all one creator's (a series one site runs, "Pocket Pie Reloaded", isn't a dish). With
 *   plain names and no creators this rule is skipped;
 * - where a name ends, or just before "with…", twice or more and in at least `ends` of the
 *   names it's in:
 *   "beef chow" (always "beef chow fun"), "Chinese restaurant" (always "…style fried rice")
 *   and "stir fried" never are, "fried rice" often is;
 * - not the back half of something: the same word comes before it in most of its names
 *   ("sauce chicken", always after "soy"), or "and" does ("sour pork", after "sweet and");
 * - not mostly a piece of one longer phrase ("chicken stir" of "chicken stir fry").
 * Plural and singular count as one phrase, shown the way most names write it.
 */
export function dishPhrases(names, { max = 1500, min = 3, minOne = 6, ends = 0.2 } = {}) {
  /** stemmed key -> { n, size, ended, creators, forms: Map(surface -> n) } */
  const seen = new Map();
  const paired = names.some((x) => Array.isArray(x));
  for (const item of names) {
    const [name, creator] = Array.isArray(item) ? item : [item, ''];
    // A possessive ("Dad's Steamed…", "Chef's Secrets") marks a series or a person, not a dish:
    // it becomes a break no phrase runs across.
    const plain = String(name)
      .replace(/\([^)]*\)/g, ' ')
      .toLowerCase()
      .replace(/[\p{L}\p{N}]+[’']s\b/gu, ' 0 ')
      .replace(/[’']/g, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    const mine = new Set();
    // Four-word runs are counted only to spot the pieces of them ("thai black sticky").
    for (const size of [2, 3, 4]) {
      for (let i = 0; i + size <= plain.length; i++) {
        const run = plain.slice(i, i + size);
        if (size < 4 && (EDGE.has(run[0]) || EDGE.has(run.at(-1)))) continue;
        if (run.some((w) => /^\d+$/.test(w) || VAGUE.has(w) || w.length < 2 || /[^\u0000-\u024f]/.test(w))) continue;
        // "soup with pork" is a description, not a dish's name ("chicken and rice" is one).
        if (size === 3 && run[1] === 'with') continue;
        const stems = run.map((w) => words(w)[0]);
        if (stems.some((s) => !s)) continue;
        // Filler ("easy", "best") never leads or ends a phrase, and a pair is never filler at all.
        if (size < 4 && (isFiller(stems[0]) || isFiller(stems.at(-1)) || (size === 2 && stems.some(isFiller)))) continue;
        // "sauce chicken" and "sauce noodles" are the tail of soy, oyster or fish sauce (2026-11-19:
        // with 35 sites no one word comes before them most of the time, so the rule below missed them).
        if (TAILS.has(stems[0])) continue;
        const key = stems.join(' ');
        if (mine.has(key)) continue;
        mine.add(key);
        const entry = seen.get(key) || seen.set(key, { n: 0, size, ended: 0, creators: new Set(), before: new Map(), forms: new Map() }).get(key);
        entry.n++;
        entry.creators.add(creator);
        const next = plain[i + size];
        if (next === undefined || AFTER.has(next)) entry.ended++;
        const prev = i ? plain[i - 1] : '';
        entry.before.set(prev, (entry.before.get(prev) || 0) + 1);
        const form = run.join(' ');
        entry.forms.set(form, (entry.forms.get(form) || 0) + 1);
      }
    }
  }
  const all = [...seen.entries()].filter(([, e]) => e.n >= min);
  // A phrase that is nearly always the start or end of a longer one is a piece of it, not a
  // dish: "chicken stir" (of "chicken stir fry"), "fried bok" (of "fried bok choy").
  const longer = new Map();
  for (const [key, e] of all) {
    if (e.size < 3) continue;
    const ws = key.split(' ');
    for (const part of [ws.slice(0, -1).join(' '), ws.slice(1).join(' ')]) longer.set(part, Math.max(longer.get(part) || 0, e.n));
  }
  const kept = all.filter(([key, e]) => {
    if (e.size > 3 || (longer.get(key) || 0) >= 0.6 * e.n) return false;
    if (paired && e.creators.size < 2 && e.n < minOne) return false;
    if (e.ended < ends * e.n) return false;
    if (e.ended < 2) return false;
    for (const [prev, k] of e.before) if (prev && k >= (JOINS.has(prev) ? 0.5 : 0.6) * e.n) return false;
    // Never first in a name, and nearly always after one of the same two words: "pepper
    // chicken" (after "black" or "and"), "sauce chicken" (after "soy" or "oyster").
    const two = [...e.before.values()].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0);
    return !(e.n >= 4 && !e.before.has('') && two >= 0.75 * e.n);
  });
  return kept
    .sort((x, y) => y[1].n - x[1].n || (x[0] < y[0] ? -1 : 1))
    .slice(0, max)
    .map(([, e]) => [...e.forms.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0][0]);
}

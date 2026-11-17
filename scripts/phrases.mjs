// Common dish phrases, for the search box's completions ("map" offers "mapo tofu") and the
// "Related:" line under results. Built from recipe names only: runs of two or three words
// that several recipes share, most common first. Nothing here comes from what people type.
import { isFiller, words } from '../src/lib/search-core.mjs';

/** Words a dish phrase can't start or end with ("tofu with", "and rice"). */
const EDGE = new Set('with and or of the a an in on for to from by my our your how style ish plus vs & recipe recipes easy best quick simple homemade'.split(' '));
/** Words that say how it's made or served, not what it is: too vague to lead a search. */
const VAGUE = new Set('one pot pan sheet instant slow cooker air fryer minute minutes ingredient ingredients step way ways made make new favorite favourite ft feat 0'.split(' '));

/**
 * `names`: every recipe's name. Gives back up to `max` phrases, lowercase, most common
 * first. A phrase must be in at least `min` names; plural and singular count as one phrase
 * (shown the way most names write it); a phrase that is mostly a piece of a longer one is
 * left out. Latin letters only.
 */
export function dishPhrases(names, { max = 1500, min = 3 } = {}) {
  /** stemmed key -> { n, forms: Map(surface -> n) } */
  const seen = new Map();
  for (const name of names) {
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
        const key = stems.join(' ');
        if (mine.has(key)) continue;
        mine.add(key);
        const entry = seen.get(key) || seen.set(key, { n: 0, size, forms: new Map() }).get(key);
        entry.n++;
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
  const kept = all.filter(([key, e]) => e.size < 4 && (longer.get(key) || 0) < 0.6 * e.n);
  return kept
    .sort((x, y) => y[1].n - x[1].n || (x[0] < y[0] ? -1 : 1))
    .slice(0, max)
    .map(([, e]) => [...e.forms.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0][0]);
}

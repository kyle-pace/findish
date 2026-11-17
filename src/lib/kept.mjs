// What the search page keeps on the device, in localStorage and nowhere else: recent
// searches (as the address's query string), recipes opened lately and recipes saved for
// later (as recipe keys like "woks:/mapo-tofu/"). These are the pure parts, apart from the
// DOM and from localStorage itself, so `npm test` can run them. src/scripts/search.ts reads
// and writes the lists; nothing here is ever sent anywhere.

export const KEEP = {
  recent: { key: 'findish-recent-searches', max: 8 },
  opened: { key: 'findish-opened', max: 8 },
  saved: { key: 'findish-saved', max: 500 },
};

/** A stored list, read back safely: an array of short strings, no repeats, at most `max`. Anything else is an empty list. */
export function readList(text, max = 50) {
  let list;
  try {
    list = JSON.parse(text || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((x) => typeof x === 'string' && x && x.length <= 600))].slice(0, max);
}

/** `item` goes to the front (newest first); the list keeps at most `max`. */
export function putFirst(list, item, max = 50) {
  if (!item) return list;
  return [item, ...list.filter((x) => x !== item)].slice(0, max);
}

/** The list without `item`. */
export const dropFrom = (list, item) => list.filter((x) => x !== item);

/** Address parameters that aren't part of a search worth remembering: a random pick, Ask's switch, campaign tags. */
const NOT_SEARCH = /^(pick|chat|exact|saved|utm_.*)$/;

/**
 * A search as it's remembered: its query string without the parts that aren't the search
 * ("q=tofu&site=woks"). '' when nothing is searched.
 */
export function recentKey(search) {
  const p = new URLSearchParams(String(search ?? '').replace(/^\?/, ''));
  const out = new URLSearchParams();
  for (const [k, v] of p) if (v && !NOT_SEARCH.test(k)) out.append(k, v);
  return out.toString();
}

/**
 * Remembering a search. A search that only refines the one remembered last this visit (a
 * filter set, a tag added) takes its place instead of filling the list with every step;
 * `refines` is that earlier search's key, or ''.
 */
export function rememberSearch(list, search, { refines = '', max = KEEP.recent.max } = {}) {
  const key = recentKey(search);
  if (!key) return list;
  return putFirst(refines && refines !== key ? dropFrom(list, refines) : list, key, max);
}

/** "tofu, ginger, from The Woks of Life": a search as one readable line. `parts`: the words, then each tag and filter as the page words them. */
export function searchLabel(parts) {
  return parts
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

/** The saved list as an address fragment ("#list=woks:/mapo-tofu/,…"). A fragment never reaches a server. */
export function listHash(keys) {
  return keys.length ? `#list=${keys.map(encodeURIComponent).join(',')}` : '';
}

/** The recipe keys in a "#list=…" fragment (at most `max`); [] for any other fragment. */
export function keysFromHash(hash, max = 200) {
  const m = /^#?list=(.+)$/.exec(String(hash ?? ''));
  if (!m) return [];
  const keys = m[1].split(',').map((k) => {
    try {
      return decodeURIComponent(k);
    } catch {
      return '';
    }
  });
  return [...new Set(keys.filter((k) => k && k.length <= 600))].slice(0, max);
}

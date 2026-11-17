// The search itself: one set of rules for the page (src/scripts/search.ts), the MCP server
// (src/mcp/search.mjs) and Ask (src/chat/chat.mjs), so all three find and rank the same way.
// Plain functions over the index scripts/build-index.mjs writes. No page, no network: `npm
// test` runs them (src/lib/search-core.test.mjs, src/lib/ranking.test.mjs).
//
//   prepare(index)            get the index ready to search, once (prepareSteps: a part at a time)
//   addVideos(ready, rows)    the video rows, when they come after the recipes (the page)
//   understand(ready, text)   plain phrases -> tags and filters ("no pork", "under 30 minutes")
//   queryWords(ready, text)   the words a search matches on, with typos fixed
//   search(ready, filters)    recipes, best first, creators taking turns
//   searchVideos(ready, f)    videos, best title match first, channels taking turns
//
// This file ships to the browser, so it stays small: no dependencies, no big tables.

// ---------------------------------------------------------------------------------------
// Words

// Spellings that mean the same thing, folded to one. Applied to every word in the index
// and every word typed, so "chilli" finds "chili" and "lasagne" finds "lasagna".
const EQUAL = {};
for (const group of [
  'chili chilli chile chilis chilies chillies chiles',
  'yogurt yoghurt yogurts yoghurts yogourt',
  'donut doughnut donuts doughnuts',
  'bbq barbecue barbeque barbecued barbequed',
  'jjigae jigae chigae jjigae',
  'tteokbokki ddukbokki topokki dukbokki tteokbokgi ddeokbokki teokbokki',
  'lasagna lasagne lasagnas',
  'bolognese bolognaise',
  'hummus houmous hummous humus',
  'omelet omelette omelets omelettes',
  'whiskey whisky',
  'gyoza gyozas',
  'szechuan sichuan szechwan',
  'wonton wontons wantan wuntun',
  'bokchoy pakchoi',
  'mapo mabo',
  'kimchi kimchee gimchi',
  'scallion scallions',
  'caesar cesar ceasar',
  'tumeric turmeric',
].map((g) => g.split(' ')))
  for (const w of group) EQUAL[w] = group[0];

// Plurals the rules below get wrong. "fries" stays itself: french fries aren't a stir fry.
const IRREGULAR = { fries: 'fries', leaves: 'leaf', loaves: 'loaf', halves: 'half', knives: 'knife', quiches: 'quiche', brioches: 'brioche', shoes: 'shoe' };

/** A word's singular: cookies and cookie -> cooky, pies -> pie, tomatoes -> tomato. Latin words only. */
export function stem(w) {
  if (w.length <= 3) return w;
  const irregular = IRREGULAR[w];
  if (irregular) return irregular;
  const last = w.charCodeAt(w.length - 1);
  if (last !== 115 && last !== 101) return w; // doesn't end in s or e
  if (/[^a-z0-9]/.test(w)) return w;
  if (w.endsWith('ie')) return w.length > 4 ? w.slice(0, -2) + 'y' : w;
  if (last !== 115 || /(ss|us|is)$/.test(w)) return w;
  if (w.endsWith('ies')) return w.length === 4 ? w.slice(0, -1) : w.slice(0, -3) + 'y';
  if (/(ches|shes|xes)$/.test(w) || (w.length > 4 && w.endsWith('oes'))) return w.slice(0, -2);
  return w.slice(0, -1);
}

// Split on anything that isn't a letter, a number or a mark (Thai vowels are marks).
const SPLIT = /[^\p{L}\p{N}\p{M}]+/u;
const PLAIN = /^[\x20-\x7e]*$/;
/** Lowercase, accents off, apostrophes gone: "Jalapeños & Kenji's" -> "jalapenos & kenjis". */
export const fold = (text) => {
  const s = String(text ?? '').toLowerCase();
  return (PLAIN.test(s) ? s : s.normalize('NFD').replace(/[̀-ͯ]/g, '')).replace(/[’'`]/g, '');
};
const norm = (w) => {
  const s = stem(EQUAL[w] || w);
  return EQUAL[s] || s;
};

/** "Scallions, chopped!" -> ["scallion", "chopped"]: lowercase, no accents, singular words, any script. */
export function words(text) {
  const out = [];
  for (const w of fold(text).split(SPLIT)) if (w) out.push(norm(w));
  return out;
}

/** Written in a script without spaces between words (Chinese, Japanese, Korean, Thai): matched as a piece of the name. */
const unspaced = (w) => /[^\u0000-ɏḀ-ỿ]/.test(w);

// Words that say nothing about the dish. Ignored when there are other words; a search made
// only of these keeps them ("easy dinner" looks for those words).
const STOP = new Set(
  (
    'a an the and or if of for to in on at my me i im ive we our us you your it its is are be that this these those there ' +
    'want wanna need make making made cook cooking cooked how what which can could should would will do does ' +
    'has have had got get give show find looking look like some any all anything everything something ' +
    'recipe recipes easy easiest simple best good great tasty yummy delicious perfect ultimate authentic classic traditional ' +
    'homemade home style version idea ideas dish dishes food meal meals tonight today please really very ' +
    'quick quickly fast speedy weeknight dinner dinners lunch supper with using without no not from by'
  )
    .split(' ')
    .map(norm),
);
export const isFiller = (w) => STOP.has(w);

// Asking for a sauce or a drink by name: then they aren't moved down the list.
const SAUCY = new Set(
  'sauce dip dressing vinaigrette paste marinade glaze drink cocktail smoothie juice tea coffee latte lemonade syrup stock broth seasoning oil pickle jam condiment salsa pesto chutney aioli mayo mayonnaise gravy relish rub'
    .split(' ')
    .map(norm),
);

// ---------------------------------------------------------------------------------------
// Getting the index ready

// Other names people use for a creator. `weak` ones are common words, recognised only
// after "from" or "by" ("lau lau" is a dish).
const CREATOR_ALIASES = {
  htk: ['pailin', 'pailins kitchen', 'pai'],
  kenji: ['kenji', 'kenji lopez alt', 'kenji lopez-alt'],
  rte: ['nagi', 'recipe tin', 'recipetin', 'recipe tin eats'],
  rtj: ['yumiko', 'recipe tin japan'],
  mwl: ['daddy lau', 'lau'],
  sk: ['smitten', 'deb perelman'],
  ccd: ['ccd'],
  ab: ['alton', 'good eats'],
  joc: ['joc', 'namiko', 'nami'],
  woks: ['woks', 'wol'],
  mala: ['mala market'],
  rhs: ['red house spice'],
};
const WEAK_ALIASES = new Set(['lau', 'pai', 'nami', 'wol']);

/** A name as people type it: lowercase, no accents, punctuation as spaces. Not made singular. */
const plain = (text) => fold(text).split(SPLIT).filter(Boolean).join(' ');

/**
 * Get the index ready to search, once: each recipe's words, each ingredient's names, the
 * creators (a site, a site and its YouTube channel, or a channel alone), the videos' words,
 * and every word the index knows (for fixing typos).
 */
export function prepare(index) {
  const steps = prepareSteps(index);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/**
 * prepare(), a part at a time: stops after every `every` recipes, so a page can let the
 * browser breathe in between instead of holding it for the whole index (a slow phone would
 * ignore taps for a quarter of a second). Run it to the end for what prepare() returns.
 */
export function* prepareSteps(index, every = Infinity) {
  // Things to leave out that aren't one ingredient ("dairy") sit after the real ingredients,
  // so a tag, an address and a `without` list can hold either kind.
  const groups = index.groups || [];
  const ing = [...index.ing, ...groups.map(([id, name, , ...others]) => [id, name, 0, [], ...others])];
  const real = index.ing.length;
  const ingNames = ing.map((g) => [g[1], ...g.slice(4)].map((n) => words(n).join(' ')));
  const ingUsed = ing.map(() => 0);
  const fresh = new Set(index.fresh || []);
  const vocab = new Map();
  const count = (w, n = 1) => vocab.set(w, (vocab.get(w) || 0) + n);

  const recipes = [];
  for (let i = 0; i < index.recipes.length; i++) {
    if (i && i % every === 0) yield i;
    const row = index.recipes[i];
    const [s, name, url, min, cuisine, pos, own, img, kw, opens = 0, course = '', added = '', flags = 0] = row;
    const src = index.sources[s];
    for (const p of pos) ingUsed[p]++;
    const title = words(name);
    // The name without its bracketed parts and filler: "Mapo Tofu (麻婆豆腐)" is "mapo tofu".
    const outside = name.includes('(') ? words(name.replace(/\([^)]*\)/g, ' ')) : title;
    const core = outside.filter((w) => !STOP.has(w));
    const other = [...new Set([...words(kw), ...words(cuisine)])];
    for (const w of new Set(title)) count(w);
    for (const w of other) if (!title.includes(w)) count(w);
    const text = fold(`${name} ${kw}`);
    recipes.push({
      i,
      src,
      name,
      url: url.startsWith('http') ? url : src.site + url,
      min,
      cuisine,
      course,
      isNew: fresh.has(i),
      added,
      pos: new Set(pos),
      own,
      img,
      hasPhoto: Boolean(img),
      key: `${src.id}:${url}`,
      opens,
      flags,
      title,
      // A how-to keeps all its words, so "How to Cook Dumplings" isn't just "dumplings".
      core: /^how to\b/i.test(name) || !core.length ? outside : core,
      phrase: ` ${title.filter((w) => !STOP.has(w)).join(' ')} `,
      other,
      // Only kept when the name has Chinese, Japanese, Korean or Thai in it.
      raw: unspaced(text) ? text : '',
      howTo: /^how to\b/i.test(name),
    });
  }
  // A site's own name finds its recipes too, a long way down the list.
  const srcWords = new Map(index.sources.map((s) => [s.id, words(s.name)]));
  // Ingredient names are words too ("scallion" finds recipes that use scallions).
  const ingWord = new Map();
  ingNames.forEach((names, p) => {
    if (!ingUsed[p]) return;
    for (const w of new Set(names.join(' ').split(' '))) {
      if (!w) continue;
      (ingWord.get(w) || ingWord.set(w, []).get(w)).push(p);
      count(w, ingUsed[p]);
    }
  });

  const creators = [];
  const creatorById = new Map();
  const pausedSite = new Map((index.paused || []).map((p) => [p.id, p.site]));
  const add = (id, name, site = '') => {
    let c = creatorById.get(id);
    if (!c) {
      const full = plain(name);
      const aliases = (CREATOR_ALIASES[id.replace(/-yt$/, '')] || []).map(plain);
      c = {
        id,
        name,
        site: site || pausedSite.get(id) || '',
        recipes: 0,
        videos: 0,
        words: words(name),
        aliases: aliases.map((a) => words(a)),
        // Every way to say who it is, as typed: the full name, the name without "the", then other names.
        names: [...new Set([full, full.replace(/^the /, ''), ...aliases])].filter((n) => n.length >= 3),
      };
      creatorById.set(id, c);
      creators.push(c);
    }
    return c;
  };
  for (const s of index.sources) add(s.id, s.name, s.site).recipes = s.count;
  for (const s of index.paused || []) add(s.id, s.name, s.site);
  const channelCreator = index.videos.sources.map((ch) => {
    const id = ch.site || ch.id;
    const c = add(id, ch.name);
    c.videos += ch.count;
    c.youtube = ch.channel;
    return id;
  });

  const ready = {
    index,
    ing,
    real,
    groups,
    ingNames,
    ingUsed,
    ingWord,
    srcWords,
    recipes,
    videos: [],
    // Creators with something to find; `everyone` also has paused sites with nothing here yet.
    creators: creators.filter((c) => c.recipes || c.videos),
    everyone: creators,
    creatorById,
    channelCreator,
    vocab,
    cache: new Map(),
    names: null,
  };
  addVideos(ready, index.videos.rows);
  return ready;
}

/**
 * The videos' words, once the index has its video rows. prepare() does this itself when
 * the rows are there; the page gets them in a second file after the recipes
 * (src/lib/index-format.mjs) and calls this when it lands. Until then a search finds
 * recipes only, and typo fixing goes by the recipes' words alone.
 */
export function addVideos(ready, rows) {
  if (ready.videos.length) return; // already here: their words are counted once
  const { vocab, channelCreator } = ready;
  ready.index.videos.rows = rows;
  ready.videos = rows.map((row, i) => {
    const title = words(row[1]);
    for (const w of new Set(title)) vocab.set(w, (vocab.get(w) || 0) + 1);
    const text = fold(row[1]);
    return { i, row, title, phrase: ` ${title.filter((w) => !STOP.has(w)).join(' ')} `, raw: unspaced(text) ? text : '', creator: channelCreator[row[0]], flags: row[6] || 0 };
  });
  // What was worked out without them (which spelling finds the most) is worked out again.
  ready.cache.clear();
}

// ---------------------------------------------------------------------------------------
// Naming things: ingredients, creators, cuisines

function nameMaps(ready) {
  if (ready.names) return ready.names;
  const main = new Map();
  const any = new Map();
  ready.ingNames.forEach((names, p) => {
    // Groups ("dairy") are only ever left out, never cooked with: found by groupFor().
    if (p >= ready.real || !ready.ingUsed[p]) return;
    if (!main.has(names[0])) main.set(names[0], p);
    for (const n of names) if (!any.has(n)) any.set(n, p);
  });
  const group = new Map();
  ready.groups.forEach((g, k) => {
    for (const n of ready.ingNames[ready.real + k]) group.set(n, ready.real + k);
  });
  return (ready.names = { main, any, group });
}

/**
 * The ingredient a phrase names exactly (any of its names, singular or plural), or null.
 * Its own name wins over another item's other name. With `mainName`, only its own name
 * counts: "cilantro" is filed under fresh herbs, and leaving out every herb isn't what was asked.
 */
export function ingredientFor(ready, phrase, mainName = false) {
  const want = words(phrase).join(' ');
  if (!want) return null;
  const { main, any } = nameMaps(ready);
  return main.get(want) ?? (mainName ? null : any.get(want) ?? null);
}

/** A thing to leave out that isn't one ingredient: "dairy", "nuts", "shellfish". */
export function groupFor(ready, phrase) {
  const want = words(phrase).join(' ');
  return (want && nameMaps(ready).group.get(want)) ?? null;
}

/**
 * The ingredients named anywhere in a phrase, longest names first, and the words left over:
 * "boneless chicken thighs rice" -> chicken thighs, rice; "boneless" left.
 */
export function ingredientsIn(ready, phrase, mainName = false) {
  const ws = fold(phrase).split(SPLIT).filter(Boolean);
  const found = [];
  const rest = [];
  for (let i = 0; i < ws.length; ) {
    let hit = null;
    for (let k = Math.min(4, ws.length - i); k >= 1 && hit == null; k--) {
      const p = ingredientFor(ready, ws.slice(i, i + k).join(' '), mainName);
      if (p != null) hit = [p, k];
    }
    if (hit) {
      if (!found.includes(hit[0])) found.push(hit[0]);
      i += hit[1];
    } else rest.push(ws[i++]);
  }
  return { found, rest: rest.join(' ') };
}

/** The creator a phrase names exactly: a full name, the name without "the", or another name for them. */
export function creatorFor(ready, phrase) {
  const want = plain(phrase);
  if (want.length < 3) return null;
  const c = ready.creatorById.get(String(phrase).trim()) ?? ready.creators.find((c) => c.names.includes(want));
  return c?.id ?? null;
}

/** Creators whose name (or another name for them) has every word typed; the last word can be unfinished. */
export function creatorMatches(ready, text, skip = new Set()) {
  const q = words(text);
  if (!q.length) return [];
  const has = (ws) => q.every((t, n) => ws.some((w) => w === t || (n === q.length - 1 && w.startsWith(t))));
  return ready.creators.filter((c) => !skip.has(c.id) && (has(c.words) || c.aliases.some(has)));
}

export function cuisineFor(ready, wanted) {
  const want = words(wanted).join(' ');
  const hit = want && ready.index.cuisines.find(([c]) => words(c).join(' ') === want);
  return hit ? hit[0] : null;
}

// ---------------------------------------------------------------------------------------
// The words a search matches on

/** Edit distance, giving up past `max` (letters swapped count as one edit). */
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

const shared = (a, b) => {
  let n = 0;
  while (n < a.length && a[n] === b[n]) n++;
  return n;
};

/**
 * Words the index knows that are close enough to be what was meant, most likely first:
 * fewest edits, then the longest shared start ("kimchee" is kimchi, not kitchen), then the
 * most common. A word only one recipe has is as likely a typo itself, so it isn't offered.
 */
export function closeWords(ready, w, { min = 2, real = false } = {}) {
  if (w.length < (real ? 3 : 4) || /\d/.test(w) || unspaced(w)) return [];
  const max = w.length >= 7 ? 2 : 1;
  const found = [];
  for (const [v, n] of ready.vocab) {
    if (v.length < 3 || n < min || v === w) continue;
    const d = distance(w, v, max);
    if (d <= max) found.push({ v, d, n, s: shared(w, v) });
  }
  return found.sort((a, b) => a.d - b.d || Math.min(b.s, 3) - Math.min(a.s, 3) || b.s - a.s || b.n - a.n).slice(0, 6).map((x) => x.v);
}

/** How a query word is matched: as a whole word, or also as the start of one (still being typed). */
const term = (ready, w, prefix = false) => ({ w, prefix: prefix && w.length > 1, raw: unspaced(w), ing: ready.ingWord.get(w) || null });

/** How many recipes and videos have every one of these words (in the name only, with `titles`). */
function countAll(ready, ws, titles = false) {
  const ts = ws.map((w) => term(ready, w));
  let n = 0;
  for (const r of ready.recipes) if (ts.every((t) => wordScore(ready, r, t, titles) > 0)) n++;
  for (const v of ready.videos) if (ts.every((t) => v.title.includes(t.w) || (t.raw && v.raw.includes(t.w)))) n++;
  return n;
}

/**
 * The words a search matches on, from what was typed.
 * - Filler ("easy", "recipe", "how to make") is ignored, unless that's all there is.
 * - A word the index has never seen is swapped for the closest one it has ("dumpligns" ->
 *   "dumpling"), two words are joined or one split when that's what the index calls it
 *   ("pot sticker" -> "potsticker", "stirfry" -> "stir fry"), and when a search with several
 *   words finds almost nothing, a real word that's one letter off is tried ("pad tai" ->
 *   "pad thai"). A fix is only kept if it finds something. `exact` turns all of it off.
 * - While typing (`typing`), the last word can be the start of a word. After Enter, words are
 *   whole words, unless a word is nothing but the start of some ("dumpl").
 * - A word nothing here has is dropped when other words or tags (`lenient`) carry the search,
 *   and listed in `ignored`; when it's all there is, the search finds nothing.
 * Returns { words, terms, fixes: [typed, used][], ignored: string[], none: bool }.
 */
export function queryWords(ready, text, { exact = false, typing = false, lenient = false } = {}) {
  const key = `${exact ? 1 : 0}${typing ? 1 : 0}${lenient ? 1 : 0}|${text}`;
  const hit = ready.cache.get(key);
  if (hit) return hit;
  const all = words(text);
  const kept = all.filter((w) => !STOP.has(w));
  let ws = kept.length ? kept : all;
  const fixes = [];
  const ignored = [];
  const prefixed = new Set();
  const { vocab } = ready;
  const known = (w) => vocab.has(w) || unspaced(w);
  const starts = (w) => {
    for (const v of vocab.keys()) if (v.startsWith(w)) return true;
    return false;
  };

  if (!exact && vocab.size && ws.length) {
    // 1. Two or three words the index writes as one: "pot sticker", "bi bim bap".
    if (!typing) {
      for (let size = 3; size >= 2; size--) {
        for (let i = 0; i + size <= ws.length; i++) {
          const joined = ws.slice(i, i + size).join('');
          if (!vocab.has(joined)) continue;
          const next = [...ws.slice(0, i), joined, ...ws.slice(i + size)];
          if (countAll(ready, next) > 2 * countAll(ready, ws)) {
            fixes.push([ws.slice(i, i + size).join(' '), joined]);
            ws = next;
          }
        }
      }
    }
    // 2. Words the index doesn't know: the start of a word, one word that should be two
    // ("stirfry"), or a typo. A word only a title or two has gets the two-word check as well.
    const typed = ws;
    const out = [];
    const made = [];
    ws.forEach((w, n) => {
      const last = n === ws.length - 1;
      const rare = known(w) && !unspaced(w) && (vocab.get(w) || 0) < 3;
      if (known(w) && !rare) return void out.push(w);
      if (!rare) {
        if (typing && last) {
          if (starts(w)) return void out.push(w);
        } else if (w.length >= 3 && starts(w)) {
          prefixed.add(w);
          return void out.push(w);
        }
      }
      const others = ws.filter((_, k) => k !== n).filter(known);
      const options = [];
      if (!typing || !last) {
        for (let cut = 2; cut <= w.length - 2; cut++) {
          const [a, b] = [norm(w.slice(0, cut)), w.slice(cut)];
          if (vocab.has(a) && vocab.has(b) && a.length + b.length >= 6) options.push([a, b]);
        }
      }
      if (!rare) for (const v of closeWords(ready, w)) options.push([v]);
      let best = null;
      let bestN = rare ? 2 * countAll(ready, [...others, w]) + 2 : 0;
      for (const o of options) {
        const c = countAll(ready, [...others, ...o]);
        if (c > bestN) [best, bestN] = [o, c];
      }
      if (best) {
        made.push([w, best.join(' ')]);
        out.push(...best);
      } else out.push(w);
    });
    ws = out;

    // 3. Words nothing has are dropped when something else carries the search: a word that
    // was right as typed, or a tag. With nothing to lean on, guesses are taken back too
    // ("xyzzy plugh" finds nothing, not whatever is nearest to "plugh").
    const unknown = ws.filter((w) => !known(w) && !prefixed.has(w) && !(typing && w === ws.at(-1)));
    if (unknown.length) {
      const trusted = typed.some((w) => known(w) && ws.includes(w));
      if (lenient || trusted) {
        ignored.push(...unknown);
        ws = ws.filter((w) => !unknown.includes(w));
        fixes.push(...made);
      } else ws = typed;
    } else fixes.push(...made);

    // 4. Real words, one letter off, when the search finds almost nothing: "pad tai".
    if (!typing && ws.length > 1) {
      const now = countAll(ready, ws);
      if (now < 3) {
        let best = null;
        let bestN = 0;
        ws.forEach((w, n) => {
          if (prefixed.has(w)) return;
          for (const v of closeWords(ready, w, { min: 5, real: true })) {
            const next = ws.map((x, k) => (k === n ? v : x));
            const c = countAll(ready, next, true);
            if (c > bestN) [best, bestN] = [[w, v, next], c];
          }
        });
        if (best && bestN >= 3 && bestN >= 4 * now + 3) {
          fixes.push([best[0], best[1]]);
          ws = best[2];
        }
      }
    }
  }

  const result = {
    words: ws,
    terms: ws.map((w, n) => term(ready, w, prefixed.has(w) || (typing && n === ws.length - 1))),
    fixes,
    ignored,
    // Something was typed, but nothing in it is a word ("!!!"): that finds nothing, not everything.
    none: !ws.length && !ignored.length && String(text).trim() !== '',
  };
  if (ready.cache.size > 300) ready.cache.clear();
  ready.cache.set(key, result);
  return result;
}

// ---------------------------------------------------------------------------------------
// Understanding a sentence: on Enter, plain phrases become tags and filters you can see and
// remove: "under 30 minutes", "quick", "with tofu and eggs", "no pork", "dairy free",
// "vegetarian", "from Maangchi", "thai food", "desserts", "videos".

// Said with a dish or on their own, these are a course. [words, course id, only when alone]
const COURSE_WORDS = [
  ['desserts?|sweets', 'dessert', false],
  ['appeti[sz]ers?|starters?', 'starter', false],
  ['side dish(?:es)?|sides', 'side', false],
  ['main (?:course|dish)(?:es)?|mains', 'main', false],
  ['snacks?', 'starter', true],
  ['breakfasts?|brunch', 'breakfast', true],
  ['drinks?|beverages?', 'drink', true],
];
const COURSE_ANY = COURSE_WORDS.map(([re]) => re).join('|');
const LEAD = /^\s*(?:i\s+have|ive\s+got|i\s+ve\s+got|i\s+got|we\s+have|weve\s+got|we\s+got|ive|theres|there\s+is|using|with|have|got)\s+/;
const EXTRA = /^(?:some|leftover|leftovers|fresh|a|an|the|my|few|lots of|a bit of|a little|\d+)\s+/;

const blankUnderstood = (q = '') => ({ q, time: 0, with: [], without: [], notWords: [], sites: [], diet: '', cuisine: '', course: '', show: '' });

/**
 * What a typed sentence asks for. `list` says the box is already being used as an ingredient
 * list (a comma just made a tag), so bare ingredient names carry on the list.
 */
export function understand(ready, text, { list = false } = {}) {
  const out = blankUnderstood();
  const { index } = ready;
  // Lowercase, no accents or apostrophes, hyphens as spaces ("pork-free", "López-Alt").
  let t = ` ${fold(text).replace(/[-‐-―]/g, ' ').replace(/\s+/g, ' ')} `;
  const cut = (re) => (t = t.replace(re, ' '));
  const took = () => out.time || out.with.length || out.without.length || out.notWords.length || out.sites.length || out.diet || out.cuisine || out.course || out.show;

  // "videos": show only those.
  if (/\bvideos?\b/.test(t)) {
    out.show = 'videos';
    cut(/\b(?:youtube\s+)?videos?\b/g);
  }

  // Time: "under 30 minutes", "in 20 min", "1 hour", "30-minute"; or just "quick". A small
  // number with no "under" or "in" is part of a dish's name ("7 minute eggs").
  const time = t.match(/\b(under|less than|in|within|at most|max|no more than|up to)?\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/);
  if (time) {
    const n = Number(time[2]) * (/^h/.test(time[3]) ? 60 : 1);
    if (n > 0 && n <= 600 && (time[1] || n >= 10)) {
      out.time = Math.round(n);
      t = t.replace(time[0], ' ');
    }
  }
  if (!out.time && /\b(quick|quickly|fast|speedy)\b/.test(t)) out.time = 30;

  // Diet.
  if (/\b(vegan|plant\s+based)\b/.test(t)) out.diet = 'vegan';
  else if (/\b(vegetarian|veggie|meatless|meat\s+free)\b/.test(t)) out.diet = 'vegetarian';
  cut(/\b(vegan|plant\s+based|vegetarian|veggie|meatless|meat\s+free)\b/g);

  // Creators, before cuisines ("chinese cooking demystified" is a channel): a name anywhere,
  // with or without "from" ("kenji fried rice", "from maangchi"), longest names first.
  const named = ready.creators.flatMap((c) => c.names.map((n) => [n, c.id])).sort((a, b) => b[0].length - a[0].length);
  for (const [name, id] of named) {
    if (out.sites.includes(id)) continue;
    const body = name
      .split(' ')
      .map((w) => (w.endsWith('s') ? `${w}?` : `${w}s?`))
      .join('\\s+');
    const re = new RegExp(`\\b(?:from|by)\\s+${body}\\b|${WEAK_ALIASES.has(name) ? '(?!)' : `\\b${body}\\b`}`);
    if (re.test(t)) {
      out.sites.push(id);
      t = t.replace(re, ' ');
    }
  }

  // "No-bake cookies" and friends are dishes, not leaving something out.
  t = t.replace(/\bno (bake|knead|churn|cook|boil|fail|fuss|yeast)\b/g, 'no$1');

  // Leave out: "no pork", "without peanuts or shrimp", "hold the cilantro". "Not" only counts
  // before an ingredient ("not your average chili" is a dish).
  const leaveOut = (piece, loose) => {
    const p0 = piece.trim().replace(EXTRA, '');
    const first = p0.split(' ')[0] || '';
    // "no meat" means vegetarian; there's no single "meat" ingredient to leave out.
    if (/^meats?$/.test(first)) return (out.diet ||= 'vegetarian'), p0.split(' ').slice(1).join(' ');
    const ws = p0.split(' ');
    for (let k = Math.min(3, ws.length); k >= 1; k--) {
      const phrase = ws.slice(0, k).join(' ');
      // A group ("dairy", "nuts") first, then an ingredient by its own name: "cilantro" is
      // filed under fresh herbs, and leaving out every herb isn't what was asked.
      const p = groupFor(ready, phrase) ?? ingredientFor(ready, phrase, true);
      if (p != null) {
        if (!out.without.includes(p)) out.without.push(p);
        return ws.slice(k).join(' ');
      }
    }
    if (!loose) return null;
    // Not an ingredient by that name: leave out recipes with the word in their name.
    if (first && !STOP.has(norm(first))) out.notWords.push(first);
    return ws.slice(1).join(' ');
  };
  const stop = String.raw`(?=\s*(?:,|\bwith\b|\busing\b|\bunder\b|\bin\b|\bfor\b|\bfrom\b|$))`;
  t = t.replace(new RegExp(String.raw`\b(without|no|minus|skip|hold the|not)\s+([a-z][a-z ]*?(?:\s*(?:,|and|or)\s*[a-z][a-z ]*?)*)` + stop, 'g'), (all, how, items) => {
    let kept = '';
    for (const piece of items.split(/\s*(?:,|\band\b|\bor\b)\s*/)) {
      const rest = leaveOut(piece, how !== 'not');
      if (rest == null) return all;
      kept += ` ${rest}`;
    }
    return ` ${kept} `;
  });
  t = t.replace(/\b([a-z]+)\s+free\b/g, (all, w) => {
    const p = groupFor(ready, w) ?? ingredientFor(ready, w, true);
    if (p == null) return all;
    if (!out.without.includes(p)) out.without.push(p);
    return ' ';
  });

  // Cuisines, only when said as one: "thai food", "korean recipes", "mexican dinner", "thai
  // desserts". A bare "thai" stays a word, since it also finds dishes filed under another cuisine.
  const cuisines = index.cuisines.map(([c]) => [plain(c), c]).sort((a, b) => b[0].length - a[0].length);
  for (const [name, c] of cuisines) {
    const re = new RegExp(`\\b${name.replace(/ /g, '\\s+')}(?:\\s+(?:food|foods|cuisine|recipes?|dish(?:es)?|cooking|dinners?|meals?|lunch(?:es)?|ideas?)\\b|(?=\\s+(?:${COURSE_ANY})\\b))`);
    if (re.test(t)) {
      out.cuisine = c;
      t = t.replace(re, ' ');
      break;
    }
  }

  // Ingredients: "with tofu and eggs", "using leftover rice", "i have chicken, kale". After a
  // dish ("pasta with tomato sauce") only an ingredient's own name or a one-word name counts,
  // so a phrase that's another item's other name stays words.
  t = t.replace(/^(\s*)(?:i\s+have|ive\s+got|i\s+ve\s+got|i\s+got|we\s+have|weve\s+got|we\s+got)\b/, '$1have');
  t = t.replace(/\b(with|using|have|got)\s+([a-z0-9][a-z0-9 ,&]*?)(?=\s*(?:\bunder\b|\bin\b|\bfor\b|$))/g, (all, how, items, at) => {
    const dish = how === 'with' && words(t.slice(0, at)).some((w) => !STOP.has(w));
    let kept = '';
    let any = false;
    for (const piece of items.split(/\s*(?:,|\band\b|\bor\b|&)\s*/)) {
      const clean = piece.trim().replace(EXTRA, '');
      let found = [];
      let rest = '';
      if (dish) {
        const p = ingredientFor(ready, clean, true) ?? (clean.includes(' ') ? null : ingredientFor(ready, clean));
        if (p == null) rest = piece;
        else found = [p];
      } else ({ found, rest } = ingredientsIn(ready, clean));
      for (const p of found) {
        any = true;
        if (!out.with.includes(p)) out.with.push(p);
      }
      kept += ` ${rest}`;
    }
    // "have a cold": nothing in it is an ingredient, so the words stay as they were.
    return any ? ` ${kept} ` : all;
  });

  // A list: "eggplant, tofu, scallions" (or, once the box is a list, just "tofu and scallions").
  if (t.includes(',') || list) {
    const pieces = t.split(',').flatMap((piece, n, arr) => (n === arr.length - 1 || list ? piece.split(/\s+(?:and|or)\s+|\s*&\s*/) : [piece]));
    const kept = [];
    for (const piece of pieces) {
      const p = ingredientFor(ready, piece.replace(LEAD, '').replace(EXTRA, ''));
      if (p == null) kept.push(piece);
      else if (!out.with.includes(p)) out.with.push(p);
    }
    t = ` ${kept.join(' ')} `;
  }
  t = t.replace(/,/g, ' ');

  t = t.replace(/\bno(bake|knead|churn|cook|boil|fail|fuss|yeast)\b/g, 'no $1').replace(/\s+/g, ' ').trim();
  const content = () => words(t).filter((w) => !STOP.has(w));

  // Courses: "desserts", "thai side dishes", "chocolate dessert"; "breakfast" only on its own
  // ("breakfast burrito" is a dish).
  if ((index.courses || []).length) {
    for (const [re, id, alone] of COURSE_WORDS) {
      const m = t.match(new RegExp(`\\b(?:${re})\\b`));
      if (!m || !index.courses.some(([c]) => c === id)) continue;
      const rest = t.replace(m[0], ' ');
      if (alone && words(rest).some((w) => !STOP.has(w))) continue;
      out.course = id;
      t = rest.replace(/\s+/g, ' ').trim();
      break;
    }
  }

  // A cuisine's name is all that's left, next to other tags: "vegetarian thai", "quick korean".
  if (!out.cuisine && took()) {
    const left = content().join(' ');
    const c = left && index.cuisines.find(([c]) => words(c).join(' ') === left);
    if (c) {
      out.cuisine = c[0];
      t = '';
    }
  }

  // What's left are the words to search. Filler at either end goes ("i", "something", "for");
  // if filler is all that's left it goes too, unless nothing else was understood: then the
  // words stay as typed ("easy dinner" searches for those words).
  if (took()) {
    const ws = t.split(' ').filter(Boolean);
    while (ws.length && STOP.has(norm(ws[0]))) ws.shift();
    while (ws.length && STOP.has(norm(ws.at(-1)))) ws.pop();
    t = ws.join(' ');
  }
  out.q = t;
  return out;
}

// A question or a request in a sentence ("what can I make with fish and kimchi", "something
// quick and vegetarian for dinner"), not a dish name ("red braised pork belly"). Only used
// when Ask is on. Words that start plenty of dish names too ("my mom's chicken soup", "i
// have…") only count in a longer sentence that reads like one, so a dish name isn't sent to
// Ask by accident.
const ASK_START = /^(what|whats|what's|how|which|can|could|should|give|suggest|recommend|show|make|anything|something)\b/;
const ASK_WEAK = /^(any|help|need|i|i'm|im|i've|ive|we|my|ideas?|got|have|only|more|less)\b/;
const ASK_WORDS = /\b(i|me|my|we|our|have|got|make|cook|using|use up|leftover|leftovers|something|anything|tonight|for dinner|for lunch|that|without|but not|go with|goes with)\b/;
export function looksLikeAsk(text) {
  const t = String(text).trim().toLowerCase();
  const n = t.split(/\s+/).filter(Boolean).length;
  if (n < 3) return false;
  if (t.includes('?') || ASK_START.test(t)) return true;
  return n >= 5 && (ASK_WEAK.test(t) || ASK_WORDS.test(t));
}

// ---------------------------------------------------------------------------------------
// Searching

/** How well one query word matches a recipe: its name (8), a bracketed part of it or the start of a word (6), keywords and cuisine (3), an ingredient's name (2), its site's name (1), or 0. */
function wordScore(ready, r, t, titles = false) {
  const { w } = t;
  if (r.title.includes(w)) return r.core.includes(w) ? 8 : 6;
  if (t.raw) return r.raw && r.raw.includes(w) ? 8 : 0;
  if (t.prefix && r.title.some((x) => x.startsWith(w))) return 6;
  if (titles) return 0;
  if (r.other.includes(w) || (t.prefix && r.other.some((x) => x.startsWith(w)))) return 3;
  // Ingredient names match as whole words only: "gin" isn't ginger, "pea" isn't peanut.
  if (t.ing) for (const p of t.ing) if (r.pos.has(p)) return 2;
  return ready.srcWords.get(r.src.id)?.includes(w) ? 1 : 0;
}

/**
 * How well a recipe matches the query words; 0 means it doesn't. On top of each word's
 * score: the words in order in the name (+10, or +5 inside brackets), how much of the name
 * they cover (up to +6, so "Mapo Tofu" beats "Spicy Mapo Tofu Noodle Soup with Pork"), and
 * the name being exactly the words (+6). `named` says whether any word was in the name.
 */
function textScore(ready, r, terms, loose = false) {
  if (!terms.length) return { score: 1, named: false, whole: false };
  let score = 0;
  let missed = 0;
  let misses = 0;
  let named = 0;
  let inCore = 0;
  for (const t of terms) {
    const s = wordScore(ready, r, t);
    if (s >= 6) {
      named++;
      if (s === 8 && !t.raw) inCore++;
    }
    if (s) score += s;
    else if (!loose) return null;
    // Missing a rare word costs more than missing a common one: it's the one that names the dish.
    else {
      misses++;
      missed += 100 + Math.round(50 / Math.log2(2 + (ready.vocab.get(t.w) || 0)));
    }
  }
  // Loose: when nothing has every word, keep what has most of them, ranked by how many.
  if (misses && (misses === terms.length || misses > Math.floor(terms.length / 2))) return null;
  let whole = false;
  if (named) {
    if (terms.length > 1) {
      const said = ` ${terms.map((t) => t.w).join(' ')}`;
      const end = terms.at(-1).prefix ? '' : ' ';
      if (` ${r.core.join(' ')} `.includes(said + end)) score += 10;
      else if (r.phrase.includes(said + end)) score += 5;
    }
    score += (6 * inCore) / Math.max(r.core.length, inCore);
    whole = inCore === terms.length && r.core.length === inCore;
    if (whole) score += 6;
  }
  return { score: score - missed, named: named > 0, whole };
}

/** Whether an ingredient you're using covers a recipe's ingredient: pork covers pork belly. */
export function covers(ready, chosen, p) {
  return chosen.includes(p) || ready.ing[p][3].some((parent) => chosen.includes(parent));
}

/**
 * What a search leaves out, from its "no pork" tags and its diet: ingredient positions, and
 * the flags scripts/diet.mjs gave each recipe (which also cover its name and the ingredient
 * lines the catalog didn't match).
 */
function leftOut(ready, f) {
  const pos = new Set();
  let mask = 0;
  for (const p of f.without || []) {
    if (p >= ready.real) mask |= ready.groups[p - ready.real][2];
    else pos.add(p);
  }
  if (f.diet === 'vegetarian' || f.diet === 'vegan') {
    for (const p of ready.index.diet?.[f.diet] || []) pos.add(p);
    mask |= f.diet === 'vegan' ? 31 : 3;
  }
  return { pos, mask, any: pos.size > 0 || mask > 0 };
}

const hasAny = (set, small) => {
  for (const p of small) if (set.has(p)) return true;
  return false;
};

/**
 * Recipes people open more rank a little higher: up to 4 points, on a log scale, so a
 * popular recipe beats an equally good match but never a clearly better one (a word in the
 * name is worth 6 to 8). A recipe that only matched by a keyword or an ingredient gets at
 * most 1, so popularity can't lift it over a recipe that has the word in its name.
 */
const popBonus = (r, named) => Math.min(named ? 4 : 1, Math.log2(1 + r.opens));

const sitesOf = (f) => (f.sites instanceof Set ? f.sites : new Set(f.sites || []));
/** Whether tags or filters carry the search, so a word nothing has can be dropped instead of finding nothing. */
const carried = (f, chosen) => chosen.length > 0 || sitesOf(f).size > 0 || !!f.cuisine || !!f.course || !!f.fresh;

/** The words a search will match on, given everything else it asks for (see queryWords). */
export function queryFor(ready, f, opts = {}) {
  return queryWords(ready, opts.q ?? f.q ?? '', { exact: f.exact, typing: opts.typing, lenient: carried(f, opts.with ?? f.with ?? []) });
}

/**
 * Search the recipes. `f` is what's being asked for (the page's state, or the MCP server's
 * arguments turned into one):
 *   q         words, as typed          with      ingredient positions to cook with
 *   without   positions to leave out   notWords  words to leave out by name
 *   sites     creator ids              time      most minutes
 *   cuisine, course, fresh (new this week), diet ('vegetarian' | 'vegan'), exact (no typo fixing)
 * `opts`: q and with override f's; skip leaves one filter off ('site', 'time', 'cuisine',
 * 'course'), for counting; loose keeps recipes with most of the words; typing lets the last
 * word be unfinished; count returns just how many.
 *
 * Order: with dish words, the best word match first (then more of your ingredients, then
 * fewer other things to buy). With two or more ingredients and no words, the most of your
 * ingredients, then the fewest others. With one ingredient or only filters, what people open
 * most. Sauces, drinks and "How to…" pages sit lower unless that's what was asked for.
 * Ties go to a photo, then popularity, then the name. Creators take turns among close calls.
 */
export function search(ready, f, opts = {}) {
  const text = opts.q ?? f.q ?? '';
  const chosen = opts.with ?? f.with ?? [];
  const sites = sitesOf(f);
  const Q = queryFor(ready, f, opts);
  if (Q.none) return opts.count ? 0 : [];
  const terms = Q.terms;
  const out = leftOut(ready, f);
  const notWords = (f.notWords || []).map((w) => words(w)[0]).filter(Boolean);
  const { skip } = opts;
  // Asked for a sauce, a drink or a how-to: then those aren't moved down.
  const saucy = !!f.course || terms.some((t) => SAUCY.has(t.w));
  const howTo = /\bhow to\b/i.test(text);
  const one = chosen.length === 1 ? words(ready.ing[chosen[0]][1]) : null;
  const hits = [];
  let n = 0;
  for (const r of ready.recipes) {
    if (skip !== 'site' && sites.size && !sites.has(r.src.id)) continue;
    if (skip !== 'time' && f.time && (r.min == null || r.min > f.time)) continue;
    if (skip !== 'cuisine' && f.cuisine && r.cuisine !== f.cuisine) continue;
    if (skip !== 'course' && f.course && r.course !== f.course) continue;
    if (f.fresh && !r.isNew) continue;
    if (out.any && (r.flags & out.mask || (out.pos.size && hasAny(r.pos, out.pos)))) continue;
    if (notWords.length && notWords.some((w) => r.title.includes(w))) continue;
    const t = textScore(ready, r, terms, opts.loose);
    if (!t) continue;
    let used = [];
    let missing = 0;
    if (chosen.length) {
      used = chosen.filter((p) => r.pos.has(p));
      if (!used.length) continue;
      if (!opts.count) missing = r.own.filter((p) => !covers(ready, chosen, p)).length;
    }
    n++;
    if (opts.count) continue;
    let score = t.score + popBonus(r, t.named || !terms.length);
    if (!saucy && !t.whole && (r.course === 'sauce' || r.course === 'drink')) score -= 4;
    if (r.howTo) score += howTo ? 3 : -3;
    // One ingredient: a dish named for it ("Fried Rice" for rice) is more likely what's wanted.
    // With no words to go on, a main dish is the likelier want ("Chicken Fried Rice" over "Basmati Rice").
    if (!terms.length) {
      if (one && one.every((w) => r.title.includes(w))) score += 3;
      // ...and one thing on its own ("Steamed Rice") is how to cook it, not a dish to make with it.
      if (one && r.own.length <= 2) score -= 3;
      if (r.course === 'main' && !f.course) score += 1;
    }
    hits.push({ r, score, used, missing });
  }
  if (opts.count) return n;
  const byUse = !terms.length && chosen.length > 1;
  const tail = (a, b) => Number(b.r.hasPhoto) - Number(a.r.hasPhoto) || b.r.opens - a.r.opens || (a.r.name < b.r.name ? -1 : a.r.name > b.r.name ? 1 : 0);
  hits.sort(
    byUse
      ? (a, b) => b.used.length - a.used.length || a.missing - b.missing || b.score - a.score || tail(a, b)
      : terms.length
        ? (a, b) => b.score - a.score || b.used.length - a.used.length || a.missing - b.missing || tail(a, b)
        : (a, b) => b.score - a.score || tail(a, b),
  );
  return opts.mix === false ? hits : mix(hits, byUse, (h) => h.r.src.id, opts.top);
}

/**
 * Take turns between creators. Within each tier (same number of your ingredients used),
 * the next pick is the best one that's nearly as good as the best one left (within a couple
 * of points, or needing at most one more ingredient) whose creator hasn't appeared in the
 * last three picks. Close calls get mixed; a clearly better match still comes first.
 * `top` stops the mixing once that many are picked (the rest follow in order).
 */
function mix(hits, byUse, who, top = Infinity) {
  const out = [];
  const BAND = 2;
  const tierOf = (h) => (byUse ? h.used.length : 0);
  for (let i = 0; i < hits.length; ) {
    let j = i;
    while (j < hits.length && tierOf(hits[j]) === tierOf(hits[i])) j++;
    if (out.length >= top) {
      for (let k = i; k < hits.length; k++) out.push(hits[k]);
      break;
    }
    const pool = hits.slice(i, j);
    const recent = [];
    while (pool.length) {
      if (out.length >= top) {
        for (const h of pool) out.push(h);
        break;
      }
      const first = pool[0];
      const close = (h) => (byUse ? h.missing <= first.missing + 1 : h.score >= first.score - BAND);
      let pick = 0;
      for (let k = 0; k < Math.min(pool.length, 300) && close(pool[k]); k++) {
        if (!recent.includes(who(pool[k]))) {
          pick = k;
          break;
        }
      }
      const [h] = pool.splice(pick, 1);
      out.push(h);
      recent.push(who(h));
      if (recent.length > 3) recent.shift();
    }
    i = j;
  }
  return out;
}

/**
 * Videos for the search, as index rows. They come along when there are words or a creator;
 * ingredients alone bring them only when videos are asked for (`f.show === 'videos'`).
 * Words must all be in the title (never the channel's name: a creator is a tag). Best title
 * match first, newest first among equals, channels taking turns.
 *
 * Videos carry less than recipes, and the search is honest about it: one is left out when
 * its title names something you're leaving out, or meat or fish on a vegetarian search; a
 * cuisine keeps only channels that cook that cuisine and titles that name it; and a time
 * limit or "new this week" shows none, since a video has neither.
 */
export function searchVideos(ready, f, opts = {}) {
  const text = opts.q ?? f.q ?? '';
  const sites = opts.skip === 'site' ? new Set() : sitesOf(f);
  const chosen = f.with || [];
  if (f.fresh || f.time) return [];
  const Q = queryFor(ready, f, opts);
  const terms = Q.terms;
  if (Q.none || (!terms.length && !sites.size && !(f.show === 'videos' && (chosen.length || f.cuisine || f.course)))) return [];
  const out = leftOut(ready, f);
  const notWords = (f.notWords || []).map((w) => words(w)[0]).filter(Boolean);
  // Titles that name an ingredient being left out: "no pork" drops "Crispy Pork Belly".
  const named = (f.without || []).filter((p) => p < ready.real).flatMap((p) => ready.ingNames[p].map((n) => ` ${n} `));
  const cuisine = f.cuisine ? words(f.cuisine) : null;
  const channels = ready.index.videos.sources;
  const said = terms.length > 1 ? ` ${terms.map((t) => t.w).join(' ')}` : '';
  const hits = [];
  for (const v of ready.videos) {
    const row = v.row;
    if (sites.size && !sites.has(v.creator)) continue;
    if (f.course && opts.skip !== 'course' && row[5] !== f.course) continue;
    if (cuisine && opts.skip !== 'cuisine' && channels[row[0]].cuisine !== f.cuisine && !cuisine.every((w) => v.title.includes(w))) continue;
    if (out.any && (v.flags & out.mask || (out.pos.size && hasAny(out.pos, row[4])))) continue;
    if (named.length && named.some((n) => ` ${v.title.join(' ')} `.includes(n))) continue;
    if (notWords.length && notWords.some((w) => v.title.includes(w))) continue;
    let score = 0;
    if (terms.length) {
      let ok = true;
      for (const t of terms) {
        if (v.title.includes(t.w) || (t.raw && v.raw.includes(t.w))) score += 8;
        else if (t.prefix && v.title.some((x) => x.startsWith(t.w))) score += 6;
        else {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (said && v.phrase.includes(said + (terms.at(-1).prefix ? '' : ' '))) score += 10;
      score += (6 * terms.length) / Math.max(v.title.length, terms.length);
    } else if (chosen.length && !row[4].some((p) => chosen.includes(p))) continue;
    hits.push({ v, score, used: [], missing: 0 });
  }
  hits.sort((a, b) => b.score - a.score || (a.v.row[3] < b.v.row[3] ? 1 : a.v.row[3] > b.v.row[3] ? -1 : 0));
  return mix(hits, false, (h) => h.v.row[0], opts.top).map((h) => h.v.row);
}

export { blankUnderstood };

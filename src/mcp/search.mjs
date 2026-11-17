// The answers behind the MCP tools (src/pages/mcp.ts), Ask (src/chat/chat.mjs) and the
// list endpoint (src/pages/api/with.ts): plain functions over the same index the search
// page loads (public/index.json, from scripts/build-index.mjs). No network and no MCP here,
// so `npm test` can run them.
//
// The search itself is src/lib/search-core.mjs, the same code the page runs: the same words,
// typo fixing, ranking, diet rules and videos. This file turns an assistant's arguments into
// a search, and the hits into an answer that says what it understood and what it left out.
import {
  covers,
  creatorFor as creatorIdFor,
  cuisineFor as coreCuisineFor,
  fold,
  groupFor,
  ingredientFor as coreIngredientFor,
  ingredientsIn,
  closeWords,
  prepare as corePrepare,
  queryFor,
  search,
  searchVideos,
  understand,
  words,
} from '../lib/search-core.mjs';

import { sortHits } from '../lib/page-state.mjs';

export { words };
export const SITE = 'https://findish.now/';

/** ["a, b", "c"] or "a, b; c" -> ["a", "b", "c"]: assistants send lists both ways. */
const list = (v) =>
  (Array.isArray(v) ? v : v ? [v] : [])
    .flatMap((s) => String(s).split(/[,;\n]/))
    .map((s) => s.trim())
    .filter(Boolean);

/** Get the index ready to search, once (see prepare in src/lib/search-core.mjs). */
export function prepare(index) {
  const ready = corePrepare(index);
  // By id, for the callers that list creators (list_sources) or look one up.
  ready.creatorMap = new Map(ready.creators.map((c) => [c.id, c]));
  return ready;
}

/** The ingredient a phrase names exactly (any of its names, singular or plural), or null. */
export function ingredientFor(ready, phrase) {
  return coreIngredientFor(ready, phrase);
}

/**
 * The ingredient a looser phrase means: "2 eggs", "a head of broccoli", "boneless skinless
 * chicken thighs" (the longest name inside it, the last one when there are several), or a
 * misspelt one ("brocoli"). Returns { p, fixed } or null.
 */
function ingredientNear(ready, phrase) {
  const exact = coreIngredientFor(ready, phrase);
  if (exact != null) return { p: exact };
  const { found } = ingredientsIn(ready, phrase);
  if (found.length) {
    // The longest name wins; among equals the last, which is usually the thing itself.
    const best = found.reduce((a, b) => (ready.ingNames[b][0].length >= ready.ingNames[a][0].length ? b : a));
    return { p: best };
  }
  const typed = fold(phrase).split(/[^a-z0-9]+/).filter(Boolean);
  if (!typed.length || typed.length > 4) return null;
  // One word spelt wrong: try the closest words that are part of an ingredient's name.
  for (let n = 0; n < typed.length; n++) {
    for (const v of closeWords(ready, words(typed[n])[0] || '', { min: 1 })) {
      if (!ready.ingWord.has(v)) continue;
      const { found: fixed } = ingredientsIn(ready, typed.map((w, k) => (k === n ? v : w)).join(' '));
      if (fixed.length) return { p: fixed.at(-1), fixed: [typed[n], v] };
    }
  }
  return null;
}

/**
 * The creator a phrase means: an id, a full name, the name without "the", another name for
 * them ("Pailin", "Kenji"), whole words from their name ("woks"), or their site's address.
 * Three letters at least, so "a" isn't Hot Thai Kitchen.
 */
export function creatorFor(ready, phrase) {
  const id = creatorIdFor(ready, phrase);
  if (id) return ready.creatorById.get(id);
  const want = words(phrase);
  const text = want.join(' ');
  if (text.length < 3) return null;
  const all = ready.creators;
  const inside = (ws, part) => part.length <= ws.length && ws.some((_, i) => part.every((w, k) => ws[i + k] === w));
  return (
    all.find((c) => inside(c.words, want) || c.aliases.some((a) => inside(a, want))) ??
    all.find((c) => inside(want, c.words.filter((w) => w !== 'the')) || c.aliases.some((a) => a.join(' ').length >= 4 && inside(want, a))) ??
    all.find((c) => c.site && text.replace(/ /g, '').includes(words(new URL(c.site).hostname.replace(/^www\./, '').split('.')[0]).join(''))) ??
    null
  );
}

export function cuisineFor(ready, wanted) {
  return coreCuisineFor(ready, wanted);
}

const fmtTime = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`);
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Search the index. Everything is optional:
 *   query        words for the dish ("mapo tofu"). Plain phrases in it are understood too:
 *                "quick", "under 30 minutes", "vegetarian", "no pork", "thai food", "desserts",
 *                "from Kenji", "with tofu and eggs"; `understood` says what was taken from it.
 *   ingredients  things to cook with; a recipe must use at least one, more is better
 *   without      ingredients to leave out, or dairy, eggs, nuts, shellfish, pork, meat, seafood
 *   diet         "vegetarian" or "vegan" (a best guess from names and ingredient lists)
 *   course       main, side, soup, starter, breakfast, dessert, bread, sauce or drink
 *   cuisine, max_minutes, creator
 *   new_only     only recipes the latest weekly crawl found
 *   show         "both" (default), "recipes" or "videos"   (`videos: false` still means "recipes")
 *   sort         "best" (default), "quickest", "newest" or "random"
 *   limit        1 to 30, default 10;   offset: skip this many, for the next page
 *
 * The answer keeps its old fields (total_recipes, recipes, videos, cooking_with, notes,
 * crawled, source) and adds, only when there is something to say:
 *   understood   what was taken out of `query` and searched as a filter instead
 *   corrected    spellings that were fixed: [{ from, to }]
 *   leaving_out  what the search left out, by name
 *   relaxed      when nothing matched everything: how many recipes each single change would
 *                find, and the recipes for the gentlest one. Exclusions and diet are never relaxed.
 */
export function searchRecipes(ready, opts = {}) {
  const { index } = ready;
  const notes = [];
  const limit = Math.min(Math.max(Math.round(Number(opts.limit)) || 10, 1), 30);
  const offset = Math.min(Math.max(Math.round(Number(opts.offset)) || 0, 0), 5000);
  const name = (p) => ready.ing[p][1];
  const corrected = [];
  const understood = {};

  const f = { q: '', with: [], without: [], notWords: [], sites: new Set(), time: 0, cuisine: '', course: '', fresh: false, diet: '', show: '' };

  // The words: phrases an assistant passes through from the person ("quick vegetarian pad
  // thai") become filters, unless that filter was given as its own argument.
  const u = understand(ready, String(opts.query ?? '').slice(0, 300));
  f.q = u.q;
  if (u.time && !opts.max_minutes) understood.max_minutes = f.time = u.time;
  if (u.diet && !opts.diet) understood.diet = f.diet = u.diet;
  if (u.cuisine && !opts.cuisine) understood.cuisine = f.cuisine = u.cuisine;
  if (u.course && !opts.course) understood.course = f.course = u.course;
  if (u.show && !opts.show) understood.show = f.show = u.show;
  if (u.sites.length && !opts.creator) {
    f.sites.add(u.sites[0]);
    understood.creator = ready.creatorById.get(u.sites[0]).name;
  }
  if (u.with.length) understood.ingredients = u.with.map(name);
  f.with.push(...u.with);
  if (u.without.length || u.notWords.length) understood.without = [...u.without.map(name), ...u.notWords];
  f.without.push(...u.without);
  f.notWords.push(...u.notWords);
  if (Object.keys(understood).length) understood.query = f.q;

  const unknown = [];
  for (const phrase of list(opts.ingredients)) {
    const hit = ingredientNear(ready, phrase);
    if (!hit) unknown.push(phrase);
    else {
      if (hit.fixed) corrected.push({ from: hit.fixed[0], to: hit.fixed[1] });
      if (!f.with.includes(hit.p)) f.with.push(hit.p);
    }
  }
  if (unknown.length) {
    // Not a catalog ingredient: look for it in recipe names instead, when nothing else was asked for.
    const alone = !f.with.length && !f.q;
    if (alone) f.q = unknown.join(' ');
    notes.push(`Not ingredients this index knows by that name: ${unknown.join(', ')}. ${alone ? 'Searched recipe names for them instead.' : 'They were left out of the search.'}`);
  }

  // Leaving things out. A group ("dairy") or an ingredient by its own name is left out by
  // what recipes use. Anything else can only be left out by recipe name, and the answer says so.
  const byName = [];
  for (const phrase of list(opts.without)) {
    const p = groupFor(ready, phrase) ?? coreIngredientFor(ready, phrase, true);
    if (p != null) {
      if (!f.without.includes(p)) f.without.push(p);
      continue;
    }
    if (/^meats?$/i.test(phrase)) {
      f.diet ||= 'vegetarian';
      continue;
    }
    const kind = coreIngredientFor(ready, phrase);
    const w = words(phrase)[0];
    if (w) f.notWords.push(w);
    byName.push(kind != null ? `${phrase} (filed under ${name(kind)} here, so it can't be told apart)` : phrase);
  }
  if (byName.length)
    notes.push(`Could not check ingredient lists for: ${byName.join('; ')}. Recipes with the word in their name were left out; others may still use it, so check the recipe.`);
  if (opts.diet === 'vegetarian' || opts.diet === 'vegan') f.diet = opts.diet;
  if (f.diet) notes.push(`${f.diet === 'vegan' ? 'Vegan' : 'Vegetarian'} is a best guess from recipe names and ingredient lists; check the recipe.`);
  if (f.without.some((p) => p >= ready.real)) notes.push('Leaving out a whole group (dairy, eggs, nuts, shellfish, pork) is a best guess from recipe names and ingredient lists, not an allergy check.');

  if (opts.cuisine) {
    f.cuisine = cuisineFor(ready, opts.cuisine);
    if (!f.cuisine) return { error: `No cuisine matches "${opts.cuisine}".`, cuisines: index.cuisines.map(([c]) => c) };
  }
  if (opts.course) {
    const want = String(opts.course).toLowerCase().trim();
    const c = (index.courses || []).find(([id, label]) => id === want || label.toLowerCase() === want || id + 's' === want);
    if (!c) return { error: `No course matches "${opts.course}".`, courses: (index.courses || []).map(([id]) => id) };
    f.course = c[0];
  }
  if (f.course) notes.push('Courses come from how each site files its recipes, or a plain dish name; recipes no site labels are left out when a course is asked for.');
  if (opts.creator) {
    const c = creatorFor(ready, opts.creator);
    if (!c) return { error: `No creator matches "${opts.creator}".`, creators: ready.creators.map((c) => c.name) };
    f.sites = new Set([c.id]);
  }
  if (Number(opts.max_minutes) > 0) f.time = Number(opts.max_minutes);
  if (opts.new_only) f.fresh = true;
  if (opts.show === 'recipes' || opts.show === 'videos') f.show = opts.show;
  else if (opts.videos === false && !f.show) f.show = 'recipes';
  const sort = ['quickest', 'newest', 'random'].includes(opts.sort) ? opts.sort : 'best';

  const creator = f.sites.size ? ready.creatorById.get([...f.sites][0]) : null;
  if (creator && !creator.recipes) notes.push(`${creator.name} is in the index as YouTube videos only, so there are no recipes to list.`);

  const Q = queryFor(ready, f);
  for (const [from, to] of Q.fixes) corrected.push({ from, to });
  if (Q.ignored.length) notes.push(`Nothing in the index has the word${Q.ignored.length > 1 ? 's' : ''} ${Q.ignored.join(', ')}, so ${Q.ignored.length > 1 ? 'they were' : 'it was'} ignored.`);

  const order = (hits) => {
    // The same order as the page (page-state's sortHits): recipes named for the words first.
    if (sort === 'quickest' || sort === 'newest') return sortHits(hits, sort);
    if (sort === 'random') return shuffle([...hits]);
    return hits;
  };
  const row = (h, ff) => {
    const out = { name: h.r.name, url: h.r.url, from: h.r.src.name };
    if (h.r.min) out.time = fmtTime(h.r.min);
    if (h.r.cuisine) out.cuisine = h.r.cuisine;
    if (h.r.course) out.course = h.r.course;
    if (h.r.isNew) out.new = true;
    if (ff.with.length) {
      out.uses = h.used.map(name);
      const need = h.r.own.filter((p) => !covers(ready, ff.with, p)).map(name);
      out.also_needs = need.length > 12 ? [...need.slice(0, 12), `and ${need.length - 12} more`] : need;
    }
    return out;
  };
  const top = sort === 'best' ? offset + limit + 20 : Infinity;

  let hits = f.show === 'videos' ? [] : search(ready, f, { top });
  const vids = f.show === 'recipes' ? [] : searchVideos(ready, f, { top: 40 });
  const blocked = Boolean(f.diet || f.without.length || f.notWords.length);

  // Nothing matches all of it. Say which single change would find something, and show the
  // gentlest one's recipes. What's being left out (diet, without) is never dropped.
  const tries = [];
  if (!hits.length && !vids.length && f.show !== 'videos') {
    const tryIt = (dropped, label, change) => {
      const ff = { ...f, sites: new Set(f.sites), ...change };
      const n = search(ready, ff, { count: true });
      if (n) tries.push({ dropped, label, total_recipes: n, ff });
    };
    if (f.time) tryIt('max_minutes', 'without the time limit', { time: 0 });
    if (f.fresh) tryIt('new_only', 'not only new recipes', { fresh: false });
    if (f.with.length > 1) for (const p of f.with) tryIt(`ingredient: ${name(p)}`, `without ${name(p)}`, { with: f.with.filter((x) => x !== p) });
    if (f.cuisine) tryIt('cuisine', 'in any cuisine', { cuisine: '' });
    if (f.sites.size) tryIt('creator', 'from any creator', { sites: new Set() });
    if (f.course) tryIt('course', 'in any course', { course: '' });
    if (f.q && f.with.length) tryIt('query', 'any dish with those ingredients', { q: '' });
    if (f.with.length === 1 && f.q) tryIt(`ingredient: ${name(f.with[0])}`, `without ${name(f.with[0])}`, { with: [] });
    const filters = Number(!!f.time) + Number(f.fresh) + Number(!!f.cuisine) + Number(!!f.sites.size) + Number(!!f.course);
    if (!tries.length && filters > 1) tryIt('all filters', 'with no time, cuisine, creator, course or new-only filter', { time: 0, fresh: false, cuisine: '', sites: new Set(), course: '' });
    // Still nothing, and nothing is in the way but the words: show what has most of them.
    const others = blocked && search(ready, { ...f, diet: '', without: [], notWords: [], time: 0, fresh: false, cuisine: '', sites: new Set(), course: '' }, { count: true });
    if (!tries.length && !others && Q.words.length > 1) {
      hits = search(ready, f, { loose: true, top });
      if (hits.length) notes.push('Nothing has every word, so these have most of them.');
    }
  }
  const total = hits.length;
  const recipes = order(hits).slice(offset, offset + limit).map((h) => row(h, f));

  const vLimit = f.show === 'videos' ? limit : Math.min(5, limit);
  const videos = vids.slice(f.show === 'videos' ? offset : 0).slice(0, vLimit).map((v) => ({
    title: v[1],
    url: `https://www.youtube.com/watch?v=${v[2]}`,
    channel: index.videos.sources[v[0]].name,
    on: 'YouTube',
    ...(v[3] ? { published: String(v[3]).slice(0, 10) } : {}),
  }));
  if (f.show !== 'recipes' && (f.time || f.fresh) && (Q.words.length || creator)) notes.push('Videos have no cooking time or first-seen date in the index, so none are listed with a time limit or new_only.');

  if (total > offset + recipes.length) notes.push(`Showing ${offset + 1} to ${offset + recipes.length} of ${total} recipes. Pass offset ${offset + recipes.length} for more, or add words, ingredients or filters to narrow it.`);

  const leaving = [...f.without.map(name), ...f.notWords.map((w) => `"${w}" in the name`)];
  const extras = {
    ...(Object.keys(understood).length ? { understood } : {}),
    ...(corrected.length ? { corrected } : {}),
    ...(leaving.length ? { leaving_out: leaving } : {}),
  };

  if (!total && !videos.length) {
    const q = encodeURIComponent(String(opts.query || list(opts.ingredients).join(' ')));
    const also = q ? (index.linkOnly || []).map((l) => ({ name: l.name, search: l.search.replace('{q}', q) })) : [];
    if (tries.length) {
      const best = tries[0];
      notes.push(`Nothing matches all of that. ${tries.map((t) => `${t.label[0].toUpperCase()}${t.label.slice(1)}: ${t.total_recipes}`).join('. ')}.${blocked ? ' What is being left out was kept.' : ''}`);
      return {
        total_recipes: 0,
        recipes: [],
        relaxed: {
          dropped: best.dropped,
          total_recipes: best.total_recipes,
          recipes: search(ready, best.ff, { top: limit + 20 }).slice(0, limit).map((h) => row(h, best.ff)),
          counts: Object.fromEntries(tries.map((t) => [t.dropped, t.total_recipes])),
        },
        ...extras,
        notes,
        crawled: index.crawled,
        source: SITE,
      };
    }
    const why = Q.none
      ? 'There are no words to search in that query.'
      : blocked && search(ready, { ...f, diet: '', without: [], notWords: [], time: 0, fresh: false, cuisine: '', sites: new Set(), course: '' }, { count: true })
        ? 'Recipes match, but every one uses something being left out.'
        : 'Nothing in the index matches.';
    return {
      total_recipes: 0,
      recipes: [],
      ...extras,
      notes: [...notes, also.length && !Q.none ? `${why} These sites are not indexed here but can be searched directly.` : why],
      ...(also.length && !Q.none ? { also_search: also } : {}),
      crawled: index.crawled,
      source: SITE,
    };
  }

  return {
    total_recipes: total,
    recipes,
    ...(videos.length ? { videos } : {}),
    ...(f.show === 'videos' ? { total_videos: vids.length } : {}),
    ...(f.with.length ? { cooking_with: f.with.map(name) } : {}),
    ...extras,
    ...(notes.length ? { notes } : {}),
    crawled: index.crawled,
    source: SITE,
  };
}

/** Who is in the index, how to support them, and what can be filtered on. */
export function listSources(ready) {
  const { index } = ready;
  return {
    about: 'One search across recipe sites Kyle Pace trusts, from a small index of names, links, ingredient names, times and cuisines. It never holds the method: every result links to the original recipe.',
    creators: ready.everyone.map((c) => ({
      name: c.name,
      ...(c.site ? { site: c.site } : {}),
      ...(c.recipes ? { recipes: c.recipes } : {}),
      ...(c.videos ? { videos: c.videos, youtube: c.youtube } : {}),
      // Their page on Findish gathers every way to back them; support is most helpful first.
      page: `https://findish.now/creators/${c.id.replace(/-yt$/, '')}/`,
      ...(index.support?.[c.id]?.length
        ? { support: index.support[c.id].map((s) => ({ label: s.book ? `Book: ${s.label}` : s.label, url: s.url, ...(s.kind ? { kind: s.kind } : {}) })) }
        : {}),
    })),
    not_indexed_but_searchable: (index.linkOnly || []).map((l) => l.name),
    cuisines: index.cuisines.map(([c, n]) => `${c} (${n})`),
    courses: (index.courses || []).map(([id, label, n]) => `${id}: ${label} (${n})`),
    recipe_count: index.recipes.length,
    video_count: index.videos.rows.length,
    crawled: index.crawled,
    source: SITE,
    more: `${SITE}about/`,
  };
}

const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;

/**
 * Recipes that use several of a few ingredients, by catalog id: the Grocery Deals app's
 * "Recipes with your list" (src/pages/api/with.ts). Ids come from its
 * recipes.json, which takes them from this index, so they match exactly; unknown ones are
 * left out. With two or more known, recipes that use only one of them are left out too.
 * Same ranking as an ingredient search: more of them first, then fewer other things to buy.
 *   with   2 to 25 catalog ids ("ground-pork", "napa-cabbage")
 *   diet   "vegetarian" or "vegan"
 *   limit  1 to 24, default 12
 */
export function recipesWith(ready, opts = {}) {
  const { index } = ready;
  const ids = [...new Set((Array.isArray(opts.with) ? opts.with : []).map(String))].filter((id) => ID.test(id)).slice(0, 25);
  const pos = new Map(index.ing.map((g, p) => [g[0], p]));
  const f = { q: '', with: ids.filter((id) => pos.has(id)).map((id) => pos.get(id)), without: [], notWords: [], sites: new Set(), diet: '' };
  if (f.with.length < 2) return { total: 0, recipes: [], known: f.with.map((p) => index.ing[p][0]) };
  if (opts.diet === 'vegetarian' || opts.diet === 'vegan') f.diet = opts.diet;
  const meat = new Set(index.diet?.vegetarian || []);
  const limit = Math.min(Math.max(Number(opts.limit) || 12, 1), 24);
  const hits = search(ready, f, { top: 80 }).filter((h) => h.used.length >= 2);
  return {
    total: hits.length,
    recipes: hits.slice(0, limit).map((h) => ({
      name: h.r.name,
      url: h.r.url,
      site: h.r.src.name,
      minutes: h.r.min ?? null,
      image: h.r.img || null,
      // No meat or fish in its name or its ingredient lines, matched or not (scripts/diet.mjs).
      veg: !(h.r.flags & 3) && ![...h.r.pos].some((p) => meat.has(p)),
      uses: h.used.map((p) => index.ing[p][1]),
      also_needs: h.r.own.filter((p) => !covers(ready, f.with, p)).length,
    })),
    known: f.with.map((p) => index.ing[p][0]),
    crawled: index.crawled,
  };
}

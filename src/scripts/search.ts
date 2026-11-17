// Findish, in the browser. Loads the index once, then every keystroke searches it locally:
// no server and no search service. What's typed stays on the page, unless Ask is on and it
// reads like a question (see the end of this file).
//
// The index comes in two files (src/scripts/index-load.ts): the recipes first, about
// 290 KB over the wire, then the videos, about 170 KB, once the recipes are on the page.
// Both are named after their contents, so a browser downloads them again only after a
// crawl changes them. Until the videos land, a search shows recipes only, then draws
// itself again with the videos (videosLanded below).
//
// This file is the page: the box, the tags, the results, the address. The search itself
// (words, typo fixing, understanding a sentence, ranking, videos) is src/lib/search-core.mjs,
// the same code the MCP server and Ask run, so all three find and rank the same way.
//
// One search box (#q). Words you type search recipe names, ingredients and cuisines.
// Picking an ingredient or a creator from the suggestions turns it into a tag in the box:
// ingredient tags rank recipes by how many of them they use, creator tags narrow to that
// creator's recipes and videos. With nothing searched, the page is just the box (home);
// after a search, the box moves up and results fill the page (results).
// State lives in the URL (?q=, &with=, &site=, &time=, &cuisine=, &course=, &new=, &diet=,
// &sort=, &saved= for the saved view, #list= for a shared list, &pick= for a recipe picked at
// random), so searches can be shared and the back button works. (`site`
// holds creator ids, for older links.) How many results "Show more" has opened, and how far
// down the page was, ride along in history.state, so Back from a recipe lands where you were.
//
// Three short lists are kept on the device, in localStorage and nowhere else (src/lib/kept.mjs):
// the last searches, the recipes opened lately and the recipes saved for later. They show
// under the empty box when it's focused, each one removable; "saved" is also a view (&saved=1).
import { track } from 'kp-design/analytics';
import * as core from '../lib/search-core.mjs';
import type { Creator, Hit, Ready, Recipe, Understood } from '../lib/search-core.mjs';
import { looksLikeAsk, words } from '../lib/search-core.mjs';
import { cleanQ, completions, coverLabel, dishName, goesToAsk, ignoredSentence, linkOnlyTyped, narrowFacets, soleQuery, sortHits, tagOrder, titleFor } from '../lib/page-state.mjs';
import { KEEP, dropFrom, keysFromHash, listHash, putFirst, readList, recentKey, rememberSearch, searchLabel } from '../lib/kept.mjs';
import { loadIndex } from './index-load.ts';

type Source = { id: string; name: string; site: string; host: string; count: number };
// [catalog id, name, recipes naming it, parent positions, ...other names]
type Ing = [string, string, number, number[], ...string[]];
// [source, name, url (path on the site), minutes, cuisine, ingredient positions (with parents), own positions, photo, keywords, opens lately, course, first found, flags (scripts/diet.mjs)]
type RecipeRow = [number, string, string, number | null, string, number[], number[], string, string, number?, string?, string?, number?];
// [channel index, title, video id, published date, ingredient positions, course from the title, flags from the title]
type VideoRow = [number, string, string, string, number[], string?, number?];
type Channel = { id: string; name: string; channel: string; site: string; count: number; cuisine?: string };
type SupportLink = { label: string; url: string; kind: 'join' | 'buy' | 'follow'; book?: boolean; isbn?: string; cover?: string; coverWidth?: number; coverHeight?: number };
type Index = {
  built: string;
  crawled: string;
  sources: Source[];
  paused: { id: string; name: string; site: string; why: string }[];
  videos: { sources: Channel[]; rows: VideoRow[] };
  /** Ways to support each creator, by creator id (from KitchenCatalog's recipe sources). */
  support: Record<string, SupportLink[]>;
  linkOnly: { name: string; search: string }[];
  cuisines: [string, number][];
  /** [id, label, recipes], in menu order (scripts/course.mjs). */
  courses?: [string, string, number][];
  /** Recipes the latest crawl's week found, newest first. */
  fresh?: number[];
  popular: number[];
  /** Common dish phrases from recipe names, most common first (scripts/phrases.mjs). */
  phrases?: string[];
  /** Ingredient positions a vegetarian or vegan search leaves out. */
  diet?: { vegetarian: number[]; vegan: number[] };
  /** Things to leave out that aren't one ingredient ("dairy"): [id, name, flag, ...other names]. */
  groups?: [string, string, number, ...string[]][];
  /** After load() this also holds those groups, after the real ingredients, so a tag can be either. */
  ing: Ing[];
  recipes: RecipeRow[];
};

const PAGE = 24;
const MOST_SHOWN = 20 * PAGE; // as far as Back will reopen "Show more"
// The tab's title could name the search ("mapo tofu: Findish"), which helps tell tabs and
// history apart. It stays off: Amplitude copies the page's title onto every page view and
// click it records, so the typed words would leave the browser. Turn it on only once
// kp-design's analytics strips "[Amplitude] Page Title" the way it strips the address.
const TITLE_NAMES_SEARCH = false;
const HOME_TITLE = document.title;
const phone = () => matchMedia('(max-width: 40rem)').matches;
const TIMES = [15, 30, 45, 60];
// The home page's ideas are drawn at random from these on every visit, so a refresh brings
// new ones. Dishes are specific (not "salad" or "soup"), from many cuisines and courses;
// one only shows when it finds at least TRY_MIN recipes, so an idea never lands on a thin page.
const TRY = [
  'mapo tofu', 'pad thai', 'dumplings', 'green curry', 'fried rice', 'scones', 'ramen', 'noodle soup',
  'meatballs', 'pancakes', 'cheesecake', 'udon', 'teriyaki', 'katsu', 'tacos', 'tom yum', 'chow mein',
  'miso soup', 'mochi', 'bao', 'kimchi', 'lasagna', 'congee', 'risotto', 'brownies', 'lo mein',
  'spring rolls', 'satay', 'pho', 'granola', 'massaman', 'roast chicken', 'banana bread', 'galette',
  'larb', 'focaccia', 'dal', 'shakshuka', 'carbonara', 'enchiladas', 'chili', 'stir fry', 'cookies',
];
const TRY_SHOWN = 4;
const TRY_MIN = 5;
const POPULAR_SHOWN = 5;

/** A few picked at random, in a random order (a Fisher–Yates shuffle, cut short). */
function pickSome<T>(list: readonly T[], n: number): T[] {
  const a = [...list];
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const page = $('page');
const app = $('app');
const form = $<HTMLFormElement>('search-form');
const qInput = $<HTMLInputElement>('q');
const statusEl = $('status');
const resultsEl = $<HTMLOListElement>('results');
const moreBtn = $<HTMLButtonElement>('more');

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const fmtTime = (m: number) =>
  m < 60 ? plural(m, 'minute') : `${plural(Math.floor(m / 60), 'hour')}${m % 60 ? ` ${plural(m % 60, 'minute')}` : ''}`;
/** "a, b and c" */
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
/** "2026-11-16" -> "November 16" */
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
const orList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);

// Result names are semi-bold and book titles italic, and a browser only fetches a font's
// face when something first uses it. Asking for them now, while the index loads, means the
// first results don't reflow a moment after they appear.
for (const face of ['600', 'italic', '700']) document.fonts?.load(`${face} 1em "Atkinson Hyperlegible Next"`).catch(() => {});

let data: Index;
/** Ask (the chat experiment, at the end of this file) has loaded and can take questions. */
let askReady = false;
/** The index, ready to search (src/lib/search-core.mjs). Not set until it has loaded. */
let ready: Ready | undefined;
let recipes: Recipe[] = [];
let creators: Creator[] = [];
const creatorById = new Map<string, Creator>();
let ingNames: string[][] = []; // per position: its names, as words joined by spaces
let ingRecipes: number[] = []; // per position: how many recipes use it (directly or as a kind of it)
const ingById = new Map<string, number>();
const sideCount = new Map<string, number>(); // sides per cuisine, for "Sides to go with it"

const state = {
  q: '',
  with: [] as number[],
  sites: new Set<string>(), // creator ids
  time: 0,
  cuisine: '',
  course: '',
  fresh: false, // only what's new this week
  sidesFor: '', // the dish a "sides to go with it" search is for (&sidesFor= in the URL, letters only)
  show: '' as '' | 'recipes' | 'videos', // both, or just one kind
  without: [] as number[], // ingredients to leave out ("no pork")
  notWords: [] as string[], // words to leave out by title, for things that aren't one ingredient ("no peas")
  diet: '' as '' | 'vegetarian' | 'vegan',
  sort: '' as '' | 'quickest' | 'newest', // the order results come in; '' is best match
  keep: '' as '' | 'saved' | 'list', // only recipes saved on this device, or the ones a shared link lists
  listKeys: [] as string[], // the recipe keys a shared link lists (#list= in the address)
  exact: false, // search the words as typed, without fixing typos
  list: false, // a comma just made an ingredient tag, so what's typed next carries on the list
  shown: PAGE,
  picked: -1, // a recipe picked at random, by index into recipes
  order: [] as string[], // the tags, in the order they were added (see tagList)
};

/** The creator a channel belongs to: its site's id, or its own. */
const creatorOfChannel = (k: number) => data.videos.sources[k].site || data.videos.sources[k].id;

// ---------------------------------------------------------------------------------------
// Loading

async function load() {
  let loaded: Awaited<ReturnType<typeof loadIndex>>;
  try {
    loaded = await loadIndex();
  } catch {
    app.dataset.state = 'failed';
    statusEl.textContent = 'The recipes didn’t load. Refresh the page to try again.';
    return;
  }
  data = loaded.index as Index;
  ready = loaded.ready;
  videosPending = !!loaded.videos;
  // The groups you can leave out ("dairy") sit after the real ingredients from here on.
  data.ing = ready.ing as Ing[];
  recipes = ready.recipes;
  creators = ready.creators;
  for (const c of creators) creatorById.set(c.id, c);
  ingNames = ready.ingNames;
  ingRecipes = ready.ingUsed;
  data.ing.forEach((g, p) => ingById.set(g[0], p));
  for (const r of recipes) if (r.course === 'side' && r.cuisine) sideCount.set(r.cuisine, (sideCount.get(r.cuisine) || 0) + 1);
  recipes.forEach((r) => keyIndex.set(r.key, r.i));
  buildFilters();
  buildStart();
  readUrl();
  // A link that is only words (/?q=quick+vegetarian+dinner, what the site's SearchAction
  // hands out) is read as a typed sentence, so it finds what typing it would. Only on
  // arriving: an address the page wrote itself (Back, a reload, Ask's search) has a history
  // state and keeps `q` as plain words. The address is then rewritten the page's own way.
  const sentence = history.state == null ? soleQuery(location.search) : '';
  if (sentence) {
    takeIn(understand(sentence));
    writeUrl(false, true);
  }
  // Arriving at the saved view or a shared list from a link (the footer's "Saved" is one).
  if (history.state == null && state.keep === 'saved') track('Opened Saved Recipes', { opened_from: 'link', saved_count: stored.read('saved').length });
  if (history.state == null && state.keep === 'list') track('Opened Shared List', { recipe_count: state.listKeys.length });
  state.shown = entryShown = shownFrom(history.state);
  app.dataset.state = 'ready';
  // Enter was pressed before the recipes had loaded: search for what's in the box now.
  // Anything typed meanwhile stays in the box; the page is never drawn over it.
  if (submitWaiting) submit();
  else {
    if (!typedEarly) qInput.value = state.q;
    render();
    restoreScroll();
  }
  // The videos come second, so recipe search doesn't wait for them.
  loaded
    .videos?.()
    .catch(() => {}) // no videos this visit: recipes still work
    .then(videosLanded);
}
/** Enter was pressed before the recipes had loaded; the search runs as soon as they have. */
let submitWaiting = false;
/** Something was typed before the recipes had loaded. */
let typedEarly = false;
const keyIndex = new Map<string, number>(); // recipe key -> index, for &pick=

// Back from a recipe (or a reload) puts the page where it was: how many results were open
// and how far down it was scrolled are kept on the history entry, and put back by hand
// once the results are drawn (the browser tries before they exist).
type View = { shown?: number; y?: number };
const shownFrom = (v: View | null) => Math.min(MOST_SHOWN, Math.max(PAGE, Math.round(Number(v?.shown)) || PAGE));
try {
  history.scrollRestoration = 'manual';
} catch {
  // Older browsers restore the scroll position themselves, as best they can.
}
/** How many results are open on the history entry being looked at (state.shown resets before a new search is pushed). */
let entryShown = PAGE;
function saveView() {
  if (!ready) return;
  try {
    history.replaceState({ shown: entryShown, y: Math.round(scrollY) }, '');
  } catch {
    // A full history state isn't worth breaking the page over.
  }
}
function restoreScroll() {
  const y = Number((history.state as View | null)?.y) || 0;
  scrollTo(0, y);
}
addEventListener('pagehide', saveView);

/** The video rows haven't arrived yet (they load after the recipes). */
let videosPending = false;

/** The videos are in: a search on the page is drawn again, now with them. */
function videosLanded() {
  videosPending = false;
  if (isBlank() && state.picked < 0) return; // the home page shows none
  // Keep whatever is being typed, and where the cursor is, across the redraw.
  const [typed, from, to] = [qInput.value, qInput.selectionStart, qInput.selectionEnd];
  // The count was read out when the recipes arrived. Drawing it again with the videos would
  // read it a second time, so the line is quiet for this one redraw (unless only videos
  // could answer, when "Loading videos…" was all that had been said).
  const quiet = lastHits.length > 0;
  if (quiet) statusEl.setAttribute('aria-live', 'off');
  render();
  if (quiet) setTimeout(() => statusEl.setAttribute('aria-live', 'polite'), 300);
  if (qInput.value !== typed) {
    qInput.value = typed;
    qInput.setSelectionRange(from, to);
  }
}

// ---------------------------------------------------------------------------------------
// The search itself is src/lib/search-core.mjs. These hand it the page's state.

/** The words the search matches on, with any typos fixed and words nothing has left out. */
function queryWords(text: string, typing = false) {
  return core.queryFor(ready!, state, { q: text, typing });
}

/** What a typed sentence asks for. Before the recipes have loaded, just its words. */
function understand(text: string): Understood {
  return ready ? core.understand(ready, text, { list: state.list }) : core.blankUnderstood(text.trim());
}

const covers = (chosen: number[], p: number) => core.covers(ready!, chosen, p);

type Skip = 'site' | 'time' | 'cuisine' | 'course';

function search(opts: { q?: string; with?: number[]; skip?: Skip; loose?: boolean; typing?: boolean } = {}): Hit[] {
  return kept(core.search(ready!, state, opts), state);
}

function searchVideos(opts: { q?: string; skip?: Skip } = {}): VideoRow[] {
  // Saved recipes and shared lists hold recipes only.
  return state.keep ? [] : (core.searchVideos(ready!, state, opts) as VideoRow[]);
}

/** The recipe keys a search is held to: the saved ones, or a shared link's list. Null when it isn't. */
const keepKeys = (s: { keep: string; listKeys: string[] }) => (s.keep === 'saved' ? stored.read('saved') : s.keep === 'list' ? s.listKeys : null);

/** Only the saved recipes (or a shared list's), when the search is held to them. */
function kept(hits: Hit[], s: { keep: string; listKeys: string[] }): Hit[] {
  const keys = keepKeys(s);
  if (!keys) return hits;
  const has = new Set(keys);
  return hits.filter((h) => has.has(h.r.key));
}

/** How many recipes the search would find with something about it changed. */
function countWith(over: Partial<typeof state>): number {
  const s = { ...state, ...over };
  return s.keep ? kept(core.search(ready!, s), s).length : core.search(ready!, s, { count: true });
}

// ---------------------------------------------------------------------------------------
// What's kept on this device (src/lib/kept.mjs): recent searches, recipes opened lately and
// saved recipes. localStorage only; a browser that refuses it just doesn't keep them.

type Kept = keyof typeof KEEP;
const stored = {
  /** Each list as last read, so drawing 24 rows doesn't read storage 24 times. */
  cache: {} as Partial<Record<Kept, string[]>>,
  read(which: Kept): string[] {
    if (this.cache[which]) return this.cache[which];
    try {
      return (this.cache[which] = readList(localStorage.getItem(KEEP[which].key), KEEP[which].max));
    } catch {
      return [];
    }
  },
  write(which: Kept, list: string[]) {
    this.cache[which] = list;
    try {
      if (list.length) localStorage.setItem(KEEP[which].key, JSON.stringify(list));
      else localStorage.removeItem(KEEP[which].key);
    } catch {
      // Private mode or full storage: nothing is kept past this visit, and the page works the same.
    }
  },
};
// Another tab saved or removed something: read the lists again next time.
addEventListener('storage', () => (stored.cache = {}));


/** The results of the search on the page, from the last render(), so nothing has to search again just to count. */
let lastHits: Hit[] = [];

const isBlank = () =>
  !state.q && !state.with.length && !state.without.length && !state.notWords.length && !state.diet && !state.sites.size && !state.time && !state.cuisine && !state.course && !state.fresh && !state.keep;
const filterCount = () => Number(!!state.sites.size) + Number(!!state.time) + Number(!!state.cuisine) + Number(!!state.course) + Number(!!state.show);

// ---------------------------------------------------------------------------------------
// Rendering

const ingName = (p: number) => data.ing[p][1].toLowerCase();

function highlight(name: string, q: string[]): string {
  if (!q.length) return esc(name);
  // Mark the start of each word that matches a query word ("tofu" in "Mapo Tofu").
  return name
    .split(/(\s+)/)
    .map((part) => {
      const w = words(part)[0];
      const t = w && q.find((t) => w === t || w.startsWith(t));
      if (!t) return esc(part);
      const n = Math.min(part.length, Math.max(t.length, part.replace(/[^\p{L}\p{N}]+$/u, '').length));
      return `<mark>${esc(part.slice(0, n))}</mark>${esc(part.slice(n))}`;
    })
    .join('');
}

/** "25 minutes, Chinese, from The Woks of Life" */
function metaLine(r: Recipe, from = 'results'): string {
  const bits = [r.min ? fmtTime(r.min) : '', r.cuisine].filter(Boolean);
  // The creator's name opens their page here: who they are and how to back them.
  const who = `<a href="/creators/${esc(r.src.id.replace(/-yt$/, ''))}/" data-creator-page="${esc(r.src.id)}" data-from="${from === 'random' ? 'random' : 'results'}">${esc(r.src.name)}</a>`;
  return `${bits.length ? `${esc(bits.join(', '))}, from ` : 'From '}${who}.`;
}

/** "Save" under a recipe keeps it on this device; "Saved" takes it off again. */
function saveButton(r: Recipe, from: string): string {
  const on = stored.read('saved').includes(r.key);
  return `<button type="button" class="save" data-save="${esc(r.key)}" data-from="${from}" aria-pressed="${on}"><span class="save-word">${on ? 'Saved' : 'Save'}</span><span class="visually-hidden"> ${esc(r.name)}</span></button>`;
}

/**
 * Under a main dish: sides from the same cuisine, so a Thai curry gets Thai sides, not a
 * Caesar salad. Only when there are a few to pick from, and not under the sides themselves.
 */
function sidesLine(r: Recipe, from: string): string {
  if (r.course !== 'main' || !r.cuisine || (sideCount.get(r.cuisine) || 0) < 3 || from === 'sides') return '';
  return `<p class="sides"><button type="button" data-sides="${r.i}">${esc(r.cuisine)} sides to go with it</button></p>`;
}

/** "Uses ginger and tofu, plus 3 more things" / "Uses ginger, not tofu" */
function usesLine(h: Hit, terms: unknown[] = []): string {
  const n = state.with.length;
  // A word that matched only through an ingredient ("chicken thighs" isn't in the name):
  // say which, so the result explains itself.
  if (!n) {
    const via = terms.length ? core.viaIngredient(ready!, h.r, terms) : [];
    return via.length ? `<p class="uses">Uses ${andList(via.map((p) => esc(ingName(p))))}</p>` : '';
  }
  const used = andList(h.used.map((p) => esc(ingName(p))));
  const not = state.with.filter((p) => !h.used.includes(p)).map((p) => esc(ingName(p)));
  const plus = h.missing ? `, plus ${plural(h.missing, 'more thing', 'more things')}` : '';
  return `<p class="uses">Uses ${used}${not.length && n > 1 ? ` (not ${orList(not)})` : ''}${plus}</p>`;
}

// Result names aren't highlighted: every result matches, so marking the words again is
// noise. Suggestions still highlight, since there it shows what you've typed so far.
function row(h: Hit, position: number, terms: unknown[], from = 'results', support = '', level = 3): string {
  const { r } = h;
  const photo = r.img
    ? `<img src="${esc(r.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="480" height="360">`
    : `<span class="no-photo">No photo</span>`;
  // The name comes first in the page so screen readers hear it first; CSS puts the photo on the left.
  return `<article class="row">
    <div class="text">
      <h${level}><a href="${esc(r.url)}" data-pos="${position}" data-src-id="${esc(r.src.id)}" data-key="${esc(r.key)}" data-from="${from}">${esc(r.name)}</a></h${level}>
      <p class="meta">${metaLine(r, from)} ${saveButton(r, from)}</p>${usesLine(h, terms)}${sidesLine(r, from)}${support}
    </div>
    <div class="photo">${photo}</div>
  </article>`;
}

/**
 * Draws the page from `state`. It never writes to the box: whoever changes the words
 * (a search, Back, Start over) sets the box themselves, so text someone is still typing is
 * never replaced.
 */
function render() {
  const understood = queryWords(state.q);
  const q = understood.words;
  renderTags();
  renderFilterButtons();
  renderPicked();

  const blank = isBlank();
  page.dataset.mode = blank && state.picked < 0 ? 'home' : 'results';
  // The home page's ideas belong to the home page: a random pick from there shows only the pick.
  $('start').hidden = !blank || state.picked >= 0;
  if (TITLE_NAMES_SEARCH) document.title = titleFor([state.q, ...tagList().map((t) => t.label)], HOME_TITLE);
  $('empty').hidden = true;
  $('also').hidden = true;
  $('videos').hidden = true;

  $('narrow').hidden = true;
  $('related').hidden = true;
  renderKeptLine();

  if (blank) {
    resultsEl.innerHTML = '';
    moreBtn.hidden = true;
    // A note belongs to the search it was for; back home, it goes with the results.
    $('note').hidden = true;
    statusEl.innerHTML = '';
    lastHits = [];
    say(spoken || notice);
    spoken = notice = '';
    return;
  }

  let hits = state.show === 'videos' ? [] : search();
  // Nothing has every word: show what has most of them, and say so.
  // Not when recipes do have every word and only what's being left out hides them ("fried
  // chicken" on a vegetarian search): then nothing matches, and the page offers to leave nothing out.
  const hidden = !hits.length && (state.diet || state.without.length || state.notWords.length) && countWith({ diet: '', without: [], notWords: [] }) > 0;
  const loose = !hits.length && q.length > 1 && state.show !== 'videos' && !hidden;
  if (loose) hits = search({ loose: true });
  // Saved recipes with nothing else asked for: the one saved last comes first.
  const keys = keepKeys(state);
  if (keys && !q.length && !state.with.length) hits = [...hits].sort((a, b) => keys.indexOf(a.r.key) - keys.indexOf(b.r.key));
  hits = sortHits(hits, state.sort);
  // Two or more ingredients and no dish words: the results sit under headings, "Uses all 3",
  // "Uses 2 of 3", "Uses 1 of 3". (Another order sorts inside each group.)
  const grouped = state.with.length > 1 && !q.length;
  if (grouped && state.sort) hits = [...hits].sort((a, b) => b.used.length - a.used.length);
  lastHits = hits;
  const videos = state.show === 'recipes' ? [] : searchVideos();
  // Only videos could match, and they're still on their way: say so instead of "nothing matches".
  if (videosPending && !hits.length && state.show !== 'recipes') {
    resultsEl.innerHTML = '';
    moreBtn.hidden = true;
    statusEl.textContent = 'Loading videos…';
    return;
  }
  const shown = hits.slice(0, state.shown);
  // Ways to support a creator go under their first recipe on the page, not under every one,
  // so a page of Woks of Life results doesn't repeat the same line twenty times.
  const supported = new Set<string>();
  let group = -1;
  resultsEl.innerHTML = shown
    .map((h, n) => {
      const first = !supported.has(h.r.src.id);
      supported.add(h.r.src.id);
      let head = '';
      if (grouped && h.used.length !== group) {
        group = h.used.length;
        const inIt = hits.filter((x) => x.used.length === group).length;
        head = `<li class="group"><h3>${coverLabel(group, state.with.length)} <span>${plural(inIt, 'recipe')}</span></h3></li>`;
      }
      // Under a group's heading a recipe's name is one level down, so headings stay in order.
      return `${head}<li>${row(h, n + 1, understood.terms, state.sidesFor ? 'sides' : 'results', first ? supportLine(h.r.src.id) : '', grouped ? 4 : 3)}</li>`;
    })
    .join('');
  moreBtn.hidden = hits.length <= state.shown;
  moreBtn.textContent = `Show ${Math.min(PAGE, hits.length - shown.length)} more of ${(hits.length - shown.length).toLocaleString()}`;

  const count = `<strong>${hits.length.toLocaleString()}</strong>`;
  const vids = videos.length ? ` and ${plural(videos.length, 'video')} on YouTube` : '';
  if (loose && hits.length)
    statusEl.innerHTML = hits.length === 1 ? 'Nothing has every word, so this 1 recipe has most of them.' : `Nothing has every word, so these ${plural(hits.length, 'recipe')} have most of them.`;
  else if (state.show === 'videos' && !videos.length) statusEl.textContent = 'No videos match all of that.';
  else if (!hits.length && videos.length) statusEl.innerHTML = `<strong>${videos.length.toLocaleString()}</strong> ${videos.length === 1 ? 'video' : 'videos'} on YouTube.`;
  else if (!hits.length) statusEl.textContent = 'Nothing matches all of that.';
  else if (state.with.length > 1)
    statusEl.innerHTML = `${count} ${hits.length === 1 ? 'recipe uses' : 'recipes use'} at least one of them${vids}. The ones that use the most come first.`;
  else statusEl.innerHTML = `${count} ${hits.length === 1 ? 'recipe' : 'recipes'}${vids}.`;

  if (state.sidesFor && hits.length && state.course === 'side')
    statusEl.innerHTML = `${count} ${state.cuisine ? esc(state.cuisine) + ' ' : ''}${hits.length === 1 ? 'side' : 'sides'} to go with ${esc(state.sidesFor)}.`;
  if (state.fresh && hits.length)
    statusEl.innerHTML = `${count} ${hits.length === 1 ? 'recipe' : 'recipes'} new this week, from the crawl on ${esc(fmtDay(data.crawled))}.`;
  // The saved view, or a list someone shared, with nothing else asked for.
  const onlyKept = state.keep && hits.length && !q.length && isBlank2();
  if (onlyKept && state.keep === 'saved')
    statusEl.innerHTML = `${count} saved ${hits.length === 1 ? 'recipe' : 'recipes'}, kept on this device. <button type="button" data-copy-list="1">Copy this list as a link</button>.`;
  if (onlyKept && state.keep === 'list')
    statusEl.innerHTML = `${count} ${hits.length === 1 ? 'recipe' : 'recipes'} from a list someone shared. <button type="button" data-save-all="1">Save ${hits.length === 1 ? 'it' : 'them all'} on this device</button>.`;
  // A word nothing here has was left out of the search: say which.
  if (understood.ignored.length && (hits.length || videos.length))
    statusEl.innerHTML += ` ${ignoredSentence(understood.ignored, (w) => `“${esc(w)}”`)}`;
  // "serious eats lasagna": that site isn't in the index, but its own search is one tap away.
  if (hits.length || videos.length) statusEl.innerHTML += linkOnlyLine();
  // A typo we fixed: say what we searched, and offer the words as typed.
  if (understood.fixes.length)
    statusEl.innerHTML = `Showing results for “${esc(q.join(' '))}”. <button type="button" data-exact="1">Search for “${esc(
      state.q,
    )}” instead</button>. ${statusEl.innerHTML}`;
  // What just changed ("Added tofu.") is read out with the new count, as one sentence.
  if (spoken) statusEl.insertAdjacentHTML('afterbegin', `<span class="visually-hidden">${esc(spoken)} </span>`);
  if (notice) statusEl.insertAdjacentHTML('afterbegin', `${esc(notice)} `);
  spoken = notice = '';
  renderNote();
  renderNarrow(hits, loose);
  renderRelated(hits, q);
  if (!hits.length && !videos.length && state.show !== 'videos') renderEmpty();
  // Six videos under the recipes; a page at a time when there are only videos (a
  // YouTube-only creator like Kenji).
  const only = !hits.length;
  renderVideos(videos.slice(0, only ? state.shown : 6), q, only);
  const moreV = $<HTMLButtonElement>('more-videos');
  moreV.hidden = !only || videos.length <= state.shown;
  moreV.textContent = `Show ${Math.min(PAGE, videos.length - state.shown)} more of ${(videos.length - state.shown).toLocaleString()}`;
  renderAlso();
}

type Tag = { key: string; label: string; kind: string };

/**
 * Every tag in the box, in the order it was added. Backspace in an empty box takes the
 * last one off, whatever kind it is ("new this week" and "no pork" included).
 */
type Asked = Pick<typeof state, 'q' | 'with' | 'sites' | 'time' | 'cuisine' | 'course' | 'fresh' | 'sidesFor' | 'show' | 'without' | 'notWords' | 'diet' | 'sort' | 'keep' | 'listKeys' | 'exact'>;

/** The tags a search has, in the page's usual order. */
function tagsOf(s: Asked): Tag[] {
  return [
    ...(s.keep ? [{ key: 'keep', label: s.keep === 'saved' ? 'saved' : 'shared list', kind: 'diet' }] : []),
    ...[...s.sites].map((id) => ({ key: `site:${id}`, label: `from ${creatorById.get(id)?.name || id}`, kind: 'creator' })),
    ...(s.cuisine ? [{ key: 'cuisine', label: `${s.cuisine} cuisine`, kind: 'cuisine' }] : []),
    ...(s.fresh ? [{ key: 'fresh', label: 'new this week', kind: 'diet' }] : []),
    ...(s.diet ? [{ key: 'diet', label: s.diet, kind: 'diet' }] : []),
    ...s.with.map((p) => ({ key: `with:${p}`, label: ingName(p), kind: 'ing' })),
    ...s.without.map((p) => ({ key: `not:${p}`, label: `no ${ingName(p)}`, kind: 'not' })),
    ...s.notWords.map((w) => ({ key: `word:${w}`, label: `no ${w}`, kind: 'not' })),
  ];
}

/** Whether the search is nothing but the saved view or a shared list (no words, tags or filters). */
const isBlank2 = () => tagsOf(state).length === 1 && !state.q && !state.time && !state.course && !state.show;

const courseLabel = (id: string) => (data.courses || []).find(([c]) => c === id)?.[1].toLowerCase() || '';
const ORDERS: [typeof state.sort, string][] = [['', 'best match'], ['quickest', 'quickest first'], ['newest', 'newest first']];

/** A search as one readable line, for the recent searches: "tofu, ginger, from The Woks of Life". */
function labelOf(s: Asked): string {
  // Words and ingredients first, who it's from after them.
  const tags = tagsOf(s);
  return searchLabel([
    s.q,
    ...[...tags.filter((t) => t.kind !== 'creator'), ...tags.filter((t) => t.kind === 'creator')].map((t) => t.label),
    s.time ? `${fmtTime(s.time)} or less` : '',
    s.course ? (s.sidesFor ? `sides for ${s.sidesFor}` : courseLabel(s.course)) : '',
    s.show ? `${s.show} only` : '',
    s.sort ? ORDERS.find(([v]) => v === s.sort)![1] : '',
  ]);
}

function tagList(): Tag[] {
  const all = tagsOf(state);
  state.order = tagOrder(state.order, all.map((t) => t.key));
  return state.order.map((k) => all.find((t) => t.key === k)!);
}

function removeTag(key: string) {
  const at = key.indexOf(':');
  const kind = at < 0 ? key : key.slice(0, at);
  const value = key.slice(at + 1);
  if (kind === 'site') state.sites.delete(value);
  else if (kind === 'cuisine') state.cuisine = '';
  else if (kind === 'fresh') state.fresh = false;
  else if (kind === 'diet') state.diet = '';
  else if (kind === 'keep') [state.keep, state.listKeys] = ['', []];
  else if (kind === 'with') state.with = state.with.filter((p) => p !== Number(value));
  else if (kind === 'not') state.without = state.without.filter((p) => p !== Number(value));
  else if (kind === 'word') state.notWords = state.notWords.filter((w) => w !== value);
}

/** What to read out with the next count: "Added tofu." / "Removed tofu." */
let spoken = '';
/** A sentence to show before the next count (Ask couldn't answer, so this is a plain search). */
let notice = '';
/** Reads a short line out politely, for screen readers (nothing shows). */
function say(text: string) {
  if (text) $('announce').textContent = text;
}

/** Creator and ingredient tags, inside the box before the text. */
function renderTags() {
  const tags = tagList();
  $('with-chips').innerHTML = tags
    .map(
      (t) =>
        `<li><button type="button" class="tag tag-${t.kind}" data-remove-tag="${esc(t.key)}" aria-label="Remove ${esc(t.label)}">${esc(t.label)}<span class="x" aria-hidden="true">×</span></button></li>`,
    )
    .join('');
  $('box').toggleAttribute('data-tags', tags.length > 0);
  qInput.placeholder = placeholder(tags.length > 0);
}

/** The hint in the empty box. Shorter on a phone, where the long one was cut off. */
function placeholder(tagged: boolean) {
  if (tagged) return !app.dataset.fromAsk ? 'and…' : phone() ? 'Ask a follow-up' : 'Ask a follow-up, or add an ingredient';
  if (app.dataset.fromAsk) return phone() ? 'Ask a follow-up' : 'Ask a follow-up, or search again';
  if (askReady) return phone() ? 'Dish or question' : 'A dish, ingredient or question';
  return phone() ? 'Dish or ingredient' : 'A dish, ingredient, cuisine or creator';
}
matchMedia('(max-width: 40rem)').addEventListener('change', () => (qInput.placeholder = placeholder($('box').hasAttribute('data-tags'))));
qInput.placeholder = placeholder(false);

/** "Serious Eats isn't one of the sites searched here. Search Serious Eats for “lasagna”." when a link-only site was typed; else ''. */
function linkOnlyLine(): string {
  const named = linkOnlyTyped(state.q, data.linkOnly);
  if (!named) return '';
  const href = named.site.search.replace('{q}', encodeURIComponent(named.rest));
  return ` ${esc(named.site.name)} isn’t one of the sites searched here. <a href="${esc(href)}" data-other="${esc(named.site.name)}">Search ${esc(named.site.name)}${named.rest ? ` for “${esc(named.rest)}”` : ''}</a>.`;
}

/**
 * Nothing matched. Offer what would: each thing asked for taken off, each typed word on its
 * own ("tacos, 88 recipes"), a closer spelling, and under them the home page's ideas. A
 * site Findish only links to (Serious Eats) is named when it was typed.
 */
function renderEmpty() {
  const fixes: { label: string; n: number; apply: () => void }[] = [];
  const countFor = countWith;
  // Only what's saved (or on a shared list) was searched: offer everything.
  if (state.keep && !isBlank2())
    fixes.push({
      label: state.keep === 'saved' ? 'every recipe, not just the saved ones' : 'every recipe, not just this list',
      n: countFor({ keep: '' }),
      apply: () => ([state.keep, state.listKeys] = ['', []]),
    });
  for (const p of state.with) {
    if (state.with.length < 2 && !state.q) continue;
    const rest = state.with.filter((x) => x !== p);
    fixes.push({ label: `without ${esc(ingName(p))}`, n: search({ with: rest }).length, apply: () => (state.with = rest) });
  }
  if (state.q && state.with.length)
    fixes.push({ label: `any dish, not just “${esc(state.q)}”`, n: search({ q: '' }).length, apply: () => (state.q = '') });
  if (state.without.length || state.notWords.length || state.diet)
    fixes.push({
      label: 'leaving nothing out',
      n: countFor({ without: [], notWords: [], diet: '' }),
      apply: () => ([state.without, state.notWords, state.diet] = [[], [], '']),
    });
  if (state.sites.size) fixes.push({ label: 'any creator', n: search({ skip: 'site' }).length, apply: () => state.sites.clear() });
  if (state.time) fixes.push({ label: 'any time', n: search({ skip: 'time' }).length, apply: () => (state.time = 0) });
  if (state.cuisine) fixes.push({ label: 'any cuisine', n: search({ skip: 'cuisine' }).length, apply: () => (state.cuisine = '') });
  if (state.course) fixes.push({ label: 'any course', n: search({ skip: 'course' }).length, apply: () => (state.course = '') });
  // Each word on its own, when there are several: "tacos" (88 recipes).
  // (As typed, "tacos" not the stem the search matches on; not the words of a link-only site's name.)
  const siteWords = (linkOnlyTyped(state.q, data.linkOnly)?.site.name || '').toLowerCase().split(/\s+/);

  const typed = [...new Set(state.q.toLowerCase().split(/\s+/).map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')))].filter(
    (t) => words(t).length === 1 && !core.isFiller(words(t)[0]) && !siteWords.includes(t),
  );
  const lonely: string[] = [];
  for (const w of typed) {
    const n = typed.length > 1 ? countFor({ q: w, exact: true }) : 0;
    if (n > 0) fixes.push({ label: `“${esc(w)}”`, n, apply: () => ((state.q = w), (state.exact = false)) });
    else lonely.push(w);
  }
  // A word nothing has: the closest spelling that finds something, with how many.
  const spelled: { label: string; n: number; apply: () => void }[] = [];
  for (const w of lonely.slice(0, 3)) {
    for (const v of core.closeWords(ready!, w, { real: true }).slice(0, 3)) {
      const q = typed.map((x) => (x === w ? v : x)).join(' ');
      const n = countFor({ q, exact: true }) || (typed.length > 1 ? countFor({ q: v, exact: true }) : 0);
      if (!n) continue;
      const one = countFor({ q, exact: true }) ? q : v;
      spelled.push({ label: esc(one), n, apply: () => ((state.q = one), (state.exact = false)) });
      break;
    }
  }
  const useful = fixes.filter((f) => f.n > 0).sort((a, b) => b.n - a.n).slice(0, 6);
  emptyFixes = [...useful, ...spelled].map((f) => f.apply);
  $('empty').hidden = false;
  const tries = useful.map((f, n) => `<button type="button" data-fix="${n}">${f.label}</button> (${plural(f.n, 'recipe')})`);
  const also = spelled.map((f, n) => `<button type="button" data-fix="${useful.length + n}">${f.label}</button> (${f.n.toLocaleString()})`);
  const over = `<button type="button" data-fix="clear">start over</button>`;
  const nothingKept =
    state.keep === 'saved' && !stored.read('saved').length
      ? 'Nothing is saved yet. “Save” under a recipe keeps it here, on this device.'
      : state.keep === 'list' && isBlank2()
        ? 'None of the recipes on that list are here any more.'
        : '';
  const lines = [
    nothingKept,
    tries.length ? `Try ${orList([...tries, over])}.` : also.length ? `Try ${orList([...also, over])}.` : state.q ? `Try fewer or different words, or ${over}.` : `Try ${over}.`,
    tries.length && also.length ? `Also try ${orList(also)}.` : '',
  ];
  $('fixes').innerHTML = [linkOnlyLine().trim(), ...lines].filter(Boolean).join('<br>');
  // The home page's ideas, so a dead end still has somewhere to go.
  $('start').hidden = false;
}
let emptyFixes: (() => void)[] = [];

function renderVideos(hits: VideoRow[], q: string[], only: boolean) {
  if (!hits.length) return;
  const chans = data.videos.sources;
  $('videos').hidden = false;
  $('videos').toggleAttribute('data-only', only);
  $('video-results').innerHTML = hits
    .map(
      (v) => `<li><article class="row">
      <div class="text">
        <h3><a href="https://www.youtube.com/watch?v=${esc(v[2])}" data-src-id="youtube" data-from="videos">${esc(v[1])}</a></h3>
        <p class="meta">Video on YouTube, from ${esc(chans[v[0]].name)}</p>
      </div>
      <div class="photo"><img src="https://i.ytimg.com/vi/${esc(v[2])}/mqdefault.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="320" height="180"></div>
    </article></li>`,
    )
    .join('');
}

// ---------------------------------------------------------------------------------------
// When a search is just one cuisine, one quiet line above the results links to that cuisine
// on World cuisine (kyle-pace/cuisine-explorer). Nothing for ingredients or broader searches.
// Until 2026-11-16 it was a card with a Wikipedia sentence; Kyle dropped it as filler.
// The links load (public/notes.json) only the first time the line is needed.

type Note = { name: string; page: string };
let notes: { cuisines: Record<string, Note> } | null = null;
let notesLoading = false;

function noteFor(): string | null {
  const others = state.sites.size || state.without.length || state.notWords.length || state.fresh || state.picked >= 0;
  if (others || !state.cuisine || state.q || state.with.length) return null;
  return state.cuisine;
}

/** When the search narrows to one creator: a quiet line to their page, with ways to back them. */
function creatorNote(): string {
  if (state.sites.size !== 1 || state.picked >= 0) return '';
  const id = [...state.sites][0];
  const c = creatorById.get(id);
  if (!c) return '';
  const backs = (data.support[id] || []).some((l) => l.kind !== 'follow');
  return `<a href="/creators/${esc(id.replace(/-yt$/, ''))}/" data-creator-page="${esc(id)}" data-from="results">${backs ? `About ${esc(c.name)} and how to back them` : `About ${esc(c.name)}`}</a>`;
}

function renderNote() {
  const box = $('note');
  const cuisine = noteFor();
  const creator = creatorNote();
  if (creator) {
    box.removeAttribute('data-waiting');
    box.innerHTML = creator;
    return void (box.hidden = false);
  }
  if (!cuisine) return void (box.hidden = true);
  if (!notes) {
    // Holds its line while the link is fetched, so the results under it don't move.
    box.innerHTML = '&nbsp;';
    box.toggleAttribute('data-waiting', true);
    box.hidden = false;
    if (!notesLoading) {
      notesLoading = true;
      fetch('/notes.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((n) => {
          notes = n?.cuisines ? n : { cuisines: {} };
          renderNote();
        })
        .catch(() => {
          notes = { cuisines: {} };
          renderNote();
        });
    }
    return;
  }
  box.removeAttribute('data-waiting');
  const note = notes.cuisines[cuisine];
  if (!note) return void (box.hidden = true);
  box.innerHTML = `<a href="${esc(note.page)}" data-note="cuisine" data-note-id="${esc(cuisine)}" data-note-link="world-cuisine">Explore ${esc(note.name)} on World cuisine</a>`;
  box.hidden = false;
}

/**
 * "Narrow it: Chinese (8), Japanese (2), 30 minutes or less (5), vegetarian (1)." under the
 * count, from the results themselves. Each is a filter the row above also has; this just
 * says which ones would do something here. Not shown when the list is short or loose.
 */
function renderNarrow(hits: Hit[], loose: boolean) {
  const el = $('narrow');
  const facets =
    loose || state.picked >= 0
      ? []
      : narrowFacets(hits.map((h) => h.r), {
          set: state,
          vegetarian: state.diet || hits.length < 6 ? 0 : countWith({ diet: 'vegetarian' }),
        });
  el.hidden = !facets.length;
  if (!facets.length) return;
  el.innerHTML = `Narrow it: ${facets
    .map((f) => `<button type="button" data-narrow="${f.kind}:${esc(f.value)}">${esc(f.label)}</button>&nbsp;<span class="n">(${f.n.toLocaleString()})</span>`)
    .join(', ')}.`;
}

/**
 * The index's dish phrases that are some recipe's whole name ("kung pao chicken", not "spicy
 * stir"), by the words a search matches on, each with how many recipes are named for it.
 * Worked out the first time a "Related" line is wanted.
 */
let dishes: Map<string, { say: string; n: number }> | null = null;
type Named = Recipe & { phrase: string; core: string[] };

/** The dishes a recipe's name holds: runs of two or three of its words that are in `dishes`. */
function dishesIn(r: Recipe): string[] {
  const ws = (r as Named).phrase.trim().split(' ');
  const out: string[] = [];
  for (const size of [3, 2])
    for (let i = 0; i + size <= ws.length; i++) {
      const key = ws.slice(i, i + size).join(' ');
      if (dishes!.has(key) && !out.includes(key)) out.push(key);
    }
  return out;
}

/**
 * "Related: twice cooked pork, kung pao chicken." after the results of a dish search: other
 * dishes whose recipes use what sets these results apart (for mapo tofu, doubanjiang and
 * salted black beans rather than garlic), in the same cuisine when the results mostly share
 * one. A dish is offered when a good part of all its recipes are among those. Worked out
 * here from the index; nothing is looked up anywhere. Often there's nothing worth offering,
 * and then there's no line.
 */
function relatedDishes(hits: Hit[], q: string[]): string[] {
  if (!data.phrases?.length || hits.length < 3) return [];
  if (!dishes) {
    const whole = new Set(recipes.map((r) => (r as Named).core.join(' ')));
    dishes = new Map();
    for (const p of data.phrases) {
      const key = words(p).filter((w) => !core.isFiller(w)).join(' ');
      // Not an ingredient's name ("soy sauce"), and a dish in its own right.
      if (whole.has(key) && core.ingredientFor(ready!, p) == null) dishes.set(key, { say: p, n: 0 });
    }
    for (const r of recipes) for (const key of dishesIn(r)) dishes.get(key)!.n++;
  }
  const top = hits.slice(0, 20);
  const tally = <T,>(xs: T[]) => {
    const m = new Map<T, number>();
    for (const x of xs) m.set(x, (m.get(x) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  // The cuisine most of the top results share, and up to three ingredients that set them
  // apart: used by a good part of them, and at least three times as often as recipes in general.
  const [cuisine, n] = tally(top.map((h) => h.r.cuisine).filter(Boolean))[0] || ['', 0];
  const main = n * 2 >= top.length ? cuisine : '';
  const apart = tally(top.flatMap((h) => h.r.own))
    .filter(([, k]) => k >= Math.max(2, top.length / 4))
    .map(([p, k]) => [p, k / top.length / (ingRecipes[p] / recipes.length)] as const)
    .filter(([, lift]) => lift >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([p]) => p);
  if (!apart.length) return [];
  const found = new Set(hits.map((h) => h.r.i));
  const near = new Map<string, number>();
  for (const r of recipes) {
    if (found.has(r.i) || (main && r.cuisine !== main)) continue;
    // Without a shared cuisine to go by, one ingredient in common isn't enough.
    if (apart.filter((p) => r.pos.has(p)).length < (main ? 1 : Math.min(2, apart.length))) continue;
    for (const key of dishesIn(r)) if (!q.some((w) => key.split(' ').includes(w))) near.set(key, (near.get(key) || 0) + 1);
  }
  const ranked = [...near]
    .filter(([key, k]) => k >= 2 && k / dishes!.get(key)!.n >= 0.25)
    .map(([key, k]) => [key, (k / dishes!.get(key)!.n) * Math.log2(1 + k)] as const)
    .sort((a, b) => b[1] - a[1]);
  const out: string[] = [];
  for (const [key] of ranked) {
    if (out.length === 4) break;
    // "fried rice" and "egg fried rice" are one idea: the first one stands.
    const ws = key.split(' ');
    if (!out.some((k) => k.split(' ').some((w) => ws.includes(w)))) out.push(key);
  }
  return out.length > 1 ? out.map((k) => dishes!.get(k)!.say) : [];
}

function renderRelated(hits: Hit[], q: string[]) {
  const el = $('related');
  const dishes = q.length && !state.keep && state.picked < 0 ? relatedDishes(hits, q) : [];
  el.hidden = !dishes.length;
  if (!dishes.length) return;
  el.innerHTML = keepPunct(`Related: ${dishes.map((d, n) => `<button type="button" data-related="${esc(d)}" data-pos="${n + 1}">${esc(d)}</button>`).join(', ')}.`);
}

/** The home page's line to what's saved: "Or pick up your 3 saved recipes." Hidden when nothing is. */
function renderKeptLine() {
  const n = stored.read('saved').length;
  $('kept-line').hidden = !n;
  if (n) $('kept-line').innerHTML = `Or go back to <a href="/?saved=1" data-saved-view="home">your ${n === 1 ? 'saved recipe' : `${n.toLocaleString()} saved recipes`}</a>.`;
}

function renderAlso() {
  const term = state.q || state.with.map(ingName).join(' ');
  if (!term || !data.linkOnly.length) return;
  const links = data.linkOnly.map(
    (l) => `<a href="${esc(l.search.replace('{q}', encodeURIComponent(term)))}" data-other="${esc(l.name)}">${esc(l.name)}</a>`,
  );
  const also = $('also');
  also.hidden = false;
  also.innerHTML = `Not here? Search ${orList(links)} for “${esc(term)}”.`;
}

/**
 * Under a creator's first recipe on the page: "Support them: Patreon or their books Hot Thai
 * Kitchen and Sabai. More ways". Links are already sorted most helpful first (join, buy, follow);
 * the free ones stay on their page, which the last link opens.
 */
function supportLine(id: string, from = 'results'): string {
  const all = (data.support[id] || []).filter((l) => l.kind !== 'follow');
  const page = `<a href="/creators/${esc(id.replace(/-yt$/, ''))}/" data-creator-page="${esc(id)}" data-from="${from}">${all.length ? 'More ways' : 'About them'}</a>`;
  if (!all.length) return creatorById.get(id) && from !== 'results' ? `<p class="support">${page}.</p>` : '';
  const a = (l: SupportLink) =>
    `<a href="${esc(l.url)}" data-support="${esc(id)}" data-kind="${l.book ? 'book' : l.kind === 'buy' ? 'shop' : l.kind}" data-from="${from}">${l.book ? `<cite>${esc(l.label)}</cite>` : esc(l.label)}</a>`;
  const links = all.filter((l) => !l.book).map(a);
  const books = all.filter((l) => l.book).map(a);
  const bookPart = books.length ? `${books.length === 1 ? 'their book' : 'their books'} ${andList(books)}` : '';
  return `<p class="support">Support them: ${orList([...links, bookPart].filter(Boolean))}. ${page}.</p>`;
}

// ---------------------------------------------------------------------------------------
// Pick one at random: from what you're looking at, or from everything.

function pickRandom() {
  const pool = isBlank() ? recipes.map((r) => ({ r })) : search();
  if (!pool.length) return;
  let next = pool[Math.floor(Math.random() * pool.length)].r.i;
  if (pool.length > 1 && next === state.picked) next = pool[(pool.findIndex((h) => h.r.i === next) + 1) % pool.length].r.i;
  const first = state.picked < 0;
  state.picked = next;
  render();
  // The pick goes in the address (&pick=), so it can be reloaded or shared. "Pick another"
  // replaces it instead of filling Back with picks.
  writeUrl(first, true);
  const box = $('picked');
  box.focus({ preventScroll: true });
  box.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  track('Picked Random Recipe', {
    source: recipes[next].src.id,
    pool_size: pool.length,
    ingredient_count: state.with.length,
  });
}

function renderPicked() {
  const box = $('picked');
  if (state.picked < 0) {
    box.hidden = true;
    return;
  }
  const r = recipes[state.picked];
  const used = state.with.filter((p) => r.pos.has(p));
  const missing = r.own.filter((p) => !covers(state.with, p)).length;
  $('picked-card').innerHTML = row({ r, score: 0, used, missing }, 0, [], 'random') + supportLine(r.src.id, 'random');
  box.hidden = false;
}

// ---------------------------------------------------------------------------------------
// Filters: words that open a menu of native radios and checkboxes.

function buildFilters() {
  $('f-site-options').innerHTML = creators
    .map(
      (c) =>
        `<label><input type="checkbox" name="site" value="${esc(c.id)}"> ${esc(c.name)} <span class="count"></span></label>`,
    )
    .join('');
  $('f-show-options').innerHTML = (
    [
      ['', 'Recipes and videos'],
      ['recipes', 'Recipes'],
      ['videos', 'Videos'],
    ] as const
  )
    .map(([v, label]) => `<label><input type="radio" name="show" value="${v}"> ${label} <span class="count"></span></label>`)
    .join('');
  $('f-time-options').innerHTML = [0, ...TIMES]
    .map(
      (t) => `<label><input type="radio" name="time" value="${t}"> ${t ? `${t} minutes or less` : 'Any time'} <span class="count"></span></label>`,
    )
    .join('');
  $('f-cuisine-options').innerHTML = [['', 0] as [string, number], ...data.cuisines]
    .map(([c]) => `<label><input type="radio" name="cuisine" value="${esc(c)}"> ${c ? esc(c) : 'Any cuisine'} <span class="count"></span></label>`)
    .join('');

  $('f-course-options').innerHTML = [['', 'Any course'], ...(data.courses || []).map(([id, label]) => [id, label])]
    .map(([id, label]) => `<label><input type="radio" name="course" value="${esc(id)}"> ${esc(label)} <span class="count"></span></label>`)
    .join('');
  $('f-diet-options').innerHTML = [['', 'Any diet'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan']]
    .map(([v, label]) => `<label><input type="radio" name="diet" value="${v}"> ${label} <span class="count"></span></label>`)
    .join('');
  $('f-order-options').innerHTML = ORDERS.map(
    ([v, label]) => `<label><input type="radio" name="order" value="${v}"> ${label[0].toUpperCase()}${label.slice(1)} <span class="count"></span></label>`,
  ).join('');

  for (const pop of document.querySelectorAll<HTMLElement>('.pop')) {
    // A tap or click, as opposed to arrowing through the options with the keyboard.
    let pointed = 0;
    pop.addEventListener('pointerup', () => (pointed = performance.now()));
    pop.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.name === 'site') el.checked ? state.sites.add(el.value) : state.sites.delete(el.value);
      if (el.name === 'time') state.time = Number(el.value);
      if (el.name === 'cuisine') state.cuisine = el.value;
      if (el.name === 'course') state.course = el.value;
      if (el.name === 'show') state.show = el.value as typeof state.show;
      if (el.name === 'diet') state.diet = el.value as typeof state.diet;
      if (el.name === 'order') state.sort = el.value as typeof state.sort;
      state.shown = PAGE;
      // Words typed but not yet searched are searched too, so the box and the results agree.
      commitBox();
      // On a phone a filter that's set moves to the front of the row: show the front.
      document.querySelector('.filters')!.scrollLeft = 0;
      // One search: the menu's own counts don't change with its own choice, and the event
      // takes its count from what was just drawn.
      render();
      writeUrl(false);
      // Which filters people reach for, and what they pick (ids and labels, never typed text).
      track('Changed Filter', { filter_name: el.name, filter_value: el.name === 'site' ? (el.checked ? el.value : '') : el.value, result_count: lastHits.length });
      remember();
      // A menu with one choice has done its job once it's picked. Arrowing through it with
      // the keyboard keeps it open (each arrow is a change); Escape or Done closes it then.
      if (el.type === 'radio' && performance.now() - pointed < 700) pop.hidePopover();
    });
    // Phones: the menu is a sheet over a dimmed page. A tap on the dimmed part lands on the
    // sheet's backdrop, so it closes the sheet and never reaches the result underneath.
    pop.addEventListener('click', (e) => {
      if (e.target !== pop) return;
      const r = pop.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) pop.hidePopover();
    });
    // Closing a sheet by tapping the page behind it must not also press what was under the
    // finger. Some browsers hand that tap to the page once the sheet is gone, so the click
    // that follows a sheet closing is dropped unless it was on the menus themselves.
    pop.addEventListener('beforetoggle', (e) => {
      if ((e as ToggleEvent).newState === 'closed') sheetClosed = performance.now();
    });
    // Open under its word on wider screens; on phones CSS makes it a sheet at the bottom.
    pop.addEventListener('toggle', (e) => {
      if ((e as ToggleEvent).newState !== 'open') return;
      updateCounts(pop);
      if (phone()) return;
      const btn = document.querySelector<HTMLElement>(`[popovertarget="${pop.id}"]`)!;
      const r = btn.getBoundingClientRect();
      pop.style.inset = 'auto';
      pop.style.top = `${r.bottom + 6}px`;
      pop.style.left = `${Math.max(16, Math.min(r.left, innerWidth - pop.offsetWidth - 16))}px`;
    });
  }
  addEventListener(
    'scroll',
    () => {
      if (phone()) return;
      document.querySelectorAll<HTMLElement>('.pop:popover-open').forEach((p) => p.hidePopover());
    },
    { passive: true },
  );
}

let sheetClosed = -1e9;
addEventListener(
  'click',
  (e) => {
    if (!phone() || performance.now() - sheetClosed > 500) return;
    if ((e.target as HTMLElement).closest?.('.pop, .filters')) return;
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);

/** Each option's count, given everything else you've picked, so "Thai 12" means 12 here. */
function updateCounts(pop: HTMLElement) {
  if (pop.id === 'f-show') {
    const was = state.show;
    const n = (show: typeof state.show) => {
      state.show = show;
      const r = show === 'videos' ? 0 : search().length;
      const v = show === 'recipes' ? 0 : searchVideos().length;
      return (show === 'recipes' ? r : show === 'videos' ? v : r + v).toLocaleString(); // a number, like the other menus
    };
    for (const label of pop.querySelectorAll('label')) label.querySelector('.count')!.textContent = n(label.querySelector('input')!.value as typeof state.show);
    state.show = was;
    return;
  }
  if (pop.id === 'f-order') return; // an order changes no counts
  if (pop.id === 'f-diet') {
    for (const label of pop.querySelectorAll('label'))
      label.querySelector('.count')!.textContent = countWith({ diet: label.querySelector('input')!.value as typeof state.diet }).toLocaleString();
    return;
  }
  const kind = pop.id.slice(2) as Skip;
  const hits = isBlank() ? recipes.map((r) => ({ r })) : search({ skip: kind });
  const vids = kind === 'site' ? (state.q ? searchVideos({ skip: 'site' }) : data.videos.rows) : [];
  for (const label of pop.querySelectorAll('label')) {
    const el = label.querySelector('input')!;
    let text = '';
    if (kind === 'site') {
      const n = hits.filter((h) => h.r.src.id === el.value).length;
      const v = creatorById.get(el.value)!.recipes ? 0 : vids.filter((x) => creatorOfChannel(x[0]) === el.value).length;
      text = v ? plural(v, 'video') : n.toLocaleString();
    }
    if (kind === 'time')
      text = (Number(el.value) ? hits.filter((h) => h.r.min != null && h.r.min <= Number(el.value)).length : hits.length).toLocaleString();
    if (kind === 'cuisine') text = (el.value ? hits.filter((h) => h.r.cuisine === el.value).length : hits.length).toLocaleString();
    if (kind === 'course') text = (el.value ? hits.filter((h) => h.r.course === el.value).length : hits.length).toLocaleString();
    label.querySelector('.count')!.textContent = text;
  }
  // Cuisines: the ones this search has most of come first, and the ones it has none of are
  // folded away (the one that's chosen always shows).
  if (kind === 'cuisine') {
    const n = (label: Element) => Number(label.querySelector('.count')!.textContent!.replace(/\D/g, ''));
    const labels = [...pop.querySelectorAll('label')];
    const [any, ...rest] = labels;
    rest.sort((a, b) => n(b) - n(a) || (a.textContent! < b.textContent! ? -1 : 1));
    for (const label of rest) label.hidden = !n(label) && !label.querySelector('input')!.checked;
    any.parentElement!.append(any, ...rest);
  }
}

function renderFilterButtons() {
  const site =
    state.sites.size === 1 ? creatorById.get([...state.sites][0])?.name || '' : state.sites.size ? `${state.sites.size} creators` : '';
  const set = (id: string, value: string) => {
    $(`${id}-value`).textContent = value || 'any';
    $(`${id}-btn`).toggleAttribute('data-active', !!value);
  };
  set('f-site', site);
  set('f-time', state.time ? `${fmtTime(state.time)} or less` : '');
  set('f-cuisine', state.cuisine);
  set('f-course', (data.courses || []).find(([id]) => id === state.course)?.[1].toLowerCase() || '');
  set('f-show', state.show === 'recipes' ? 'recipes only' : state.show === 'videos' ? 'videos only' : '');
  $('f-show-value').textContent = state.show ? $('f-show-value').textContent : 'recipes and videos';
  set('f-diet', state.diet);
  set('f-order', state.sort ? ORDERS.find(([v]) => v === state.sort)![1] : '');
  $('f-order-value').textContent = state.sort ? $('f-order-value').textContent : 'best match';
  for (const el of document.querySelectorAll<HTMLInputElement>('.pop input')) {
    if (el.name === 'site') el.checked = state.sites.has(el.value);
    if (el.name === 'time') el.checked = Number(el.value) === state.time;
    if (el.name === 'cuisine') el.checked = el.value === state.cuisine;
    if (el.name === 'course') el.checked = el.value === state.course;
    if (el.name === 'show') el.checked = el.value === state.show;
    if (el.name === 'diet') el.checked = el.value === state.diet;
    if (el.name === 'order') el.checked = el.value === state.sort;
  }
  $('clear-all').hidden = isBlank();
}

// ---------------------------------------------------------------------------------------
// Ideas under the box on the home page

/** Keeps the comma or period after a word button on the button's line. */
const keepPunct = (html: string) => html.replace(/(<button[^>]*>[^<]*<\/button>[,.])/g, '<span class="keep">$1</span>');

function buildStart() {
  // Totals, not names: the list of creators is under the box and on the About page.
  $('from').textContent = `${plural(data.recipes.length, 'recipe')} and ${plural(data.videos.sources.reduce((n, c) => n + c.count, 0), 'video')} from ${creators.length} creators. Every one opens on its creator’s own site.`;
  // Every line is a fresh draw on each visit: four dishes, five of the 18 most-used
  // ingredients and two creators. New this week moved to the footer (Kyle, 2026-11-16).
  const tries: string[] = [];
  for (const t of pickSome(TRY, TRY.length)) {
    if (tries.length === TRY_SHOWN) break;
    if (search({ q: t, with: [] }).length >= TRY_MIN) tries.push(`<button type="button" data-try="${esc(t)}">${esc(t)}</button>`);
  }
  $('try').innerHTML = keepPunct(`Try ${orList(tries)}.`);
  const pop = pickSome(data.popular, POPULAR_SHOWN).map((p) => `<button type="button" data-add="${p}">${esc(ingName(p))}</button>`);
  $('popular').innerHTML = keepPunct(`Or start with what you have: ${orList(pop)}.`);
  // Two creators, not all of them: the full list (with ways to support each) is on About.
  const who = pickSome(creators, 2).map((c) => `<button type="button" data-creator="${esc(c.id)}">${esc(c.name)}</button>`);
  $('creators').innerHTML = keepPunct(
    `Or start with a creator, like ${orList(who)}. <a href="/creators/">See all ${creators.length}</a>.`,
  );
}

// ---------------------------------------------------------------------------------------
// Suggestions under the box (the ARIA combobox pattern: focus stays in the field, arrows
// move the highlighted option, Enter picks it). Creators and ingredients first, as things
// to add; then recipes to open; then a plain search for the words.

type Option =
  | { kind: 'not'; p: number }
  | { kind: 'creator'; c: Creator }
  | { kind: 'cuisine'; c: string; n: number }
  | { kind: 'ing'; p: number }
  // A common dish that finishes what's typed ("map" -> "mapo tofu"), from the index's phrases.
  | { kind: 'complete'; phrase: string; at: number; length: number; n: number }
  | { kind: 'recipe'; h: Hit; n: number }
  | { kind: 'all'; n: number; text: string }
  // With Ask on: send what's typed to Ask, or search the words here instead.
  | { kind: 'ask'; text: string }
  | { kind: 'words'; text: string };

const suggest = {
  options: [] as Option[],
  active: -1,
  panel: $('q-panel'),
  list: $('q-list'),
  kept: $('q-kept'),

  open() {
    const text = qInput.value.trim();
    if (!data) return this.close();
    // An empty box with no tags: what's kept on this device (recent searches, recipes
    // opened lately, saved recipes), if there is any.
    if (!text) return tagList().length ? this.close() : this.showKept();
    this.kept.hidden = true;
    this.options = buildOptions(text);
    if (!this.options.length) return this.close();
    this.active = -1;
    // Grouped by what picking one does, each group named for screen readers: things that
    // join the search, recipes that open on their own site, then the plain search.
    const option = (o: Option, n: number) =>
      `<span role="option" id="q-opt-${n}" aria-selected="false" data-n="${n}" data-kind="${o.kind}">${optionLabel(o, text)}</span>`;
    const group = (label: string, kinds: Option['kind'][]) => {
      const inside = this.options.map((o, n) => (kinds.includes(o.kind) ? option(o, n) : '')).join('');
      return inside ? `<div role="group" aria-label="${label}">${inside}</div>` : '';
    };
    this.list.innerHTML =
      group('Ask or search', ['ask', 'words']) +
      group('Add to your search', ['not', 'creator', 'cuisine', 'ing']) +
      group('Dishes to search for', ['complete']) +
      group('Recipes, each opens on its own site', ['recipe']) +
      this.options.map((o, n) => (o.kind === 'all' ? option(o, n) : '')).join('');
    this.panel.hidden = false;
    qInput.setAttribute('aria-expanded', 'true');
    qInput.removeAttribute('aria-activedescendant');
    // Said once typing pauses, so a screen reader isn't interrupted on every letter.
    clearTimeout(this.counting);
    const n = this.options.length;
    this.counting = window.setTimeout(() => !this.panel.hidden && say(`${plural(n, 'suggestion')}. Use the arrow keys to hear them.`), 700);
  },

  /**
   * Under the empty box: recent searches (each one removable), recipes opened lately and
   * the way to what's saved. Real links and buttons, reached with Tab or the down arrow, so
   * removing one works with a keyboard, a finger or a screen reader alike.
   */
  showKept(announce = true) {
    const html = keptHtml();
    if (!html) return this.close();
    this.list.innerHTML = '';
    this.options = [];
    this.active = -1;
    this.kept.innerHTML = html;
    this.kept.hidden = false;
    const was = this.panel.hidden;
    this.panel.hidden = false;
    qInput.setAttribute('aria-expanded', 'false');
    qInput.removeAttribute('aria-activedescendant');
    if (was && announce) say('Your recent searches and saved recipes are listed below. Tab or the down arrow reaches them.');
  },

  close() {
    clearTimeout(this.counting);
    this.kept.hidden = true;
    this.kept.innerHTML = '';
    this.panel.hidden = true;
    // Nothing stays marked as chosen once the list is closed.
    this.list.innerHTML = '';
    qInput.setAttribute('aria-expanded', 'false');
    qInput.removeAttribute('aria-activedescendant');
    this.options = [];
    this.active = -1;
  },
  counting: 0,

  move(by: number) {
    if (this.panel.hidden) return this.open();
    // The kept lists are links and buttons, not options: the arrows walk through them.
    if (!this.kept.hidden) {
      const stops = [...this.kept.querySelectorAll<HTMLElement>('a, button')];
      const at = stops.indexOf(document.activeElement as HTMLElement);
      const next = at + by;
      return void (next < 0 ? qInput : stops[Math.min(next, stops.length - 1)] || qInput).focus();
    }
    const last = this.options.length - 1;
    this.active = by > 0 ? (this.active >= last ? 0 : this.active + 1) : this.active <= 0 ? last : this.active - 1;
    for (const el of this.list.querySelectorAll('[role="option"]')) el.setAttribute('aria-selected', String(el.id === `q-opt-${this.active}`));
    qInput.setAttribute('aria-activedescendant', `q-opt-${this.active}`);
    $(`q-opt-${this.active}`).scrollIntoView({ block: 'nearest' });
  },
};

const creatorMatches = (text: string): Creator[] => core.creatorMatches(ready!, text, state.sites);

/** Cuisines whose name starts with what's typed: "tha" -> Thai. */
const cuisineMatches = (text: string): [string, number][] => {
  const qs = words(text.replace(/\b(food|cuisine|recipes?|cooking)\b/gi, '')).join(' ');
  if (qs.length < 3) return [];
  return data.cuisines.filter(([c]) => c !== state.cuisine && words(c).join(' ').startsWith(qs));
};

const ingMatches = (text: string): number[] => {
  const qs = words(text).join(' ');
  if (!qs) return [];
  const quality = (p: number) => (ingNames[p].some((n) => n === qs) ? 3 : ingNames[p].some((n) => n.startsWith(qs)) ? 2 : 1);
  return data.ing
    .map((_, p) => p)
    .filter((p) => !state.with.includes(p) && ingRecipes[p] > 0 && ingNames[p].some((n) => n.startsWith(qs) || n.includes(` ${qs}`)))
    .sort((a, b) => quality(b) - quality(a) || ingRecipes[b] - ingRecipes[a]);
};

function buildOptions(text: string): Option[] {
  // With Ask on, a question gets two choices and nothing else: send it to Ask (and say
  // where it goes before it's sent), or search the words here. No unrelated suggestions.
  const fromAsk = !!app.dataset.fromAsk;
  if (askReady && looksLikeAsk(text)) return [{ kind: 'ask', text }, { kind: 'words', text }];
  // While Ask's results are up, what's typed carries on that chat unless something else is picked.
  if (askReady && fromAsk) return [{ kind: 'ask', text }, { kind: 'words', text }, ...plainOptions(text).filter((o) => o.kind !== 'all')];
  return plainOptions(text);
}

function plainOptions(text: string): Option[] {
  // "no pork", "without pea…": offer to leave an ingredient out.
  const not = text.match(/^(?:no|without|not)\s+(.{2,})$/i);
  if (not) {
    const ps = ingMatches(not[1]).filter((p) => !state.without.includes(p)).slice(0, 4);
    if (ps.length) return ps.map((p) => ({ kind: 'not' as const, p }));
  }
  const out: Option[] = creatorMatches(text)
    .slice(0, 2)
    .map((c) => ({ kind: 'creator' as const, c }));
  out.push(...cuisineMatches(text).slice(0, 1).map(([c, n]) => ({ kind: 'cuisine' as const, c, n })));
  if (text.length > 1) out.push(...ingMatches(text).slice(0, 3).map((p) => ({ kind: 'ing' as const, p })));
  out.push(...completions(data.phrases, text).map((c, n) => ({ kind: 'complete' as const, ...c, n: n + 1 })));
  // While typing, the last word can be the start of one ("dumpl"); after Enter, words are whole.
  const hits = search({ q: text, typing: true });
  out.push(...hits.slice(0, 4).map((h, n) => ({ kind: 'recipe' as const, h, n: n + 1 })));
  if (hits.length) out.push({ kind: 'all', n: hits.length, text });
  return out;
}

function optionLabel(o: Option, text: string): string {
  if (o.kind === 'ask')
    return `<span class="opt-text"><span class="opt-name">Ask: ${esc(o.text)}</span><span class="opt-meta">Sent to Claude to turn into a search. Not kept.</span></span>`;
  if (o.kind === 'words')
    return `<span class="opt-text"><span class="opt-name">Search for these words</span><span class="opt-meta">Searched here, on your device.</span></span>`;
  if (o.kind === 'not')
    return `<span class="opt-text"><span class="opt-name">No ${esc(ingName(o.p))}</span><span class="opt-meta">Leave out recipes that use it</span></span>`;
  if (o.kind === 'complete') {
    // The typed part is marked, like the words in a recipe's name below.
    const [a, b, c] = [o.phrase.slice(0, o.at), o.phrase.slice(o.at, o.at + o.length), o.phrase.slice(o.at + o.length)];
    return `<span class="opt-text"><span>${esc(a)}<mark>${esc(b)}</mark>${esc(c)}</span><span class="opt-meta">Search for this dish</span></span>`;
  }
  const qs = words(text).join(' ');
  if (o.kind === 'creator') {
    const has = [o.c.recipes ? plural(o.c.recipes, 'recipe') : '', o.c.videos ? plural(o.c.videos, 'video') : ''].filter(Boolean);
    return `<span class="opt-text"><span class="opt-name">${esc(o.c.name)}</span><span class="opt-meta">Creator, ${andList(has)}</span></span>`;
  }
  if (o.kind === 'cuisine')
    return `<span class="opt-text"><span class="opt-name">${esc(o.c)} cuisine</span><span class="opt-meta">Cuisine, ${plural(o.n, 'recipe')}</span></span>`;
  if (o.kind === 'ing') {
    // When it matched another name ("thai ginger" for galangal), say so.
    const others = data.ing[o.p].slice(4) as string[];
    const main = ingNames[o.p][0];
    const via =
      main.startsWith(qs) || main.includes(` ${qs}`)
        ? ''
        : others.find((_, k) => ingNames[o.p][k + 1].startsWith(qs) || ingNames[o.p][k + 1].includes(` ${qs}`)) || '';
    return `<span class="opt-text"><span class="opt-name">${esc(ingName(o.p))}${via ? ` <span class="opt-meta">(${esc(via)})</span>` : ''}</span><span class="opt-meta">Ingredient, in ${plural(
      ingRecipes[o.p],
      'recipe',
    )}</span></span>`;
  }
  if (o.kind === 'recipe') {
    const r = o.h.r;
    const thumb = r.img
      ? `<img class="opt-thumb" src="${esc(r.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" width="44" height="44">`
      : `<span class="opt-thumb" aria-hidden="true"></span>`;
    return `${thumb}<span class="opt-text"><span>${highlight(r.name, words(text))}</span><span class="opt-meta"><span class="visually-hidden">Opens on </span>${esc(r.src.name)}${
      r.min ? `, ${fmtTime(r.min)}` : ''
    }</span></span>`;
  }
  return `<span class="opt-text"><span class="opt-name">Search for “${esc(o.text)}”</span><span class="opt-meta">${plural(o.n, 'recipe')}</span></span>`;
}

function choose(n: number) {
  const o = suggest.options[n];
  if (!o) return;
  if (o.kind === 'ask' || o.kind === 'words') {
    // The person's own choice between Ask and a plain search (never what they typed).
    track(o.kind === 'ask' ? 'Chose Ask' : 'Chose Plain Search', { follow_up: !!app.dataset.fromAsk });
    submit(o.kind === 'ask' ? 'ask' : 'plain');
  } else if (o.kind === 'not') {
    qInput.value = '';
    if (!state.without.includes(o.p)) state.without.push(o.p);
    spoken = `Added no ${ingName(o.p)}.`;
    afterTag();
    qInput.focus();
  } else if (o.kind === 'creator') {
    qInput.value = '';
    addCreator(o.c.id, 'suggestions');
    qInput.focus();
  } else if (o.kind === 'cuisine') {
    qInput.value = '';
    state.cuisine = o.c;
    spoken = `Added ${o.c} cuisine.`;
    afterTag();
    track('Added Cuisine', { cuisine: o.c, added_from: 'suggestions' });
    qInput.focus();
  } else if (o.kind === 'ing') {
    qInput.value = '';
    addIngredient(o.p, 'suggestions');
    qInput.focus();
  } else if (o.kind === 'complete') {
    // Which place in the list was picked and how much had been typed; never the words.
    track('Used Completion', { position: o.n, typed_length: o.length });
    qInput.value = o.phrase;
    submit('plain');
  } else if (o.kind === 'recipe') {
    openedRecipe(o.h.r.src.id, o.n, 'suggestions', o.h.r.key);
    location.href = o.h.r.url;
  } else submit();
}

// ---------------------------------------------------------------------------------------
// Kept on this device: what shows under the empty box, and what goes into the lists.

/** A remembered search (a query string, as stored) read back as a search. */
const askedFrom = (key: string): Asked => parse(new URLSearchParams(key));

function keptHtml(): string {
  const recent = stored.read('recent').map((key) => ({ key, label: labelOf(askedFrom(key)) })).filter((r) => r.label);
  const opened = stored
    .read('opened')
    .map((key) => recipes[keyIndex.get(key) ?? -1])
    .filter(Boolean)
    .slice(0, 5);
  const saved = stored.read('saved').length;
  if (!recent.length && !opened.length && !saved) return '';
  const part = (id: string, title: string, items: string[], after = '') =>
    items.length ? `<section aria-labelledby="${id}"><h2 id="${id}">${title}</h2><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>${after}</section>` : '';
  return (
    part(
      'kept-recent',
      'Recent searches',
      recent.map(
        (r, n) =>
          `<a href="/?${esc(r.key)}" data-recent="${n}">${esc(r.label)}</a><button type="button" class="forget" data-forget="${n}" aria-label="Remove ${esc(r.label)} from recent searches"><span aria-hidden="true">×</span></button>`,
      ),
      `<p><button type="button" data-forget="all">Clear recent searches</button></p>`,
    ) +
    part(
      'kept-opened',
      'Recently opened',
      opened.map(
        (r, n) =>
          `<a href="${esc(r.url)}" data-pos="${n + 1}" data-src-id="${esc(r.src.id)}" data-key="${esc(r.key)}" data-from="recent">${esc(r.name)}</a><span class="opt-meta">${esc(r.src.name)}</span>`,
      ),
    ) +
    (saved ? `<p class="kept-saved"><a href="/?saved=1" data-saved-view="panel">${saved === 1 ? 'Your saved recipe' : `Your ${saved.toLocaleString()} saved recipes`}</a></p>` : '')
  );
}

/** The search this visit last remembered, so a filter or tag added to it takes its place instead of adding a line. */
let recentNow = '';

/** Keeps the search on the page in the recent searches (on this device only). Ask's searches aren't kept. */
function remember() {
  if (!ready || isBlank() || app.dataset.fromAsk) return;
  const key = recentKey(queryOf(state).toString());
  if (!key) return;
  stored.write('recent', rememberSearch(stored.read('recent'), key, { refines: recentNow }));
  recentNow = key;
}

/** Shows a search that was handed over whole (a recent one, the saved view), as if it had been built here. */
function show(asked: Asked) {
  suggest.close();
  Object.assign(state, asked);
  state.list = false;
  state.picked = -1;
  state.shown = PAGE;
  qInput.value = state.q;
  render();
  writeUrl(true);
}

function toggleSaved(key: string, from: string, position: number) {
  const r = recipes[keyIndex.get(key) ?? -1];
  if (!r) return;
  const list = stored.read('saved');
  const on = !list.includes(key);
  stored.write('saved', on ? putFirst(list, key, KEEP.saved.max) : dropFrom(list, key));
  // Every copy of the button on the page (a result and the random pick can be the same recipe).
  for (const b of document.querySelectorAll<HTMLElement>('button[data-save]')) {
    if (b.dataset.save !== key) continue;
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('.save-word')!.textContent = on ? 'Saved' : 'Save';
  }
  renderKeptLine();
  say(on ? `Saved ${r.name}. It’s kept on this device.` : `Removed ${r.name} from your saved recipes.`);
  track(on ? 'Saved Recipe' : 'Removed Saved Recipe', {
    source: r.src.id,
    recipe_key: r.key,
    position,
    saved_from: from,
    saved_count: stored.read('saved').length,
  });
}

/** Puts text on the clipboard; false when the browser won't. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** "Share this search": the phone's share sheet where there is one, else the link is copied. */
async function shareSearch(btn: HTMLElement) {
  const url = location.href;
  let how = '';
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Findish', url });
      how = 'share';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // closed without sharing
    }
  }
  if (!how && (await copy(url))) how = 'copy';
  flash(btn, how === 'copy' ? 'Link copied' : how ? '' : 'Couldn’t copy the link');
  if (how) track('Shared Search', { share_method: how, result_count: lastHits.length });
}

/** Says what just happened on the button itself for a moment, and to screen readers. */
function flash(btn: HTMLElement, text: string) {
  if (!text) return;
  say(`${text}.`);
  const was = btn.dataset.was || btn.textContent || '';
  btn.dataset.was = was;
  btn.textContent = text;
  setTimeout(() => {
    btn.textContent = was;
    delete btn.dataset.was;
  }, 2000);
}

// ---------------------------------------------------------------------------------------
// Actions

/** What's in the box becomes the words searched, as it is (no tags made from it). */
function commitBox() {
  state.q = cleanQ(qInput.value);
}

/** Adding a tag keeps any words still in the box as words, and searches. */
function afterTag() {
  suggest.close();
  commitBox();
  state.exact = false; // "search for exactly this" was about the words before the tag
  state.shown = PAGE;
  state.picked = -1;
  render();
  writeUrl(true);
  searched();
}

function addIngredient(p: number, from: string) {
  if (!state.with.includes(p)) state.with.push(p);
  spoken = `Added ${ingName(p)}.`;
  afterTag();
  track('Added Ingredient', { ingredient_id: data.ing[p][0], added_from: from });
}

function addCreator(id: string, from: string) {
  state.sites.add(id);
  spoken = `Added ${creatorById.get(id)?.name || 'creator'}.`;
  afterTag();
  track('Added Creator', { creator_id: id, added_from: from });
}

/** Whether the person has picked Ask themselves this visit; from then on Enter may ask. */
const askChosen = {
  get: () => {
    try {
      return sessionStorage.getItem('findish-ask-chosen') === '1';
    } catch {
      return false;
    }
  },
  set: () => {
    try {
      sessionStorage.setItem('findish-ask-chosen', '1');
    } catch {
      // Private mode: Enter keeps searching here, and the Ask option is still offered.
    }
  },
};

/**
 * Search for what's in the box. `how` is 'enter' for the Enter key or the button, 'ask'
 * when the person picked "Ask: …", and 'plain' for "Search for these words".
 */
function submit(how: 'enter' | 'ask' | 'plain' = 'enter') {
  // The recipes haven't loaded yet: keep what's typed, say so, and search once they have.
  if (!ready) {
    if (!qInput.value.trim() || app.dataset.state !== 'loading') return;
    submitWaiting = true;
    page.dataset.mode = 'results';
    statusEl.textContent = 'Loading the recipes…';
    return;
  }
  submitWaiting = false;
  suggest.close();
  const fromAsk = !!app.dataset.fromAsk;
  // With Ask on, what's typed goes to Ask (src/scripts/chat.ts) only when the person chose
  // that: see goesToAsk(). The suggestions say where it goes before it's sent.
  const text = qInput.value.trim();
  if (goesToAsk({ on: askReady, how, text, fromAsk, question: looksLikeAsk(text), chosen: askChosen.get() })) {
    if (how === 'ask') askChosen.set();
    dispatchEvent(new CustomEvent('findish:ask', { detail: { text } }));
    // On a phone the keyboard goes away and focus lands on Ask's line, which reads the answer out.
    if (phone()) document.querySelector<HTMLElement>('.ask-line')?.focus({ preventScroll: true });
    return;
  }
  // A new search typed over Ask's results starts clean: it doesn't keep the cuisine,
  // course or tags Ask had set.
  if (fromAsk && text) {
    clearAll();
    qInput.value = text;
  }
  // Plain phrases become tags and filters ("no pork", "under 30 minutes"); the rest stays words.
  const before = state.q;
  takeIn(understand(qInput.value));
  // Different words are a new search to remember, not a step in the last one.
  if (before && before !== state.q) recentNow = '';
  qInput.value = state.q;
  state.shown = PAGE;
  state.picked = -1;
  render();
  writeUrl(true);
  searched();
  // On a phone the keyboard goes away and focus lands on the count, so a screen reader
  // reads how many were found (focus used to fall back to the top of the page).
  if (phone()) statusEl.focus({ preventScroll: true });
}

/** Adds what a sentence asked for to the search: its tags and filters, and the words left over. */
function takeIn(u: Understood) {
  for (const p of u.with) if (!state.with.includes(p)) state.with.push(p);
  for (const p of u.without) if (!state.without.includes(p)) state.without.push(p);
  for (const w of u.notWords) if (!state.notWords.includes(w)) state.notWords.push(w);
  for (const id of u.sites) state.sites.add(id);
  if (u.time) state.time = u.time;
  if (u.diet) state.diet = u.diet;
  if (u.cuisine) state.cuisine = u.cuisine;
  if (u.course) state.course = u.course;
  if (u.show) state.show = u.show;
  state.exact = false;
  state.list = false;
  state.q = cleanQ(u.q);
}

function searched() {
  if (isBlank()) return;
  remember();
  track('Searched Recipes', {
    search_type: state.q && state.with.length ? 'both' : state.q ? 'words' : state.with.length ? 'ingredients' : state.sites.size ? 'creator' : 'filters',
    ingredient_count: state.with.length,
    creator_count: state.sites.size,
    filter_count: filterCount(),
    result_count: lastHits.length,
  });
}

function openedRecipe(source: string, position: number, from: string, key = '') {
  // Kept on this device, for "Recently opened" under the empty box.
  if (key) stored.write('opened', putFirst(stored.read('opened'), key, KEEP.opened.max));
  // recipe_key ("woks:/mapo-tofu/") is what the daily popularity count adds up.
  track('Opened Recipe', {
    source,
    position,
    opened_from: from,
    ingredient_count: state.with.length,
    ...(key ? { recipe_key: key } : {}),
    // The results came from Ask (src/scripts/chat.ts) and nothing was changed since.
    ...(app.dataset.fromAsk ? { from_ask: true } : {}),
  });
}

// ---------------------------------------------------------------------------------------
// URL state

/** The address for the search on the page. `keepAsk`: this isn't the person changing the search (a random pick), so Ask's chat carries on. */
function writeUrl(push: boolean, keepAsk = false) {
  if (!keepAsk && app.dataset.fromAsk) {
    delete app.dataset.fromAsk; // the person changed the search, so it's theirs now
    qInput.placeholder = placeholder($('box').hasAttribute('data-tags'));
  }
  if (state.course !== 'side') state.sidesFor = '';
  const u = new URL(location.href);
  u.search = queryOf(state).toString();
  // A shared list rides in the fragment, which browsers never send to a server.
  u.hash = state.keep === 'list' ? listHash(state.listKeys) : '';
  if (state.picked >= 0) u.searchParams.set('pick', recipes[state.picked].key);
  if (u.href === location.href) return;
  // The entry being left remembers how far "Show more" and the scroll had got, for Back.
  if (push) saveView();
  entryShown = state.shown;
  history[push ? 'pushState' : 'replaceState']({ shown: state.shown }, '', u);
}

/** A search as address parameters (everything but a random pick and a shared list, which writeUrl adds). */
function queryOf(s: Asked): URLSearchParams {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.with.length) p.set('with', s.with.map((x) => data.ing[x][0]).join(','));
  if (s.sites.size) p.set('site', [...s.sites].join(','));
  if (s.time) p.set('time', String(s.time));
  if (s.cuisine) p.set('cuisine', s.cuisine);
  if (s.course) p.set('course', s.course);
  if (s.fresh) p.set('new', '1');
  if (s.show) p.set('show', s.show);
  if (s.without.length) p.set('without', s.without.map((x) => data.ing[x][0]).join(','));
  if (s.notWords.length) p.set('not', s.notWords.join(','));
  if (s.diet) p.set('diet', s.diet);
  if (s.sort) p.set('sort', s.sort);
  if (s.keep === 'saved') p.set('saved', '1');
  if (s.exact) p.set('exact', '1');
  if (s.sidesFor) p.set('sidesFor', s.sidesFor);
  return p;
}

/** Address parameters (and a shared list's fragment) read as a search. Anything the index doesn't know is dropped. */
function parse(p: URLSearchParams, hash = ''): Asked {
  const positions = (k: string) =>
    (p.get(k) || '')
      .split(',')
      .map((id) => ingById.get(id))
      .filter((x): x is number => x != null);
  const t = Math.round(Number(p.get('time')));
  const diet = p.get('diet');
  const c = p.get('cuisine') || '';
  const course = (data.courses || []).some(([id]) => id === p.get('course')) ? p.get('course')! : '';
  const show = p.get('show');
  const sort = p.get('sort');
  // A shared list (#list=…) holds recipe keys; ones the index no longer has are dropped.
  const listKeys = keysFromHash(hash).filter((k) => keyIndex.has(k));
  return {
    q: cleanQ(p.get('q') || ''),
    with: positions('with'),
    sites: new Set((p.get('site') || '').split(',').filter((id) => creatorById.has(id))),
    time: t > 0 && t <= 600 ? t : 0,
    without: positions('without'),
    notWords: (p.get('not') || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean),
    diet: diet === 'vegetarian' || diet === 'vegan' ? diet : '',
    sort: sort === 'quickest' || sort === 'newest' ? sort : '',
    keep: listKeys.length ? 'list' : p.get('saved') === '1' ? 'saved' : '',
    listKeys,
    exact: p.get('exact') === '1',
    cuisine: data.cuisines.some(([name]) => name === c) ? c : '',
    course,
    fresh: p.get('new') === '1' && !!data.fresh?.length,
    // Ask's "what goes with bulgogi" names the dish here. Letters only, and escaped when shown.
    sidesFor: course === 'side' ? dishName(p.get('sidesFor')) : '',
    show: show === 'recipes' || show === 'videos' ? show : '',
  };
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  Object.assign(state, parse(p, location.hash));
  state.shown = PAGE;
  state.picked = keyIndex.get(p.get('pick') || '') ?? -1;
}

// ---------------------------------------------------------------------------------------
// Events

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (suggest.active >= 0) return choose(suggest.active);
  submit();
});

qInput.addEventListener('input', () => {
  if (!ready) typedEarly = true;
  // A question for Ask keeps its commas ("fish, kimchi and onions"): it isn't a list of tags.
  const question = askReady && looksLikeAsk(qInput.value);
  // A comma finishes an ingredient (or a creator), like a tag field: "ginger, tofu, ". A
  // pasted list ("eggplant, tofu, scallions") makes a tag of each piece before its last
  // comma; what's after it stays in the box, and Enter carries on the list (understand()).
  if (ready && !question && qInput.value.includes(',')) {
    const pieces = qInput.value.split(',');
    const typing = pieces.pop()!.trim();
    const kept: string[] = [];
    const added: [string, string][] = [];
    const names: string[] = [];
    for (const piece of pieces) {
      const text = piece.replace(/^\s*(?:i\s+have|i['’]?ve\s+got|we\s+have|with|using)\s+/i, '').trim();
      if (!text) continue;
      const ing = core.ingredientFor(ready, text) ?? ingMatches(text)[0];
      const creator = ing == null ? creatorMatches(text)[0] : undefined;
      if (ing != null) {
        if (!state.with.includes(ing)) state.with.push(ing);
        added.push(['Added Ingredient', data.ing[ing][0]]);
        names.push(ingName(ing));
      } else if (creator) {
        state.sites.add(creator.id);
        added.push(['Added Creator', creator.id]);
        names.push(creator.name);
      } else kept.push(piece.trim());
    }
    if (added.length) {
      qInput.value = [...kept, typing].filter(Boolean).join(' ');
      spoken = `Added ${andList(names)}.`;
      afterTag();
      state.list = true;
      for (const [event, id] of added) track(event, { [event === 'Added Creator' ? 'creator_id' : 'ingredient_id']: id, added_from: 'typed' });
      return;
    }
  }
  suggest.open();
});
qInput.addEventListener('focus', () => suggest.panel.hidden && suggest.open());
qInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    suggest.move(e.key === 'ArrowDown' ? 1 : -1);
  } else if (e.key === 'Escape' && !suggest.panel.hidden) {
    e.preventDefault();
    suggest.close();
  } else if (e.key === 'Backspace' && ready && !qInput.value && qInput.selectionStart === 0) {
    // Backspace in an empty box takes off the tag added last, whatever kind it is. The box
    // is empty, so the words searched are too: the old words are never put back.
    const last = tagList().at(-1);
    if (!last) return;
    e.preventDefault();
    removeTag(last.key);
    spoken = `Removed ${last.label}.`;
    commitBox();
    state.shown = PAGE;
    render();
    writeUrl(false);
    remember();
  }
});
// Keep focus in the field when an option is clicked.
suggest.list.addEventListener('mousedown', (e) => e.preventDefault());
suggest.list.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
  if (el) choose(Number(el.dataset.n));
});
// The suggestions close when focus leaves the box (the kept lists under an empty box hold
// links and buttons, so focus can be in them).
$('box').addEventListener('focusout', () => setTimeout(() => !$('box').contains(document.activeElement) && suggest.close(), 0));
// A click in the kept lists keeps focus in the field, like a click on a suggestion.
suggest.kept.addEventListener('mousedown', (e) => e.preventDefault());
suggest.kept.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    suggest.move(e.key === 'ArrowDown' ? 1 : -1);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    qInput.focus();
    suggest.close();
  }
});

// "/" puts the cursor in the box from anywhere on the page that isn't a field.
addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  const el = e.target as HTMLElement;
  if (el.closest?.('input, textarea, select, [contenteditable]')) return;
  e.preventDefault();
  qInput.focus();
  qInput.select();
  track('Used Search Shortcut', { shortcut: 'slash' });
});
// Clicking the box's empty space puts the cursor in the field.
$('box').addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('button, input')) qInput.focus();
});

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button, a');
  if (!el) return;
  // An idea picked under "nothing found" replaces the search that found nothing.
  if ((el.dataset.add || el.dataset.creator || el.dataset.try) && ready && !$('empty').hidden) clearAll();
  if (el.dataset.save) return toggleSaved(el.dataset.save, el.dataset.from || 'results', Number(el.closest('.row')?.querySelector<HTMLElement>('[data-pos]')?.dataset.pos || 0));
  // A link in the kept lists opened in a new tab, or with the keyboard's own shortcut, is left to the browser.
  const plainClick = !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
  if (el.dataset.recent && ready && plainClick) {
    e.preventDefault();
    const list = stored.read('recent');
    const key = list[Number(el.dataset.recent)];
    if (!key) return;
    stored.write('recent', putFirst(list, key, KEEP.recent.max));
    recentNow = key;
    show(askedFrom(key));
    track('Opened Recent Search', { position: Number(el.dataset.recent) + 1, recent_count: list.length, result_count: lastHits.length });
    if (phone()) statusEl.focus({ preventScroll: true });
    return;
  }
  if (el.dataset.forget) {
    const list = stored.read('recent');
    const all = el.dataset.forget === 'all';
    stored.write('recent', all ? [] : dropFrom(list, list[Number(el.dataset.forget)]));
    recentNow = '';
    track(all ? 'Cleared Recent Searches' : 'Removed Recent Search', { recent_count: list.length });
    say(all ? 'Recent searches cleared.' : 'Removed from recent searches.');
    // The list is drawn again; focus stays where the person was working (the next one's
    // remove button when they were on one, else the box).
    const onButton = document.activeElement === el;
    suggest.showKept(false);
    const next = suggest.kept.querySelectorAll<HTMLElement>('[data-forget]')[all ? -1 : Number(el.dataset.forget)] || suggest.kept.querySelector<HTMLElement>('[data-forget]');
    (onButton && !suggest.panel.hidden && next ? next : qInput).focus();
    return;
  }
  if (el.dataset.savedView && ready && plainClick) {
    e.preventDefault();
    clearAll();
    show({ ...askedFrom(''), keep: 'saved' });
    track('Opened Saved Recipes', { opened_from: el.dataset.savedView, saved_count: stored.read('saved').length });
    (resultsEl.querySelector<HTMLElement>('.row a') || statusEl).focus();
    return;
  }
  if (el.dataset.narrow) {
    const at = el.dataset.narrow.indexOf(':');
    const [kind, value] = [el.dataset.narrow.slice(0, at), el.dataset.narrow.slice(at + 1)];
    if (kind === 'cuisine') state.cuisine = value;
    if (kind === 'time') state.time = Number(value);
    if (kind === 'diet') state.diet = value as typeof state.diet;
    state.shown = PAGE;
    commitBox();
    render();
    writeUrl(true);
    remember();
    // The link is gone with the old line: focus goes to the count, which is read out.
    statusEl.focus({ preventScroll: true });
    track('Opened Narrow Link', { narrow_kind: kind, narrow_value: value, result_count: lastHits.length });
    return;
  }
  if (el.dataset.related) {
    const dish = el.dataset.related;
    clearAll();
    qInput.value = dish;
    submit('plain');
    scrollTo(0, 0);
    statusEl.focus({ preventScroll: true });
    // The dish comes from the index's own list of phrases, not from anything typed.
    track('Opened Related Search', { dish, position: Number(el.dataset.pos || 0), result_count: lastHits.length });
    return;
  }
  if (el.dataset.copyList) {
    const keys = stored.read('saved').filter((k) => keyIndex.has(k));
    copy(`${location.origin}/${listHash(keys)}`).then((ok) => {
      flash(el, ok ? 'Link copied' : 'Couldn’t copy the link');
      if (ok) track('Copied Saved List', { saved_count: keys.length });
    });
    return;
  }
  if (el.dataset.saveAll) {
    const before = stored.read('saved');
    let list = before;
    for (const k of [...state.listKeys].reverse()) list = putFirst(list, k, KEEP.saved.max);
    stored.write('saved', list);
    track('Saved Shared List', { recipe_count: state.listKeys.length, saved_count: list.length });
    spoken = '';
    notice = `Saved ${plural(list.length - before.length, 'recipe')} on this device.`;
    show({ ...askedFrom(''), keep: 'saved' });
    statusEl.focus({ preventScroll: true });
    return;
  }
  if (el.id === 'share') return void shareSearch(el);
  if (el.dataset.add) addIngredient(Number(el.dataset.add), 'popular');
  else if (el.dataset.creator) addCreator(el.dataset.creator, 'home');
  else if (el.dataset.try) {
    // Which of the rotating dishes people pick (a typed search looks the same otherwise).
    track('Tapped Dish Idea', { dish: el.dataset.try });
    qInput.value = el.dataset.try;
    submit('plain');
  } else if (el.dataset.exact) {
    state.exact = true;
    render();
    writeUrl(true);
  } else if (el.dataset.sides) {
    const r = recipes[Number(el.dataset.sides)];
    clearAll();
    state.course = 'side';
    state.cuisine = data.cuisines.some(([c]) => c === r.cuisine) ? r.cuisine : '';
    state.sidesFor = dishName(r.name);
    state.shown = PAGE;
    render();
    writeUrl(true);
    // The button is gone with the old results: move focus to the first side, and the
    // status line ("8 Thai sides to go with…") is read out as it changes.
    resultsEl.querySelector<HTMLAnchorElement>('.row a')?.focus();
    track('Opened Sides', { cuisine: r.cuisine, recipe_key: r.key, result_count: search().length });
  } else if (el.dataset.fresh) {
    clearAll();
    state.fresh = true;
    state.shown = PAGE;
    render();
    writeUrl(true);
    resultsEl.querySelector<HTMLAnchorElement>('.row a')?.focus();
    track('Opened New Recipes', { result_count: (data.fresh || []).length });
  } else if (el.dataset.removeTag) {
    removeTag(el.dataset.removeTag);
    spoken = `${(el.getAttribute('aria-label') || 'Removed').replace(/^Remove /, 'Removed ')}.`;
    commitBox();
    state.shown = PAGE;
    render();
    writeUrl(true);
    remember();
    qInput.focus();
  } else if (el.dataset.fix) {
    if (el.dataset.fix === 'clear') clearAll();
    else emptyFixes[Number(el.dataset.fix)]?.();
    qInput.value = state.q;
    state.shown = PAGE;
    render();
    writeUrl(true);
    remember();
    qInput.focus();
  } else if (el.dataset.noteLink) {
    track('Opened World Cuisine', { note_kind: el.dataset.note, note_id: el.dataset.noteId, link: el.dataset.noteLink });
  } else if (el.dataset.srcId) {
    saveView(); // so Back from the recipe lands here, this far down
    openedRecipe(el.dataset.srcId, Number(el.dataset.pos || 0), el.dataset.from || 'results', el.dataset.key);
  } else if (el.dataset.creatorPage) {
    track('Opened Creator Page', { source: el.dataset.creatorPage, opened_from: el.dataset.from || 'results' });
  } else if (el.dataset.support) {
    track('Opened Support Link', { source: el.dataset.support, link_kind: el.dataset.kind || 'link', opened_from: el.dataset.from || 'results' });
  } else if (el.dataset.other) {
    track('Opened Other Search', { site: el.dataset.other });
  }
});

function clearAll() {
  state.q = '';
  state.with = [];
  state.sites.clear();
  state.time = 0;
  state.cuisine = '';
  state.course = '';
  state.fresh = false;
  state.sidesFor = '';
  state.show = '';
  state.without = [];
  state.notWords = [];
  state.diet = '';
  state.sort = '';
  state.keep = '';
  state.listKeys = [];
  state.exact = false;
  state.list = false;
  state.picked = -1;
  qInput.value = '';
  recentNow = ''; // what's searched next is a new search to remember
}

for (const id of ['clear-all', 'home-link']) {
  $(id).addEventListener('click', (e) => {
    if (!data) return;
    e.preventDefault();
    clearAll();
    state.shown = PAGE;
    render();
    writeUrl(true);
    qInput.focus();
  });
}

for (const id of ['lucky', 'lucky-results', 'lucky-again']) $(id).addEventListener('click', () => data && pickRandom());

for (const [btn, list] of [[moreBtn, resultsEl], [$('more-videos'), $('video-results')]] as const) {
  btn.addEventListener('click', () => {
    const first = state.shown;
    state.shown += PAGE;
    entryShown = state.shown;
    render();
    saveView();
    // Move focus to the first new result, so keyboard and screen reader users keep their place.
    list.querySelectorAll<HTMLAnchorElement>('.row :is(h3, h4) a')[first]?.focus();
  });
}

// A photo that won't load (moved, blocked) gives way to a plain "No photo".
app.addEventListener(
  'error',
  (e) => {
    const img = e.target as HTMLImageElement;
    if (img.tagName !== 'IMG') return;
    if (img.classList.contains('opt-thumb')) return void (img.style.visibility = 'hidden');
    img.replaceWith(Object.assign(document.createElement('span'), { className: 'no-photo', textContent: 'No photo' }));
  },
  true,
);

addEventListener('popstate', () => {
  if (!data) return;
  suggest.close();
  delete app.dataset.fromAsk; // Ask's line comes back with its own search (chat.ts), not with this one
  readUrl();
  state.shown = entryShown = shownFrom(history.state);
  qInput.value = state.q;
  render();
  restoreScroll();
  dispatchEvent(new Event('findish:url'));
});

// ---------------------------------------------------------------------------------------
// Ask, the chat experiment (src/scripts/chat.ts, src/chat/chat.mjs). Only at ?chat=1 for
// now, remembered for the rest of the visit in this tab. Its code loads only then.

addEventListener('findish:ask-ready', () => {
  askReady = true;
  qInput.placeholder = placeholder($('box').hasAttribute('data-tags'));
});

function askOn() {
  const asked = new URLSearchParams(location.search).get('chat') === '1';
  try {
    if (asked) sessionStorage.setItem('findish-ask', '1');
    return asked || sessionStorage.getItem('findish-ask') === '1';
  } catch {
    return asked;
  }
}

// Ask hands over a search as the page's own address parameters; the page shows it as if the
// person had built it, and says how many recipes it found.
addEventListener('findish:show', (e) => {
  const detail = (e as CustomEvent<{ query: string; count?: number }>).detail;
  if (!data) return;
  const u = new URL(location.href);
  u.search = detail.query;
  u.hash = '';
  saveView();
  history.pushState({ shown: PAGE }, '', u);
  entryShown = PAGE;
  readUrl();
  // The question stays in the address bar's history, not in the box: the box is free for a follow-up.
  qInput.value = state.q;
  app.dataset.fromAsk = '1';
  render();
  detail.count = isBlank() ? 0 : lastHits.length;
});

// "Search my words instead" (and Ask's fallback when it can't answer): the words go through
// the page's own understanding, as if typed and entered, starting from a clean search.
addEventListener('findish:plain', (e) => {
  const detail = (e as CustomEvent<{ text: string; notice?: string }>).detail;
  if (!ready) return;
  delete app.dataset.fromAsk;
  clearAll();
  qInput.value = String(detail.text || '');
  notice = String(detail.notice || '');
  submit('plain');
  // Chosen by hand ("Search my words instead"): back to the box, to change the words.
  if (!detail.notice) qInput.focus();
});

// Read before the page loads: a link that is only words has its address rewritten (see
// load), which would take the ?chat=1 switch with it.
const askWanted = askOn();
load().then(() => {
  if (askWanted) import('./chat.ts');
});

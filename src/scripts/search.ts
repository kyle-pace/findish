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
// State lives in the URL (?q=, &with=, &site=, &time=, &cuisine=, &course=, &new=), so searches can be
// shared and the back button works. (`site` holds creator ids, for older links.)
import { track } from 'kp-design/analytics';
import * as core from '../lib/search-core.mjs';
import type { Creator, Hit, Ready, Recipe, Understood } from '../lib/search-core.mjs';
import { looksLikeAsk, words } from '../lib/search-core.mjs';
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
  /** Ingredient positions a vegetarian or vegan search leaves out. */
  diet?: { vegetarian: number[]; vegan: number[] };
  /** Things to leave out that aren't one ingredient ("dairy"): [id, name, flag, ...other names]. */
  groups?: [string, string, number, ...string[]][];
  /** After load() this also holds those groups, after the real ingredients, so a tag can be either. */
  ing: Ing[];
  recipes: RecipeRow[];
};

const PAGE = 24;
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

let data: Index;
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
  sidesFor: -1, // the main a "Sides to go with it" search came from (not kept in the URL)
  show: '' as '' | 'recipes' | 'videos', // both, or just one kind
  without: [] as number[], // ingredients to leave out ("no pork")
  notWords: [] as string[], // words to leave out by title, for things that aren't one ingredient ("no peas")
  diet: '' as '' | 'vegetarian' | 'vegan',
  exact: false, // search the words as typed, without fixing typos
  list: false, // a comma just made an ingredient tag, so what's typed next carries on the list
  shown: PAGE,
  picked: -1, // a recipe picked at random, by index into recipes
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
  buildFilters();
  buildStart();
  readUrl();
  app.dataset.state = 'ready';
  // Enter was pressed before the recipes had loaded: search for what's in the box now,
  // instead of drawing the page over it.
  if (submitWaiting) submit();
  else render();
  // The videos come second, so recipe search doesn't wait for them.
  loaded
    .videos?.()
    .catch(() => {}) // no videos this visit: recipes still work
    .then(videosLanded);
}
let submitWaiting = false;
/** The video rows haven't arrived yet (they load after the recipes). */
let videosPending = false;

/** The videos are in: a search on the page is drawn again, now with them. */
function videosLanded() {
  videosPending = false;
  if (isBlank() && state.picked < 0) return; // the home page shows none
  // render() puts the last search back in the box; someone may be typing the next one.
  const [typed, from, to] = [qInput.value, qInput.selectionStart, qInput.selectionEnd];
  render();
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
  return core.search(ready!, state, opts);
}

function searchVideos(opts: { q?: string; skip?: Skip } = {}): VideoRow[] {
  return core.searchVideos(ready!, state, opts) as VideoRow[];
}


const isBlank = () =>
  !state.q && !state.with.length && !state.without.length && !state.notWords.length && !state.diet && !state.sites.size && !state.time && !state.cuisine && !state.course && !state.fresh;
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
function metaLine(r: Recipe): string {
  const bits = [r.min ? fmtTime(r.min) : '', r.cuisine].filter(Boolean);
  return `${bits.length ? `${esc(bits.join(', '))}, from ` : 'From '}${esc(r.src.name)}`;
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
function usesLine(h: Hit): string {
  const n = state.with.length;
  if (!n) return '';
  const used = andList(h.used.map((p) => esc(ingName(p))));
  const not = state.with.filter((p) => !h.used.includes(p)).map((p) => esc(ingName(p)));
  const plus = h.missing ? `, plus ${plural(h.missing, 'more thing', 'more things')}` : '';
  return `<p class="uses">Uses ${used}${not.length && n > 1 ? ` (not ${orList(not)})` : ''}${plus}</p>`;
}

// Result names aren't highlighted: every result matches, so marking the words again is
// noise. Suggestions still highlight, since there it shows what you've typed so far.
function row(h: Hit, position: number, _q: string[], from = 'results', support = ''): string {
  const { r } = h;
  const photo = r.img
    ? `<img src="${esc(r.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="480" height="360">`
    : `<span class="no-photo">No photo</span>`;
  // The name comes first in the page so screen readers hear it first; CSS puts the photo on the left.
  return `<article class="row">
    <div class="text">
      <h3><a href="${esc(r.url)}" data-pos="${position}" data-src-id="${esc(r.src.id)}" data-key="${esc(r.key)}" data-from="${from}">${esc(r.name)}</a></h3>
      <p class="meta">${metaLine(r)}</p>${usesLine(h)}${sidesLine(r, from)}${support}
    </div>
    <div class="photo">${photo}</div>
  </article>`;
}

function render() {
  const understood = queryWords(state.q);
  const q = understood.words;
  qInput.value = state.q;
  renderTags();
  renderFilterButtons();
  renderPicked();

  const blank = isBlank();
  page.dataset.mode = blank && state.picked < 0 ? 'home' : 'results';
  // The home page's ideas belong to the home page: a random pick from there shows only the pick.
  $('start').hidden = !blank || state.picked >= 0;
  $('empty').hidden = true;
  $('also').hidden = true;
  $('videos').hidden = true;

  if (blank) {
    resultsEl.innerHTML = '';
    moreBtn.hidden = true;
    // A note belongs to the search it was for; back home, it goes with the results.
    $('note').hidden = true;
    statusEl.innerHTML = '';
    return;
  }

  let hits = state.show === 'videos' ? [] : search();
  // Nothing has every word: show what has most of them, and say so.
  // Not when recipes do have every word and only what's being left out hides them ("fried
  // chicken" on a vegetarian search): then nothing matches, and the page offers to leave nothing out.
  const hidden = !hits.length && (state.diet || state.without.length || state.notWords.length) && core.search(ready!, { ...state, diet: '', without: [], notWords: [] }, { count: true }) > 0;
  const loose = !hits.length && q.length > 1 && state.show !== 'videos' && !hidden;
  if (loose) hits = search({ loose: true });
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
  resultsEl.innerHTML = shown
    .map((h, n) => {
      const first = !supported.has(h.r.src.id);
      supported.add(h.r.src.id);
      return `<li>${row(h, n + 1, q, state.sidesFor >= 0 ? 'sides' : 'results', first ? supportLine(h.r.src.id) : '')}</li>`;
    })
    .join('');
  moreBtn.hidden = hits.length <= state.shown;
  moreBtn.textContent = `Show ${Math.min(PAGE, hits.length - shown.length)} more of ${(hits.length - shown.length).toLocaleString()}`;

  const count = `<strong>${hits.length.toLocaleString()}</strong>`;
  const vids = videos.length ? ` and ${plural(videos.length, 'video')} on YouTube` : '';
  if (loose && hits.length) statusEl.innerHTML = `Nothing has every word, so these ${plural(hits.length, 'recipe')} have most of them.`;
  else if (state.show === 'videos' && !videos.length) statusEl.textContent = 'No videos match all of that.';
  else if (!hits.length && videos.length) statusEl.innerHTML = `<strong>${videos.length.toLocaleString()}</strong> ${videos.length === 1 ? 'video' : 'videos'} on YouTube.`;
  else if (!hits.length) statusEl.textContent = 'Nothing matches all of that.';
  else if (state.with.length > 1)
    statusEl.innerHTML = `${count} ${hits.length === 1 ? 'recipe uses' : 'recipes use'} at least one of them${vids}. The ones that use the most come first.`;
  else statusEl.innerHTML = `${count} ${hits.length === 1 ? 'recipe' : 'recipes'}${vids}.`;

  // A typo we fixed: say what we searched, and offer the words as typed.
  if (state.sidesFor >= 0 && hits.length && state.course === 'side')
    statusEl.innerHTML = `${count} ${state.cuisine ? esc(state.cuisine) + ' ' : ''}${hits.length === 1 ? 'side' : 'sides'} to go with ${esc(recipes[state.sidesFor].name)}.`;
  if (state.fresh && hits.length)
    statusEl.innerHTML = `${count} ${hits.length === 1 ? 'recipe' : 'recipes'} new this week, from the crawl on ${esc(fmtDay(data.crawled))}.`;
  // A word nothing here has was left out of the search: say which.
  if (understood.ignored.length && (hits.length || videos.length))
    statusEl.innerHTML += ` Nothing here has “${esc(understood.ignored.join(' '))}”, so that was left out.`;
  if (understood.fixes.length)
    statusEl.innerHTML = `Showing results for “${esc(q.join(' '))}”. <button type="button" data-exact="1">Search for “${esc(
      state.q,
    )}” instead</button>. ${statusEl.innerHTML}`;
  renderNote();
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

/** Creator and ingredient tags, inside the box before the text. */
function renderTags() {
  const tag = (attr: string, value: string | number, label: string, kind: string) =>
    `<li><button type="button" class="tag tag-${kind}" ${attr}="${esc(value)}" aria-label="Remove ${esc(label)}">${esc(label)}<span class="x" aria-hidden="true">×</span></button></li>`;
  $('with-chips').innerHTML = [
    ...[...state.sites].map((id) => tag('data-remove-creator', id, `from ${creatorById.get(id)?.name || id}`, 'creator')),
    ...(state.cuisine ? [tag('data-remove-cuisine', state.cuisine, `${state.cuisine} cuisine`, 'cuisine')] : []),
    ...(state.fresh ? [tag('data-remove-fresh', 1, 'new this week', 'diet')] : []),
    ...(state.diet ? [tag('data-remove-diet', state.diet, state.diet, 'diet')] : []),
    ...state.with.map((p) => tag('data-remove', p, ingName(p), 'ing')),
    ...state.without.map((p) => tag('data-remove-not', p, `no ${ingName(p)}`, 'not')),
    ...state.notWords.map((w) => tag('data-remove-word', w, `no ${w}`, 'not')),
  ].join('');
  const any = state.sites.size || state.with.length || state.without.length || state.notWords.length || state.diet || state.fresh || state.cuisine;
  $('box').toggleAttribute('data-tags', !!any);
  qInput.placeholder = any ? 'and…' : 'A dish, ingredient, cuisine or creator';
}

function renderEmpty() {
  const fixes: { label: string; n: number; apply: () => void }[] = [];
  for (const p of state.with) {
    if (state.with.length < 2 && !state.q) continue;
    const rest = state.with.filter((x) => x !== p);
    fixes.push({ label: `without ${ingName(p)}`, n: search({ with: rest }).length, apply: () => (state.with = rest) });
  }
  if (state.q && state.with.length)
    fixes.push({ label: `any dish, not just “${state.q}”`, n: search({ q: '' }).length, apply: () => (state.q = '') });
  if (state.without.length || state.notWords.length || state.diet)
    fixes.push({
      label: 'leaving nothing out',
      n: (() => {
        const [w, nw, d] = [state.without, state.notWords, state.diet];
        [state.without, state.notWords, state.diet] = [[], [], ''];
        const n = search().length;
        [state.without, state.notWords, state.diet] = [w, nw, d];
        return n;
      })(),
      apply: () => ([state.without, state.notWords, state.diet] = [[], [], '']),
    });
  if (state.sites.size) fixes.push({ label: 'any creator', n: search({ skip: 'site' }).length, apply: () => state.sites.clear() });
  if (state.time) fixes.push({ label: 'any time', n: search({ skip: 'time' }).length, apply: () => (state.time = 0) });
  if (state.cuisine) fixes.push({ label: 'any cuisine', n: search({ skip: 'cuisine' }).length, apply: () => (state.cuisine = '') });
  if (state.course) fixes.push({ label: 'any course', n: search({ skip: 'course' }).length, apply: () => (state.course = '') });
  const useful = fixes.filter((f) => f.n > 0).sort((a, b) => b.n - a.n);
  emptyFixes = useful.map((f) => f.apply);
  $('empty').hidden = false;
  const tries = useful.map((f, n) => `<button type="button" data-fix="${n}">${esc(f.label)}</button> (${plural(f.n, 'recipe')})`);
  const over = `<button type="button" data-fix="clear">start over</button>`;
  $('fixes').innerHTML = tries.length
    ? `Try ${orList([...tries, over])}.`
    : state.q
      ? `Try fewer or different words, or ${over}.`
      : `Try ${over}.`;
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
    box.innerHTML = creator;
    return void (box.hidden = false);
  }
  if (!cuisine) return void (box.hidden = true);
  if (!notes) {
    box.hidden = true;
    if (!notesLoading) {
      notesLoading = true;
      fetch('/notes.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((n) => {
          notes = n?.cuisines ? n : { cuisines: {} };
          renderNote();
        })
        .catch(() => (notes = { cuisines: {} }));
    }
    return;
  }
  const note = notes.cuisines[cuisine];
  if (!note) return void (box.hidden = true);
  box.innerHTML = `<a href="${esc(note.page)}" data-note="cuisine" data-note-id="${esc(cuisine)}" data-note-link="world-cuisine">Explore ${esc(note.name)} on World cuisine</a>`;
  box.hidden = false;
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
  state.picked = next;
  render();
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
  $('picked-card').innerHTML = row({ r, score: 0, used, missing }, 0, words(state.q), 'random') + supportLine(r.src.id, 'random');
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

  for (const pop of document.querySelectorAll<HTMLElement>('.pop')) {
    pop.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.name === 'site') el.checked ? state.sites.add(el.value) : state.sites.delete(el.value);
      if (el.name === 'time') state.time = Number(el.value);
      if (el.name === 'cuisine') state.cuisine = el.value;
      if (el.name === 'course') state.course = el.value;
      if (el.name === 'show') state.show = el.value as typeof state.show;
      state.shown = PAGE;
      render();
      updateCounts(pop);
      writeUrl(false);
      // Which filters people reach for, and what they pick (ids and labels, never typed text).
      track('Changed Filter', { filter_name: el.name, filter_value: el.name === 'site' ? (el.checked ? el.value : '') : el.value, result_count: search().length });
    });
    // Open under its word on wider screens; on phones CSS makes it a sheet at the bottom.
    pop.addEventListener('toggle', (e) => {
      if ((e as ToggleEvent).newState !== 'open') return;
      updateCounts(pop);
      if (matchMedia('(max-width: 40rem)').matches) return;
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
      if (matchMedia('(max-width: 40rem)').matches) return;
      document.querySelectorAll<HTMLElement>('.pop:popover-open').forEach((p) => p.hidePopover());
    },
    { passive: true },
  );
}

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
  for (const el of document.querySelectorAll<HTMLInputElement>('.pop input')) {
    if (el.name === 'site') el.checked = state.sites.has(el.value);
    if (el.name === 'time') el.checked = Number(el.value) === state.time;
    if (el.name === 'cuisine') el.checked = el.value === state.cuisine;
    if (el.name === 'course') el.checked = el.value === state.course;
    if (el.name === 'show') el.checked = el.value === state.show;
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
  | { kind: 'recipe'; h: Hit; n: number }
  | { kind: 'all'; n: number; text: string };

const suggest = {
  options: [] as Option[],
  active: -1,
  panel: $('q-panel'),
  list: $('q-list'),

  open() {
    const text = qInput.value.trim();
    if (!data || !text) return this.close();
    this.options = buildOptions(text);
    if (!this.options.length) return this.close();
    this.active = -1;
    this.list.innerHTML = this.options
      .map((o, n) => `<span role="option" id="q-opt-${n}" aria-selected="false" data-n="${n}" data-kind="${o.kind}">${optionLabel(o, text)}</span>`)
      .join('');
    this.panel.hidden = false;
    qInput.setAttribute('aria-expanded', 'true');
    qInput.removeAttribute('aria-activedescendant');
  },

  close() {
    this.panel.hidden = true;
    qInput.setAttribute('aria-expanded', 'false');
    qInput.removeAttribute('aria-activedescendant');
    this.options = [];
    this.active = -1;
  },

  move(by: number) {
    if (this.panel.hidden) return this.open();
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
  // While typing, the last word can be the start of one ("dumpl"); after Enter, words are whole.
  const hits = search({ q: text, typing: true });
  out.push(...hits.slice(0, 4).map((h, n) => ({ kind: 'recipe' as const, h, n: n + 1 })));
  if (hits.length) out.push({ kind: 'all', n: hits.length, text });
  return out;
}

function optionLabel(o: Option, text: string): string {
  if (o.kind === 'not')
    return `<span class="opt-text"><span class="opt-name">No ${esc(ingName(o.p))}</span><span class="opt-meta">Leave out recipes that use it</span></span>`;
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
    return `${thumb}<span class="opt-text"><span>${highlight(r.name, words(text))}</span><span class="opt-meta">${esc(r.src.name)}${
      r.min ? `, ${fmtTime(r.min)}` : ''
    }</span></span>`;
  }
  return `<span class="opt-text"><span class="opt-name">Search for “${esc(o.text)}”</span><span class="opt-meta">${plural(o.n, 'recipe')}</span></span>`;
}

function choose(n: number) {
  const o = suggest.options[n];
  if (!o) return;
  if (o.kind === 'not') {
    qInput.value = '';
    if (!state.without.includes(o.p)) state.without.push(o.p);
    afterTag();
    qInput.focus();
  } else if (o.kind === 'creator') {
    qInput.value = '';
    addCreator(o.c.id, 'suggestions');
    qInput.focus();
  } else if (o.kind === 'cuisine') {
    qInput.value = '';
    state.cuisine = o.c;
    afterTag();
    track('Added Cuisine', { cuisine: o.c, added_from: 'suggestions' });
    qInput.focus();
  } else if (o.kind === 'ing') {
    qInput.value = '';
    addIngredient(o.p, 'suggestions');
    qInput.focus();
  } else if (o.kind === 'recipe') {
    openedRecipe(o.h.r.src.id, o.n, 'suggestions', o.h.r.key);
    location.href = o.h.r.url;
  } else submit();
}

// ---------------------------------------------------------------------------------------
// Actions

/** Adding a tag keeps any words still in the box as words, and searches. */
function afterTag() {
  suggest.close();
  state.q = qInput.value.trim();
  state.exact = false; // "search for exactly this" was about the words before the tag
  state.shown = PAGE;
  state.picked = -1;
  render();
  writeUrl(true);
  searched();
}

function addIngredient(p: number, from: string) {
  if (!state.with.includes(p)) state.with.push(p);
  afterTag();
  track('Added Ingredient', { ingredient_id: data.ing[p][0], added_from: from });
}

function addCreator(id: string, from: string) {
  state.sites.add(id);
  afterTag();
  track('Added Creator', { creator_id: id, added_from: from });
}

function submit() {
  // The recipes haven't loaded yet: keep what's typed, and search once they have.
  if (!ready) return void (submitWaiting = true);
  submitWaiting = false;
  suggest.close();
  // With Ask on, something that reads like a question goes to Ask instead (src/scripts/chat.ts).
  if (askReady && looksLikeAsk(qInput.value)) {
    dispatchEvent(new CustomEvent('findish:ask', { detail: { text: qInput.value.trim() } }));
    if (matchMedia('(max-width: 40rem)').matches) qInput.blur();
    return;
  }
  // Plain phrases become tags and filters ("no pork", "under 30 minutes"); the rest stays words.
  const u = understand(qInput.value);
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
  qInput.value = u.q;
  state.q = u.q;
  state.shown = PAGE;
  state.picked = -1;
  render();
  writeUrl(true);
  searched();
  if (matchMedia('(max-width: 40rem)').matches) qInput.blur();
}

function searched() {
  if (isBlank()) return;
  track('Searched Recipes', {
    search_type: state.q && state.with.length ? 'both' : state.q ? 'words' : state.with.length ? 'ingredients' : state.sites.size ? 'creator' : 'filters',
    ingredient_count: state.with.length,
    creator_count: state.sites.size,
    filter_count: filterCount(),
    result_count: search().length,
  });
}

function openedRecipe(source: string, position: number, from: string, key = '') {
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

function writeUrl(push: boolean) {
  delete app.dataset.fromAsk; // the person changed the search, so it's theirs now
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  if (state.q) u.searchParams.set('q', state.q);
  if (state.with.length) u.searchParams.set('with', state.with.map((p) => data.ing[p][0]).join(','));
  if (state.sites.size) u.searchParams.set('site', [...state.sites].join(','));
  if (state.time) u.searchParams.set('time', String(state.time));
  if (state.cuisine) u.searchParams.set('cuisine', state.cuisine);
  if (state.course) u.searchParams.set('course', state.course);
  if (state.fresh) u.searchParams.set('new', '1');
  if (state.show) u.searchParams.set('show', state.show);
  if (state.without.length) u.searchParams.set('without', state.without.map((p) => data.ing[p][0]).join(','));
  if (state.notWords.length) u.searchParams.set('not', state.notWords.join(','));
  if (state.diet) u.searchParams.set('diet', state.diet);
  if (state.exact) u.searchParams.set('exact', '1');
  if (u.href === location.href) return;
  history[push ? 'pushState' : 'replaceState'](null, '', u);
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  state.q = (p.get('q') || '').trim();
  state.with = (p.get('with') || '')
    .split(',')
    .map((id) => ingById.get(id))
    .filter((x): x is number => x != null);
  state.sites = new Set((p.get('site') || '').split(',').filter((id) => creatorById.has(id)));
  const t = Math.round(Number(p.get('time')));
  state.time = t > 0 && t <= 600 ? t : 0;
  state.without = (p.get('without') || '')
    .split(',')
    .map((id) => ingById.get(id))
    .filter((x): x is number => x != null);
  state.notWords = (p.get('not') || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const diet = p.get('diet');
  state.diet = diet === 'vegetarian' || diet === 'vegan' ? diet : '';
  state.exact = p.get('exact') === '1';
  const c = p.get('cuisine') || '';
  state.cuisine = data.cuisines.some(([name]) => name === c) ? c : '';
  const course = p.get('course') || '';
  state.course = (data.courses || []).some(([id]) => id === course) ? course : '';
  state.fresh = p.get('new') === '1' && !!data.fresh?.length;
  state.sidesFor = -1;
  const show = p.get('show');
  state.show = show === 'recipes' || show === 'videos' ? show : '';
  state.shown = PAGE;
  state.picked = -1;
}

// ---------------------------------------------------------------------------------------
// Events

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (suggest.active >= 0) return choose(suggest.active);
  submit();
});

qInput.addEventListener('input', () => {
  // A comma finishes an ingredient (or a creator), like a tag field: "ginger, tofu, ". A
  // pasted list ("eggplant, tofu, scallions") makes a tag of each piece before its last
  // comma; what's after it stays in the box, and Enter carries on the list (understand()).
  if (ready && qInput.value.includes(',')) {
    const pieces = qInput.value.split(',');
    const typing = pieces.pop()!.trim();
    const kept: string[] = [];
    const added: [string, string][] = [];
    for (const piece of pieces) {
      const text = piece.replace(/^\s*(?:i\s+have|i['’]?ve\s+got|we\s+have|with|using)\s+/i, '').trim();
      if (!text) continue;
      const ing = core.ingredientFor(ready, text) ?? ingMatches(text)[0];
      const creator = ing == null ? creatorMatches(text)[0] : undefined;
      if (ing != null) {
        if (!state.with.includes(ing)) state.with.push(ing);
        added.push(['Added Ingredient', data.ing[ing][0]]);
      } else if (creator) {
        state.sites.add(creator.id);
        added.push(['Added Creator', creator.id]);
      } else kept.push(piece.trim());
    }
    qInput.value = [...kept, typing].filter(Boolean).join(' ');
    if (added.length) {
      afterTag();
      state.list = true;
      for (const [event, id] of added) track(event, { [event === 'Added Creator' ? 'creator_id' : 'ingredient_id']: id, added_from: 'typed' });
      return;
    }
  }
  suggest.open();
});
qInput.addEventListener('focus', () => qInput.value.trim() && suggest.open());
qInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    suggest.move(e.key === 'ArrowDown' ? 1 : -1);
  } else if (e.key === 'Escape' && !suggest.panel.hidden) {
    e.preventDefault();
    suggest.close();
  } else if (
    e.key === 'Backspace' &&
    !qInput.value &&
    qInput.selectionStart === 0 &&
    (state.with.length || state.without.length || state.notWords.length || state.diet || state.sites.size || state.cuisine)
  ) {
    // Backspace in an empty box takes off the last tag, right to left.
    if (state.notWords.length) state.notWords.pop();
    else if (state.without.length) state.without.pop();
    else if (state.with.length) state.with.pop();
    else if (state.diet) state.diet = '';
    else if (state.sites.size) state.sites.delete([...state.sites].at(-1)!);
    else state.cuisine = '';
    state.shown = PAGE;
    render();
    writeUrl(false);
  }
});
// Keep focus in the field when an option is clicked.
suggest.list.addEventListener('mousedown', (e) => e.preventDefault());
suggest.list.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
  if (el) choose(Number(el.dataset.n));
});
qInput.addEventListener('blur', () => setTimeout(() => document.activeElement !== qInput && suggest.close(), 0));
// Clicking the box's empty space puts the cursor in the field.
$('box').addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('button, input')) qInput.focus();
});

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button, a');
  if (!el) return;
  if (el.dataset.add) addIngredient(Number(el.dataset.add), 'popular');
  else if (el.dataset.creator) addCreator(el.dataset.creator, 'home');
  else if (el.dataset.try) {
    // Which of the rotating dishes people pick (a typed search looks the same otherwise).
    track('Tapped Dish Idea', { dish: el.dataset.try });
    qInput.value = el.dataset.try;
    submit();
  } else if (el.dataset.exact) {
    state.exact = true;
    render();
    writeUrl(true);
  } else if (el.dataset.sides) {
    const r = recipes[Number(el.dataset.sides)];
    clearAll();
    state.course = 'side';
    state.cuisine = data.cuisines.some(([c]) => c === r.cuisine) ? r.cuisine : '';
    state.sidesFor = r.i;
    state.shown = PAGE;
    render();
    writeUrl(true);
    // The button is gone with the old results: move focus to the first side, and the
    // status line ("8 Thai sides to go with…") is read out as it changes.
    resultsEl.querySelector<HTMLAnchorElement>('h3 a')?.focus();
    track('Opened Sides', { cuisine: r.cuisine, recipe_key: r.key, result_count: search().length });
  } else if (el.dataset.fresh) {
    clearAll();
    state.fresh = true;
    state.shown = PAGE;
    render();
    writeUrl(true);
    resultsEl.querySelector<HTMLAnchorElement>('h3 a')?.focus();
    track('Opened New Recipes', { result_count: (data.fresh || []).length });
  } else if (el.dataset.remove || el.dataset.removeCreator || el.dataset.removeNot || el.dataset.removeWord || el.dataset.removeDiet || el.dataset.removeFresh || el.dataset.removeCuisine) {
    if (el.dataset.remove) state.with = state.with.filter((p) => p !== Number(el.dataset.remove));
    else if (el.dataset.removeWord) state.notWords = state.notWords.filter((w) => w !== el.dataset.removeWord);
    else if (el.dataset.removeNot) state.without = state.without.filter((p) => p !== Number(el.dataset.removeNot));
    else if (el.dataset.removeDiet) state.diet = '';
    else if (el.dataset.removeFresh) state.fresh = false;
    else if (el.dataset.removeCuisine) state.cuisine = '';
    else state.sites.delete(el.dataset.removeCreator!);
    state.shown = PAGE;
    render();
    writeUrl(true);
    qInput.focus();
  } else if (el.dataset.fix) {
    if (el.dataset.fix === 'clear') clearAll();
    else emptyFixes[Number(el.dataset.fix)]?.();
    state.shown = PAGE;
    render();
    writeUrl(true);
    qInput.focus();
  } else if (el.dataset.noteLink) {
    track('Opened World Cuisine', { note_kind: el.dataset.note, note_id: el.dataset.noteId, link: el.dataset.noteLink });
  } else if (el.dataset.srcId) {
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
  state.sidesFor = -1;
  state.show = '';
  state.without = [];
  state.notWords = [];
  state.diet = '';
  state.exact = false;
  state.list = false;
  state.picked = -1;
  qInput.value = '';
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
    render();
    // Move focus to the first new result, so keyboard and screen reader users keep their place.
    list.querySelectorAll<HTMLAnchorElement>('h3 a')[first]?.focus();
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
  readUrl();
  render();
});

// ---------------------------------------------------------------------------------------
// Ask, the chat experiment (src/scripts/chat.ts, src/chat/chat.mjs). Only at ?chat=1 for
// now, remembered for the rest of the visit in this tab. Its code loads only then.

let askReady = false;
addEventListener('findish:ask-ready', () => (askReady = true));

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
  history.pushState(null, '', u);
  readUrl();
  render();
  app.dataset.fromAsk = '1';
  detail.count = isBlank() ? 0 : search().length;
});

load().then(() => {
  if (askOn()) import('./chat.ts');
});

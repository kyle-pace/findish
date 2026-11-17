// Types for search-core.mjs, for the page's TypeScript (src/scripts/search.ts).

export type Source = { id: string; name: string; site: string; host: string; count: number };

/** Whoever made it: a site, a site and its channel, or a channel alone. */
export type Creator = {
  id: string;
  name: string;
  site: string;
  recipes: number;
  videos: number;
  youtube?: string;
  /** The name as words; `aliases` are other names for them, kept apart from it. */
  words: string[];
  aliases: string[][];
  names: string[];
};

export type Recipe = {
  i: number;
  src: Source;
  name: string;
  url: string;
  min: number | null;
  cuisine: string;
  /** main, side, soup… or '' when the site doesn't say and the name isn't plain. */
  course: string;
  isNew: boolean;
  /** The day the crawler first found it. */
  added: string;
  pos: Set<number>;
  own: number[];
  img: string;
  hasPhoto: boolean;
  /** "woks:/mapo-tofu/": the recipe's id in analytics and in data/popularity.json. */
  key: string;
  /** Opens in the last 90 days, across everyone (counts only). */
  opens: number;
  /** What's in it that some people leave out (scripts/diet.mjs). */
  flags: number;
  title: string[];
  core: string[];
  other: string[];
};

export type Hit = { r: Recipe; score: number; used: number[]; missing: number };

export type Understood = {
  q: string;
  time: number;
  with: number[];
  without: number[];
  notWords: string[];
  sites: string[];
  diet: '' | 'vegetarian' | 'vegan';
  cuisine: string;
  course: string;
  show: '' | 'recipes' | 'videos';
};

/** What a search asks for: the page's state, or the MCP server's arguments turned into one. */
export type Filters = {
  q?: string;
  with?: number[];
  without?: number[];
  notWords?: string[];
  sites?: Set<string> | string[];
  time?: number;
  cuisine?: string;
  course?: string;
  fresh?: boolean;
  diet?: '' | 'vegetarian' | 'vegan';
  exact?: boolean;
  show?: '' | 'recipes' | 'videos';
};

export type Query = {
  words: string[];
  /** [typed, used]: spellings that were fixed. */
  fixes: [string, string][];
  /** Words nothing in the index has, left out of the search. */
  ignored: string[];
  /** Something was typed, but none of it is a word. */
  none: boolean;
};

export type SearchOptions = {
  q?: string;
  with?: number[];
  skip?: 'site' | 'time' | 'cuisine' | 'course';
  loose?: boolean;
  typing?: boolean;
  top?: number;
  /** Just how many match (search returns a number). */
  count?: boolean;
};

export type Ready = {
  index: unknown;
  /** Ingredients, then the groups that can be left out ("dairy"), in index.ing's shape. */
  ing: [string, string, number, number[], ...string[]][];
  /** How many of `ing` are real ingredients. */
  real: number;
  ingNames: string[][];
  ingUsed: number[];
  recipes: Recipe[];
  creators: Creator[];
  everyone: Creator[];
  creatorById: Map<string, Creator>;
  channelCreator: string[];
  vocab: Map<string, number>;
};

export function stem(word: string): string;
export function words(text: string): string[];
export function fold(text: string): string;
export function isFiller(word: string): boolean;
export function prepare(index: unknown): Ready;
export function ingredientFor(ready: Ready, phrase: string, mainName?: boolean): number | null;
export function groupFor(ready: Ready, phrase: string): number | null;
export function ingredientsIn(ready: Ready, phrase: string, mainName?: boolean): { found: number[]; rest: string };
export function creatorFor(ready: Ready, phrase: string): string | null;
export function creatorMatches(ready: Ready, text: string, skip?: Set<string>): Creator[];
export function cuisineFor(ready: Ready, wanted: string): string | null;
export function closeWords(ready: Ready, word: string, opts?: { min?: number; real?: boolean }): string[];
export function queryWords(ready: Ready, text: string, opts?: { exact?: boolean; typing?: boolean; lenient?: boolean }): Query;
export function queryFor(ready: Ready, f: Filters, opts?: SearchOptions): Query;
export function understand(ready: Ready, text: string, opts?: { list?: boolean }): Understood;
export function blankUnderstood(q?: string): Understood;
export function looksLikeAsk(text: string): boolean;
export function covers(ready: Ready, chosen: number[], p: number): boolean;
export function search(ready: Ready, f: Filters, opts: SearchOptions & { count: true }): number;
export function search(ready: Ready, f: Filters, opts?: SearchOptions): Hit[];
export function searchVideos(ready: Ready, f: Filters, opts?: SearchOptions): unknown[][];

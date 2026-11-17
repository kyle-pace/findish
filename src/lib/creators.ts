// Every creator in Findish, built at build time from the index (public/index.json) for the
// creator pages (/creators/ and /creators/<id>/, added 2026-11-16). A creator is a site, a
// site and its YouTube channel, or a channel alone (Kenji). Their support links arrive
// already sorted into join, buy and follow by scripts/build-index.mjs (scripts/support.mjs).
//
// Imported, not read from disk: the Cloudflare adapter prerenders inside its own runtime.
import indexJson from '../../public/index.json';
import sourcesJson from '../../vendor/kitchen-catalog/sources.json';

const index: any = indexJson;
// The cuisines KitchenCatalog lists for each source (first is its main one), by creator id.
const listed = new Map<string, string>();
for (const s of (sourcesJson as any).sources)
  if (s.vetted && s.cuisines?.length) {
    const main = String(s.cuisines[0]).replace(/ cuisine$/, '');
    listed.set(s.id, main);
    if (s.youtube?.id) listed.set(s.youtube.id, main);
  }

export type SupportLink = { label: string; url: string; kind: 'join' | 'buy' | 'follow'; book?: boolean; isbn?: string; cover?: string; coverWidth?: number; coverHeight?: number };
export type Pick = { name: string; url: string; key: string; minutes: number; cuisine: string; img: string };
export type VideoPick = { name: string; id: string };

export type Creator = {
  id: string;
  name: string;
  /** Their own site, or their channel when that's all they have. */
  url: string;
  host: string;
  recipes: number;
  videos: number;
  channel?: string;
  /** Their recipes are on hold: 'blocked' while their site keeps the crawler out, 'new' before the first crawl. */
  paused?: 'blocked' | 'new';
  /**
   * The cuisine half or more of their recipes are, or '' when they cook all over. With no
   * recipes here to go by (a channel alone, or a site on hold), the main one KitchenCatalog lists.
   */
  cuisine: string;
  join: SupportLink[];
  buy: SupportLink[];
  follow: SupportLink[];
  picks: Pick[];
  videoPicks: VideoPick[];
};

/** The name a group of creators who cook all over goes under. */
export const MANY = 'Many cuisines';

/**
 * A creator's page. A channel alone has an id like "rhs-yt"; its page drops the "-yt" so the
 * address stays the same if their site is crawled later and the creator's id becomes "rhs".
 */
export const slugOf = (id: string) => id.replace(/-yt$/, '');
export const pagePath = (id: string) => `/creators/${slugOf(id)}/`;
export const n = (x: number, one: string) => `${x.toLocaleString('en-US')} ${x === 1 ? one : one + 's'}`;
export const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
export const fmtTime = (m: number) =>
  m < 60 ? n(m, 'minute') : `${n(Math.floor(m / 60), 'hour')}${m % 60 ? ` ${n(m % 60, 'minute')}` : ''}`;
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

function build(): Creator[] {
  const list: Creator[] = [];
  const byId = new Map<string, Creator>();
  const add = (id: string, name: string, url: string, extra: Partial<Creator> = {}) => {
    const c: Creator = { id, name, url, host: hostOf(url), recipes: 0, videos: 0, cuisine: '', join: [], buy: [], follow: [], picks: [], videoPicks: [], ...extra };
    list.push(c);
    byId.set(id, c);
    return c;
  };
  for (const s of index.sources) add(s.id, s.name, s.site, { recipes: s.count });
  for (const s of index.paused) if (!byId.has(s.id)) add(s.id, s.name, s.site, { paused: s.why === 'paused' ? 'blocked' : 'new' });
  index.videos.sources.forEach((ch: any) => {
    const owner = byId.get(ch.site || ch.id) || add(ch.id, ch.name, ch.channel);
    owner.videos += ch.count;
    owner.channel = ch.channel;
  });

  // Their main cuisine: the one at least half their recipes (or videos, for a channel alone) are.
  // Videos carry a cuisine only when the crawler could tell, so most fall back to the listed one.
  const counts = new Map<string, Map<string, number>>();
  const bump = (id: string, cuisine: string) => {
    if (!cuisine) return;
    const m = counts.get(id) || new Map();
    m.set(cuisine, (m.get(cuisine) || 0) + 1);
    counts.set(id, m);
  };
  const rows = new Map<string, any[]>();
  for (const r of index.recipes) {
    const id = index.sources[r[0]].id;
    bump(id, r[4]);
    (rows.get(id) || rows.set(id, []).get(id)!).push(r);
  }
  const vids = new Map<string, any[]>();
  for (const v of index.videos.rows) {
    const ch = index.videos.sources[v[0]];
    const id = ch.site || ch.id;
    if (!byId.get(id)?.recipes) bump(id, v[5]);
    (vids.get(id) || vids.set(id, []).get(id)!).push(v);
  }

  for (const c of list) {
    const m = counts.get(c.id);
    const total = c.recipes || c.videos;
    if (m && total) {
      const [top, k] = [...m].sort((a, b) => b[1] - a[1])[0];
      if (k / total >= 0.5) c.cuisine = top;
    }
    if (!c.recipes && !c.cuisine) c.cuisine = listed.get(c.id) || '';

    for (const l of (index.support[c.id] || []) as SupportLink[]) c[l.kind].push(l);
    // Their channel is a free way to follow them even when it isn't listed as support.
    if (c.channel && !c.follow.some((l) => /youtube\.com|youtu\.be/.test(l.url)) && c.channel !== c.url)
      c.follow.push({ label: 'YouTube', url: c.channel, kind: 'follow' });

    // A few of their recipes: the most opened first, then ones with a photo, then the newest.
    const site = index.sources.find((s: any) => s.id === c.id)?.site || '';
    c.picks = (rows.get(c.id) || [])
      .slice()
      .sort((a, b) => (b[9] || 0) - (a[9] || 0) || Number(!!b[7]) - Number(!!a[7]) || String(b[11] || '').localeCompare(String(a[11] || '')))
      .slice(0, 8)
      .map((r) => ({ name: r[1], url: r[2].startsWith('http') ? r[2] : site + r[2], key: `${c.id}:${r[2]}`, minutes: r[3], cuisine: r[4], img: r[7] }));
    // With no recipes here (a channel alone, or a site on hold), their newest videos instead.
    if (!c.recipes)
      c.videoPicks = (vids.get(c.id) || [])
        .slice()
        .sort((a, b) => String(b[3]).localeCompare(String(a[3])))
        .slice(0, 6)
        .map((v) => ({ name: v[1], id: v[2] }));
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

export const CREATORS = build();

/** Creators grouped by their main cuisine: the biggest groups first, those who cook all over last. */
export function byCuisine(): [string, Creator[]][] {
  const groups = new Map<string, Creator[]>();
  for (const c of CREATORS) {
    const k = c.cuisine || MANY;
    (groups.get(k) || groups.set(k, []).get(k)!).push(c);
  }
  return [...groups].sort(([a, x], [b, y]) => Number(a === MANY) - Number(b === MANY) || y.length - x.length || a.localeCompare(b));
}

/** "Patreon and 2 cookbooks": the short hint of how to back someone, for the list. */
export function supportHint(c: Creator): string {
  const books = c.buy.filter((l) => l.book).length;
  const bits = [
    ...c.join.map((l) => l.label),
    ...c.buy.filter((l) => !l.book).map((l) => l.label),
    ...(books ? [books === 1 ? '1 cookbook' : `${books} cookbooks`] : []),
  ];
  return andList(bits);
}

export const totals = { recipes: index.recipes.length, videos: index.videos.rows.length };
export const linkOnly: { name: string; search: string }[] = index.linkOnly.filter((l: any) => !/youtube/.test(l.search));

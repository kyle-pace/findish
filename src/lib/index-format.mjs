// The index as the page downloads it: the same facts as public/index.json, packed smaller
// and split in two, so a phone on a slow connection can search recipes before the videos
// have arrived.
//
//   /i/recipes.<hash>.json   everything but the video rows (what recipe search needs)
//   /i/videos.<hash>.json    the video rows, fetched right after
//   "extra"                  the few things that change daily (the build date, how often
//                            each recipe was opened), written into the page itself so the
//                            two files above only change when a crawl changes them
//
// pack() is run by scripts/build-index.mjs; unpack() and unpackVideos() run in the browser
// (src/scripts/index-load.ts) and give back exactly the index pack() was given, so the
// search (src/lib/search-core.mjs) never sees the difference. src/lib/index-format.test.mjs
// holds them to that. public/index.json itself is still written in full, for the MCP
// server, Ask and everything outside this site that reads it.
//
// What makes it smaller:
// - Columns instead of rows (all names together, all links together), which compresses better.
// - Ingredients: only the ones a recipe names. The index also lists everything each is a
//   kind of (pork belly is pork), and which of them aren't pantry basics; both are worked
//   out again here from each ingredient's parents.
// - Links: a link that ends in the recipe's own name ("/mapo-tofu/") is written as "/*/".
// - Photos: the start every photo from one site shares is written once.
//
// This file ships to the browser: no dependencies, nothing from node.

export const FORMAT = 1;

/** "Mapo Tofu (麻婆豆腐)" -> "mapo-tofu", the way most sites name a recipe's page. */
export const slug = (name) =>
  String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const LAST = /^(.*\/)([^/]+)(\/?)$/;
const STAR = /\*(\/?)$/;

/** Every position in `named`, each followed by what it's a kind of, in the order first seen. */
function withParents(named, ing) {
  const seen = new Set();
  for (const d of named) {
    seen.add(d);
    for (const p of ing[d][3]) seen.add(p);
  }
  return [...seen];
}

/**
 * The ingredients a recipe names, from the index's two lists: `pos` (those and everything
 * they're a kind of) and `own` (those that aren't pantry basics). A basic one is written as
 * ~position (a negative number), so both lists can be made again from this one.
 */
function namedBy(pos, own, ing) {
  const out = [];
  const seen = new Set();
  let i = 0;
  let j = 0;
  const see = (p) => {
    for (const q of [p, ...ing[p][3]]) {
      if (seen.has(q)) continue;
      seen.add(q);
      if (pos[i] === q) i++;
    }
  };
  while (i < pos.length || j < own.length) {
    if (j < own.length && (seen.has(own[j]) || own[j] === pos[i])) {
      out.push(own[j]);
      see(own[j++]);
    } else if (i < pos.length) {
      out.push(~pos[i]);
      see(pos[i]);
    } else break; // an `own` that `pos` doesn't have: the check below reports it
  }
  return out;
}

const same = (a, b) => a.length === b.length && a.every((x, k) => x === b[k]);

/**
 * The index (public/index.json's shape) as the three pieces the page loads.
 * Throws when a piece wouldn't unpack to what it was given, so a bad index never ships.
 */
export function pack(index) {
  const { built, recipes, videos, ing, ...rest } = index;

  // The start every photo from one site shares.
  const starts = index.sources.map(() => null);
  for (const r of recipes) {
    const img = r[7];
    if (!img) continue;
    const a = starts[r[0]];
    if (a == null) starts[r[0]] = img;
    else {
      let k = 0;
      while (k < a.length && a[k] === img[k]) k++;
      starts[r[0]] = a.slice(0, k);
    }
  }
  // A photo is never left with nothing after its start (an empty photo means "none").
  for (const r of recipes) if (r[7] && r[7] === starts[r[0]]) starts[r[0]] = r[7].slice(0, -1);

  const cols = { s: [], n: [], u: [], t: [], c: [], d: [], p: [], k: [], co: [], a: [], f: [] };
  const opens = [];
  recipes.forEach((r, i) => {
    const [s, name, url, min, cuisine, pos, own, img, kw, open = 0, course = '', added = '', flags = 0] = r;
    const m = url.match(LAST);
    cols.s.push(s);
    cols.n.push(name);
    // (A link that really ends in a star gets a tab after it, so it isn't taken for one of these.)
    cols.u.push(m && m[2] === slug(name) ? `${m[1]}*${m[3]}` : STAR.test(url) ? `${url}\t` : url);
    cols.t.push(min);
    cols.c.push(cuisine);
    cols.d.push(namedBy(pos, own, ing));
    cols.p.push(img ? img.slice(starts[s].length) : '');
    cols.k.push(kw);
    cols.co.push(course);
    cols.a.push(added);
    cols.f.push(flags);
    if (open) opens.push([i, open]);
  });

  const v = { c: [], n: [], i: [], d: [], g: [], co: [], f: [] };
  for (const row of videos.rows) {
    const [c, name, id, date, pos, course = '', flags = 0] = row;
    v.c.push(c);
    v.n.push(name);
    v.i.push(id);
    v.d.push(date);
    v.g.push(pos.length ? pos[0] : -1);
    v.co.push(course);
    v.f.push(flags);
  }

  const packed = {
    recipes: { v: FORMAT, ...rest, channels: videos.sources, ing, photoStarts: starts.map((s) => s || ''), r: cols },
    videos: { v: FORMAT, r: v },
    extra: { built, opens },
  };

  // Unpacked again, it has to be what came in.
  const back = unpack(packed.recipes, packed.extra, packed.videos);
  const bad = (what, i, name) => new Error(`index-format: ${what} ${i} (“${name}”) doesn't survive packing`);
  recipes.forEach((r, i) => {
    const b = back.recipes[i];
    const ok = r.length === b.length && r.every((x, k) => (Array.isArray(x) ? same(x, b[k]) : x === b[k]));
    if (!ok) throw bad('recipe', i, r[1]);
  });
  videos.rows.forEach((r, i) => {
    const b = back.videos.rows[i];
    const ok = r.length === b.length && r.every((x, k) => (Array.isArray(x) ? same(x, b[k]) : x === b[k]));
    if (!ok) throw bad('video', i, r[1]);
  });
  return packed;
}

/** The video rows, as the index has them: [channel, title, id, date, ingredient positions, course, flags?]. */
export function unpackVideos(file, ing) {
  const { c, n, i, d, g, co, f } = file.r;
  return n.map((name, k) => {
    const row = [c[k], name, i[k], d[k], g[k] < 0 ? [] : [g[k], ...ing[g[k]][3]], co[k]];
    if (f[k]) row.push(f[k]);
    return row;
  });
}

/**
 * The index in public/index.json's shape, from the pieces pack() made. Without `videos` the
 * video rows are empty for now (the channels and their counts are there): add them when
 * they arrive with unpackVideos() and search-core's addVideos().
 */
export function unpack(file, extra = {}, videos = null) {
  if (file.v !== FORMAT || (videos && videos.v !== FORMAT)) throw new Error('index-format: a newer index than this page knows');
  const { v, channels, photoStarts, r, ...rest } = file;
  const { ing } = file;
  const opens = new Map(extra.opens || []);
  const recipes = r.n.map((name, i) => {
    const s = r.s[i];
    const named = r.d[i];
    const own = [];
    const all = [];
    for (const d of named) {
      if (d >= 0) own.push(d);
      all.push(d < 0 ? ~d : d);
    }
    const url = r.u[i];
    const row = [
      s,
      name,
      STAR.test(url) ? url.replace(STAR, (_, end) => slug(name) + end) : url.endsWith('\t') ? url.slice(0, -1) : url,
      r.t[i],
      r.c[i],
      withParents(all, ing),
      own,
      r.p[i] ? photoStarts[s] + r.p[i] : '',
      r.k[i],
      opens.get(i) || 0,
      r.co[i],
      r.a[i],
    ];
    if (r.f[i]) row.push(r.f[i]);
    return row;
  });
  return {
    built: extra.built || '',
    ...rest,
    videos: { sources: channels, rows: videos ? unpackVideos(videos, ing) : [] },
    recipes,
  };
}

/**
 * Whether video rows from another copy of the index can be used with this one. A row points
 * at a channel and at ingredients by their place in the lists, so the lists must be the
 * same: same crawl, same channels in the same order, same ingredients in the same order.
 */
export function sameLists(mine, other) {
  const ids = (xs) => (xs || []).map((x) => (Array.isArray(x) ? x[0] : x?.id)).join('\n');
  return (
    !!mine && !!other && mine.crawled === other.crawled && ids(mine.videos?.sources) === ids(other.videos?.sources) && ids(mine.ing) === ids(other.ing)
  );
}

/**
 * The video rows for an index the page already has, without ever throwing. `packed` gets
 * the videos file; `whole` gets /index.json, tried when the file can't be had (a page left
 * open across a deploy asks for a name that is gone). Its rows are only used when it is
 * the same index as the one on the page: after a deploy it is a newer one, whose rows would
 * point at the wrong channels and ingredients, so the visit goes without videos instead
 * (`missed`), and the page says so quietly.
 *   ing: the ingredient list the recipes were unpacked with (before search-core adds groups)
 */
export async function videoRowsFor(index, ing, packed, whole) {
  try {
    return { rows: unpackVideos(await packed(), ing), missed: false };
  } catch {
    // The whole index, below.
  }
  try {
    const all = await whole();
    if (sameLists({ ...index, ing }, all) && Array.isArray(all.videos?.rows)) return { rows: all.videos.rows, missed: false };
  } catch {
    // Neither could be had.
  }
  return { rows: [], missed: true };
}

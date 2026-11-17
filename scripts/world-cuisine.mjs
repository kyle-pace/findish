// Short notes on cuisines and ingredients from World cuisine (kyle-pace/cuisine-explorer,
// kylepace.dev/world-cuisine/), for the card above results when a search is about exactly
// one cuisine or one ingredient. World cuisine takes its text from Wikipedia; the card
// shows the first sentence, credits Wikipedia and links to both.

const WC = 'https://kylepace.dev/world-cuisine';

/** World cuisine's page address rule (render_item.js there). */
export const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const pageOf = (type, id) => `${WC}/${type}/${slug(id)}/`;
export const wikiOf = (title) => (title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}` : '');

/**
 * The first sentence of a Wikipedia summary, without the bracketed asides (pronunciations,
 * scripts, Latin names): "Thai cuisine (Thai: อาหารไทย, …), the national cuisine of
 * Thailand…, places emphasis on…" -> "Thai cuisine, the national cuisine of Thailand…".
 * Returns '' for anything that doesn't read as a sentence, so no card shows rather than a
 * broken one.
 */
export function firstSentence(text) {
  if (typeof text !== 'string') return '';
  let t = text.replace(/\s+/g, ' ').trim();
  // Brackets, innermost first, so nested ones go too.
  for (let i = 0; i < 4 && /\([^()]*\)|\[[^[\]]*\]/.test(t); i++) t = t.replace(/\s*(\([^()]*\)|\[[^[\]]*\])/g, '');
  t = t.replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  // End at the first full stop that ends a sentence (not "e.g." or "St.").
  const m = t.match(/^(.{20,}?[a-z0-9)”"'%][.!?])(?=\s+[A-Z“"]|$)/);
  const s = (m ? m[1] : t).trim();
  if (s.length < 20 || s.length > 320 || !/[.!?]$/.test(s)) return '';
  return s;
}

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');

/**
 * Builds the notes file from World cuisine's data: cuisines keyed by their short name in
 * lowercase ("thai"), ingredients keyed by KitchenCatalog id. An ingredient only gets a
 * note when World cuisine's ingredient goes by one of the catalog's names for it ("Ginger"
 * for ginger, "Scallions" for green onion), not just a link to a broader one (Agaricus bisporus is linked to mushrooms, but
 * its summary isn't about mushrooms).
 */
export function buildNotes({ cuisines, summaries, food, foodSummaries, catalogLinks, catalog }) {
  const out = { cuisines: {}, ingredients: {} };
  for (const c of cuisines?.cuisines || []) {
    const line = firstSentence(summaries?.[c.id]);
    const short = String(c.name || '').replace(/ cuisine$/i, '').trim();
    if (!line || !short || short === c.name) continue;
    out.cuisines[short.toLowerCase()] = { name: c.name, line, page: pageOf('cuisine', c.id), wiki: c.url || '' };
  }
  const titles = new Map((food?.ingredients || []).map((g) => [g.id, g.title || g.name]));
  for (const [wcId, link] of Object.entries(catalogLinks?.links || {})) {
    if (!link?.id || out.ingredients[link.id]) continue;
    // The same thing by any of the catalog's names: World cuisine's "Scallions" is the
    // catalog's Green Onion, which lists "scallions" among its other names.
    const names = [link.name, ...(catalog?.items?.[link.id]?.aliases || [])].map(norm);
    if (!names.includes(norm(wcId))) continue;
    const line = firstSentence(foodSummaries?.[wcId]);
    if (!line) continue;
    out.ingredients[link.id] = { name: link.name, line, page: pageOf('ingredient', wcId), wiki: wikiOf(titles.get(wcId) || wcId) };
  }
  return out;
}

// Where Explore and the browse pages meet (stage 2 of docs/explore-plan.md, 2026-11-26):
// a cuisine or ingredient that has both a browse page here (/cuisine/korean/, /with/tofu/)
// and a page in the explorer (/explore/cuisine/korean-cuisine/, /explore/ingredient/tofu/)
// is one page, the browse page, which takes in the explorer's photo, dishes and links
// as its "About" section. The explorer's own page for it then forwards there.
//
// Build time only: this reads every explorer page model (about 9 MB), so import it from
// prerendered pages, never from one rendered on request.
// The staged copy (public/explore/app/, scripts/stage-explore.mjs) is used, not
// vendor/explore/, so addresses and cookbook covers already point at finDish.
// @ts-expect-error: plain JS shared with the explorer's page browser
import { renderItem } from '../../public/explore/app/render_item.js';
import linksJson from '../../vendor/explore/data/catalog_links.json';
import { CUISINES, INGREDIENTS, worldCuisine, type Browse } from './browse';

type Item = { t: string; r: string; n: string; intro?: unknown[]; src?: string; actions?: { kind: string }[]; sections: unknown[]; img?: unknown };

const buckets = import.meta.glob<{ default: Record<string, Item> }>('../../public/explore/app/data/web/items/*.json', { eager: true });
const items = new Map<string, Item>();
for (const b of Object.values(buckets)) for (const [ref, item] of Object.entries(b.default)) items.set(ref, item);

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Pages the rules below can't pair up, matched by hand (2026-11-27): the two sides call the
// same thing by different names. Browse page slug to the explorer's page. One that stops
// existing on either side is simply not used; nothing fails.
const CUISINE_BY_HAND: Record<string, string> = {
  argentinian: 'cuisine/argentine-cuisine',
  cantonese: 'cuisine/cantonese-cuisine',
  'indo-chinese': 'cuisine/indian-chinese-cuisine',
  latin: 'cuisine/latin-american-cuisine',
  nyonya: 'cuisine/peranakan-cuisine',
  persian: 'cuisine/iranian-cuisine',
  southern: 'cuisine/cuisine-of-the-southern-united-states',
  'south-western': 'cuisine/cuisine-of-the-southwestern-united-states',
  taiwanese: 'cuisine/taiwan-cuisine',
};
const INGREDIENT_BY_HAND: Record<string, string> = {
  'beef-steak': 'ingredient/beefsteak',
  'chicken-wings': 'ingredient/chicken-wings-as-food',
  'green-onion': 'ingredient/scallion',
  'pandan-leaves': 'ingredient/pandan',
  'phyllo-dough': 'ingredient/filo',
  turkey: 'ingredient/turkey-as-food',
};

// Cuisines: the same match the "Explore … on World cuisine" line used (worldCuisine()).
function cuisineRef(b: Browse): string | undefined {
  const slug = worldCuisine(b.name)?.page.match(/\/cuisine\/([a-z0-9-]+)\/?$/)?.[1];
  if (slug && items.has(`cuisine/${slug}`)) return `cuisine/${slug}`;
  const hand = CUISINE_BY_HAND[b.slug];
  return hand && items.has(hand) ? hand : undefined;
}

// Ingredients: the explorer says which catalog item each of its ingredients is
// (catalog_links.json). Several can share one ("Bean curd" and "Tofu" are both tofu), so the
// browse page takes the one whose name is the catalog's own, and none when that's unclear.
const byCatalogId = new Map<string, string[]>();
const explorerIngredients = new Map<string, string>();
for (const [ref, item] of items) if (item.t === 'ingredient') explorerIngredients.set(item.n, ref);
for (const [name, link] of Object.entries((linksJson as any).links as Record<string, { id: string }>)) {
  const ref = explorerIngredients.get(name);
  if (ref) byCatalogId.set(link.id, [...(byCatalogId.get(link.id) ?? []), ref]);
}
// "Cherries" is "Cherry", "Sweet Potatoes" is "Sweet potato", "Fish Cakes" is "Fish cake"
const singulars = (name: string) => [name, name.replace(/s$/, ''), name.replace(/ies$/, 'y'), name.replace(/oes$/, 'o')];
function ingredientRuleRef(b: Browse): string | undefined {
  const refs = byCatalogId.get(b.slug) ?? [];
  const names = [...singulars(fold(b.name)), fold(b.slug)];
  const named = refs.filter((r) => names.includes(fold(items.get(r)!.n)));
  return named[0] ?? (refs.length === 1 ? refs[0] : undefined);
}
// A hand match never takes a page the rules already gave to another ingredient
const ruleRefs = new Set(INGREDIENTS.map(ingredientRuleRef).filter(Boolean));
function ingredientRef(b: Browse): string | undefined {
  const byRule = ingredientRuleRef(b);
  if (byRule) return byRule;
  const hand = INGREDIENT_BY_HAND[b.slug];
  return hand && items.get(hand)?.t === 'ingredient' && !ruleRefs.has(hand) ? hand : undefined;
}

export function exploreRef(b: Browse): string | undefined {
  return b.kind === 'cuisine' ? cuisineRef(b) : b.kind === 'with' ? ingredientRef(b) : undefined;
}

/** Every dish the explorer has a page for. */
export const EXPLORE_DISHES: { ref: string; name: string }[] = [...items.values()].filter((i) => i.t === 'dish').map((i) => ({ ref: i.r, name: i.n }));

/** Ingredient browse pages that carry the explorer's page as their About section, by catalog id. */
export const INGREDIENT_ABOUT: Record<string, { name: string; page: string }> = Object.fromEntries(
  INGREDIENTS.flatMap((b) => (exploreRef(b) ? [[b.slug, { name: b.name, page: `${b.path}#about` }]] : [])),
);

/**
 * The explorer's page for this browse page, as the HTML of an "About" section: its photo,
 * intro, dishes and links, with the page's own heading turned into the section's. An
 * ingredient's intro is left out (Kyle dropped those as dictionary definitions on
 * 2026-11-16) and so is the button back to this very page's recipes.
 */
export function aboutHtml(b: Browse): { ref: string; name: string; html: string } | undefined {
  const ref = exploreRef(b);
  const item = ref && items.get(ref);
  if (!ref || !item) return undefined;
  const model = {
    ...item,
    intro: b.kind === 'with' ? [] : item.intro,
    src: b.kind === 'with' ? undefined : item.src,
    actions: (item.actions ?? []).filter((a) => a.kind !== 'recipes'),
  };
  const app = '/explore/app/web.html';
  let html: string = renderItem(model, {
    href: (r: string) => (r.includes('/') && !r.includes('#') ? `/explore/${r}/` : `${app}#/${r}`),
    globe: (hash: string) => `/explore/globe/#${hash}`,
    correct: (name: string) => `https://github.com/kyle-pace/world-cuisines/issues/new?title=${encodeURIComponent('Correction: ' + name)}`,
    extraActions: `<a class="btn" href="${app}#/walk/${ref}">Explore on the map</a>`,
  });
  // The page already has its heading and its way back; this is a section of it.
  const before = html;
  html = html.replace(/<p class="crumb">[\s\S]*?<\/p>/, '').replace(/<h1>[\s\S]*?<\/h1>/, '');
  if (html === before || /<h1[ >]/.test(html)) throw new Error(`The explorer's page for ${ref} no longer starts with a crumb and one heading; see aboutHtml() in src/lib/explore.ts.`);
  html = html.replace(/<h2>/g, '<h3>').replace(/<\/h2>/g, '</h3>');
  return { ref, name: item.n, html };
}

/** Every explorer page that is now a browse page here: its ref, and where it lives. */
export const MERGED: Record<string, string> = Object.fromEntries(
  [...CUISINES, ...INGREDIENTS].flatMap((b) => {
    const ref = exploreRef(b);
    return ref ? [[ref, `${b.path}#about`]] : [];
  }),
);

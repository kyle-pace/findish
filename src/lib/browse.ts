// The browse pages, built at build time from the index (public/index.json) like the creator
// pages: /cuisine/<slug>/ for each cuisine with at least MIN_CUISINE recipes, /course/<id>/
// for the nine courses, and /with/<ingredient>/ for the MAX_INGREDIENTS most used things
// people cook from (produce, meat, seafood, dairy and the international aisle; not salt or
// flour). Added 2026-11-17 so someone searching the web for "Korean recipes" or "recipes with
// tofu" can land on a page of them. Each lists a few recipes by name, time and creator and
// links out to the original; like everything in finDish, never the method.
import indexJson from '../../public/index.json';
import catalogJson from '../../vendor/kitchen-catalog/catalog.json';
import worldJson from '../../vendor/world-cuisine/notes.json';
import { CREATORS, pagePath, type Creator } from './creators';

const index: any = indexJson;
const catalog: any = catalogJson;

export const MIN_CUISINE = 5;
export const MIN_INGREDIENT = 40;
export const MAX_INGREDIENTS = 200;
/** How many recipes a page lists before "Search all". */
export const SHOWN = 24;
/** How many quick recipes an ingredient page shows above the rest ("Ready in 30 minutes"). */
export const QUICK_SHOWN = 6;
/** What counts as quick: the search's own "30 minutes or less" (time=30). */
export const QUICK_MINUTES = 30;

// "World" says nothing about the food, so it gets no page.
const SKIP_CUISINES = new Set(['World']);
// What people cook from. Pantry basics and spices are in nearly everything, so a page of
// "recipes with sugar" would help nobody.
const SECTIONS = new Set(['produce', 'meat', 'seafood', 'dairy-eggs', 'international', 'frozen']);
// A kind of one of these is skipped too (cilantro is a fresh herb, lemons are lemons and limes),
// so splitting an item in KitchenCatalog doesn't add or drop pages by itself.
const SKIP_INGREDIENTS = new Set(['fresh-herbs', 'lemons-and-limes', 'butter', 'milk', 'garlic-and-onions', 'potatoes-and-root-vegetables']);
// Too close to another page, or a seasoning nobody looks up recipes for (added with the second
// hundred pages, 2026-11-26).
const SKIP_PAGES = new Set(['low-sodium-soy-sauce', 'liquid-seasoning', 'vegetarian-oyster-sauce', 'half-and-half', 'dashi-packs', 'hondashi']);

export type Row = { name: string; url: string; key: string; source: string; creator: string; minutes: number; cuisine: string; img: string };
export type Kind = 'cuisine' | 'course' | 'with';
export type Browse = {
  kind: Kind;
  slug: string;
  /** "Korean", "Soups", "Tofu". */
  name: string;
  /** "Korean recipes", "Soup recipes", "Recipes with tofu". */
  heading: string;
  path: string;
  /** The same search on the search page. */
  search: string;
  count: number;
  creators: { creator: Creator; count: number }[];
  /** Course ids with their counts, most first (courses with at least 3 recipes). Used by the
   *  ingredient pages' titles ("mains, soups and sides"). */
  courses: { id: string; count: number }[];
  /** Narrower searches with counts: by course on a cuisine's page, by cuisine on the others. Most first. */
  narrower: { label: string; href: string; count: number }[];
  rows: Row[];
  /** Ingredient pages only: quick dinners, 30 minutes or less, mains first (added 2026-11-26
   *  for searches like "quick celery dinner"). Not repeated in rows. */
  quick: Row[];
  /** How many of the page's recipes take 30 minutes or less. */
  quickCount: number;
  /** Ids of the ingredients used most, most first (all ingredient ids, with parents). */
  ingredientCounts: [number, number][];
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const creatorById = new Map(CREATORS.map((c) => [c.id, c]));
const courseNames = new Map<string, string>((index.courses as [string, string, number][]).map(([id, name]) => [id, name]));

// The recipes to show: each creator's most opened first (then ones with a photo, then the
// newest), with creators taking turns so one big site doesn't fill the page.
function pick(recipes: any[], shown = SHOWN): Row[] {
  const bySource = new Map<number, any[]>();
  for (const r of recipes) (bySource.get(r[0]) || bySource.set(r[0], []).get(r[0])!).push(r);
  const queues = [...bySource.values()]
    .map((list) =>
      list.sort((a, b) => (b[9] || 0) - (a[9] || 0) || Number(!!b[7]) - Number(!!a[7]) || String(b[11] || '').localeCompare(String(a[11] || '')) || a[1].localeCompare(b[1])),
    )
    .sort((a, b) => b.length - a.length);
  const out: any[] = [];
  for (let turn = 0; out.length < shown && queues.some((q) => q.length > turn); turn++)
    for (const q of queues) if (q.length > turn && out.length < shown) out.push(q[turn]);
  return out.map((r) => {
    const s = index.sources[r[0]];
    return { name: r[1], url: r[2].startsWith('http') ? r[2] : s.site + r[2], key: `${s.id}:${r[2]}`, source: s.id, creator: s.name, minutes: r[3], cuisine: r[4], img: r[7] };
  });
}

function page(kind: Kind, slug: string, name: string, heading: string, search: string, recipes: any[]): Browse {
  const perSource = new Map<string, number>();
  // A cuisine's page narrows by course ("Korean soups"); the others narrow by cuisine.
  const at = kind === 'cuisine' ? 10 : 4;
  const perNarrow = new Map<string, number>();
  const perCourse = new Map<string, number>();
  const perIngredient = new Map<number, number>();
  for (const r of recipes) {
    for (const p of r[5]) perIngredient.set(p, (perIngredient.get(p) || 0) + 1);
    if (r[10]) perCourse.set(r[10], (perCourse.get(r[10]) || 0) + 1);
    const id = index.sources[r[0]].id;
    perSource.set(id, (perSource.get(id) || 0) + 1);
    if (r[at]) perNarrow.set(r[at], (perNarrow.get(r[at]) || 0) + 1);
  }
  return {
    kind,
    slug,
    name,
    heading,
    path: `/${kind}/${slug}/`,
    search,
    count: recipes.length,
    creators: [...perSource]
      .filter(([id]) => creatorById.has(id))
      .map(([id, count]) => ({ creator: creatorById.get(id)!, count }))
      .sort((a, b) => b.count - a.count || a.creator.name.localeCompare(b.creator.name)),
    courses: [...perCourse]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, count]) => ({ id, count })),
    narrower: [...perNarrow]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 9)
      .map(([value, count]) => ({
        label: kind === 'cuisine' ? courseNames.get(value) || value : value,
        href: `${search}&${kind === 'cuisine' ? 'course' : 'cuisine'}=${encodeURIComponent(value)}`,
        count,
      })),
    ...rowsFor(kind, recipes),
    ingredientCounts: [...perIngredient].sort((a, b) => b[1] - a[1]),
  };
}

const isQuick = (r: any) => r[3] > 0 && r[3] <= QUICK_MINUTES;
// An ingredient page leads with a few quick ones, mains first when there are enough of them
// (people search "quick celery dinner"), then the usual list without those.
function rowsFor(kind: Kind, recipes: any[]) {
  const quickAll = recipes.filter(isQuick);
  if (kind !== 'with') return { rows: pick(recipes), quick: [] as Row[], quickCount: quickAll.length };
  const mains = quickAll.filter((r) => r[10] === 'main');
  const picked = pick(mains.length >= QUICK_SHOWN ? mains : quickAll, QUICK_SHOWN);
  // Fewer than three isn't a row worth its heading.
  const quick = picked.length >= 3 ? picked : [];
  const shownKeys = new Set(quick.map((r) => r.key));
  const rows = pick(recipes.filter((r) => !shownKeys.has(`${index.sources[r[0]].id}:${r[2]}`)));
  return { rows, quick, quickCount: quickAll.length };
}

export const CUISINES: Browse[] = (index.cuisines as [string, number][])
  // A label with no Latin letters has no address to live at; scripts/cuisine.mjs should fold it.
  .filter(([name, count]) => count >= MIN_CUISINE && !SKIP_CUISINES.has(name) && slugify(name))
  .map(([name]) =>
    page('cuisine', slugify(name), name, `${name} recipes`, `/?cuisine=${encodeURIComponent(name)}`, index.recipes.filter((r: any) => r[4] === name)),
  );

// "Mains" reads better as "Main dish recipes" than "Mains recipes".
const COURSE_HEADINGS: Record<string, string> = {
  main: 'Main dish recipes',
  side: 'Side dish and salad recipes',
  soup: 'Soup recipes',
  starter: 'Starter and snack recipes',
  breakfast: 'Breakfast recipes',
  dessert: 'Dessert recipes',
  bread: 'Bread recipes',
  sauce: 'Sauce and pantry recipes',
  drink: 'Drink recipes',
};
export const COURSES: Browse[] = (index.courses as [string, string, number][]).map(([id, name]) =>
  page('course', id, name, COURSE_HEADINGS[id] || `${name} recipes`, `/?course=${encodeURIComponent(id)}`, index.recipes.filter((r: any) => r[10] === id)),
);

// The catalog's names are for a shopping list ("Chicken breast, boneless", "Thai Basil").
// In a sentence they read better short and in lower case, apart from place names.
const PROPER = new Set(['thai', 'napa', 'asian', 'makrut', 'shanghai', 'chinese', 'sriracha', 'italian', 'korean', 'japanese', 'mexican', 'english']);
const plain = (name: string) =>
  name
    .split(',')[0]
    .split(' ')
    .map((w) => (PROPER.has(w.toLowerCase()) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(' ');

// Position 5 of a recipe row lists its ingredients and their parents, so "chicken" counts
// chicken thighs too, the way the search's ingredient tags do.
const using = new Map<number, any[]>();
for (const r of index.recipes) for (const p of r[5]) (using.get(p) || using.set(p, []).get(p)!).push(r);
export const INGREDIENTS: Browse[] = (index.ing as any[])
  .map((g, p) => ({ id: g[0] as string, name: g[1] as string, recipes: using.get(p) || [], item: catalog.items[g[0]] }))
  .filter(({ id, item, recipes }) => recipes.length >= MIN_INGREDIENT && item && SECTIONS.has(item.section) && !SKIP_INGREDIENTS.has(id) && !SKIP_INGREDIENTS.has(item.parent) && !SKIP_PAGES.has(id))
  .sort((a, b) => b.recipes.length - a.recipes.length)
  .slice(0, MAX_INGREDIENTS)
  .map(({ id, name, recipes }) => page('with', id, plain(name), `Recipes with ${plain(name)}`, `/?with=${encodeURIComponent(id)}`, recipes))
  .sort((a, b) => a.name.localeCompare(b.name));

export const ALL: Browse[] = [...CUISINES, ...COURSES, ...INGREDIENTS];
const cuisineByName = new Map(CUISINES.map((c) => [c.name, c]));
/** A cuisine's browse page, when it has one. */
export const cuisinePath = (name: string) => cuisineByName.get(name)?.path;
export { pagePath };

/** The day the index was last crawled, for the sitemap's lastmod. */
export const CRAWLED: string = index.crawled || index.built;

// Links between the pages (added 2026-11-26): an ingredient page links to the cuisine pages
// that cook with it most, and a cuisine page to the ingredient pages it leans on most (by how
// much more it uses them than finDish as a whole, weighed by the square root of how often, so
// Korean gets gochujang and kimchi rather than eggs, and Filipino doesn't get onions). Each page in the list is a Browse, so its heading is the link text.
const ingredientPageByPos = new Map<number, Browse>();
{
  const byId = new Map(INGREDIENTS.map((b) => [b.slug, b]));
  (index.ing as any[]).forEach((g, p) => byId.has(g[0]) && ingredientPageByPos.set(p, byId.get(g[0])!));
}
const TOTAL = index.recipes.length;
const ingPos = new Map((index.ing as any[]).map((g, p) => [g[0] as string, p]));
// In more than 15% of all recipes (garlic, onions, eggs, soy sauce, cheese), itself or the
// thing it's a kind of (yellow onions): true of every cuisine, so it says nothing about one.
const everywhere = (p: number) => {
  const share = (q: number | undefined) => (q === undefined ? 0 : (using.get(q)?.length || 0) / TOTAL);
  return share(p) > 0.15 || share(ingPos.get(catalog.items[index.ing[p][0]]?.parent)) > 0.15;
};
/** The ingredient pages a cuisine leans on most, most first. */
export function signatureIngredients(b: Browse, max = 8): Browse[] {
  return b.ingredientCounts
    .filter(([p, count]) => ingredientPageByPos.has(p) && count >= 3 && !everywhere(p))
    .map(([p, count]) => ({ page: ingredientPageByPos.get(p)!, score: Math.sqrt(count) * (count / b.count) / ((using.get(p)?.length || 1) / TOTAL) }))
    .sort((a, c) => c.score - a.score)
    // One of a family: not "beef steak" after "beef sirloin steak".
    .reduce<Browse[]>((out, { page }) => {
      const parent = (slug: string) => catalog.items[slug]?.parent;
      if (out.length < max && !out.some((o) => parent(o.slug) === page.slug || parent(page.slug) === o.slug)) out.push(page);
      return out;
    }, []);
}
/** The cuisine pages that cook most with an ingredient, most first. */
export function cuisinesFor(b: Browse, max = 6): Browse[] {
  return b.narrower.map((x) => cuisineByName.get(x.label)).filter((c): c is Browse => !!c).slice(0, max);
}

// A cuisine's page on World cuisine (kyle-pace/world-cuisines), the same link the search shows
// above a one-cuisine search. Only the name and page: Kyle dropped the Wikipedia sentences as
// filler on 2026-11-16.
const world: any = worldJson;
const NOTE_CUISINE: Record<string, string> = { 'chinese american': 'american chinese', 'italian american': 'italian-american' };
export function worldCuisine(name: string): { name: string; page: string } | undefined {
  const k = name.toLowerCase();
  const note = world.cuisines?.[NOTE_CUISINE[k] || k];
  return note?.page ? { name: note.name, page: note.page } : undefined;
}

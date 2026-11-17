// What a recipe has in it that some people leave out, worked out when the index is built.
// Each recipe gets one small number (a set of flags) that the search reads, so "vegetarian"
// and "no dairy" are decided the same way on the page, in the MCP server and in Ask.
//
// Three things are read for every recipe:
//   1. its ingredient lines the catalog matched (by the item's shelf and name),
//   2. its ingredient lines the catalog did NOT match (about one in ten), by plain words, and
//   3. its name, by the same words ("Korean Fried Chicken" has chicken in it whatever the
//      ingredient list managed to match).
// A recipe with no ingredient list at all gets every flag: nothing vouches for it, so it
// isn't offered as vegetarian, vegan or free of anything.
//
// It is a best guess. It errs toward flagging (a wrongly hidden recipe costs less than a
// wrongly shown one), and it can't see inside "curry paste" or "stock cube". The About page
// and the MCP server's instructions say so.
import { words } from '../src/lib/search-core.mjs';

export const MEAT = 1; // meat and poultry, and things made from them (lard, gelatin, meat stock)
export const FISH = 2; // fish and other seafood, and things made from them (fish sauce, dashi)
export const DAIRY = 4;
export const EGG = 8;
export const OTHER = 16; // other animal products a vegan search leaves out (honey)
export const NUTS = 32; // peanuts and tree nuts
export const SHELLFISH = 64;
export const PORK = 128;
export const ALL = 255;

export const VEGETARIAN = MEAT | FISH;
export const VEGAN = MEAT | FISH | DAIRY | EGG | OTHER;

/**
 * Things to leave out that aren't one ingredient. The search offers each as a "no dairy" tag
 * (the page) and as a `without` value (the MCP server). [id, name, flag, ...other names]
 * Gluten is not here on purpose: soy sauce, noodles, wrappers and stock all hide it, and a
 * half-right answer would be worse than none.
 */
export const GROUPS = [
  ['any-dairy', 'Dairy', DAIRY, 'milk products', 'lactose'],
  ['any-egg', 'Eggs', EGG, 'egg'],
  ['any-nuts', 'Nuts', NUTS, 'nut', 'tree nuts', 'peanuts and tree nuts'],
  ['any-shellfish', 'Shellfish', SHELLFISH, 'crustaceans'],
  ['any-pork', 'Pork', PORK],
  ['any-meat', 'Meat', MEAT],
  ['any-seafood', 'Seafood', FISH, 'fish and seafood'],
];

const set = (s) => new Set(s.split(/\s+/).filter(Boolean).flatMap((w) => words(w)));

const PORK_W = set('pork bacon ham sausage chorizo prosciutto pancetta guanciale salami pepperoni spam lard tonkatsu carnitas hotdog mortadella kielbasa bratwurst andouille siu');
const MEAT_W = set(
  'chicken beef lamb mutton veal duck goose turkey steak brisket meatball meatloaf meat wagyu bulgogi pastrami venison rabbit quail liver tripe oxtail tallow suet gelatin gelatine giblet drumstick rib ribeye bone yakitori',
);
// Only in ingredient lines, where a bare "stock" or "broth" is usually chicken or beef.
const STOCK_W = set('broth stock bouillon');
const SHELL_W = set('shrimp prawn crab lobster scallop clam mussel oyster squid calamari octopus crawfish crayfish langoustine abalone cockle shellfish belacan xo');
const FISH_W = set(
  'fish salmon tuna cod tilapia halibut trout mackerel sardine anchovy bass snapper barramundi kingfish swordfish catfish eel unagi seafood bonito katsuobushi dashi hondashi roe caviar tobiko ikura mentaiko sashimi surimi worcestershire fishcake',
);
const DAIRY_W = set(
  'butter buttermilk ghee cream milk cheese yogurt parmesan mozzarella cheddar feta ricotta mascarpone paneer gruyere brie camembert gorgonzola halloumi burrata provolone pecorino creme custard gelato whey casein kefir leche queso cheesecake buttercream tzatziki',
);
const EGG_W = set('egg mayo mayonnaise meringue omelet omelette frittata quiche custard aioli');
const OTHER_W = set('honey');
const NUT_W = set('peanut almond cashew walnut pecan pistachio hazelnut macadamia nut chestnut praline marzipan nutella frangipane');

// A word just before that makes it a plant version: "vegan fish sauce", "mock duck".
const ANY_BEFORE = set('vegan vegetarian mock faux meatless veggie');
// ...for milk, cream, butter, cheese and yogurt only: "coconut milk", "peanut butter".
const DAIRY_BEFORE = set('coconut peanut almond oat soy cashew rice hemp cocoa cacao apple shea nut macadamia hazelnut pistachio walnut pecan sunflower pumpkin sesame plant based');
// ...for stock, broth and dashi only: "vegetable stock", "kombu dashi".
const STOCK_BEFORE = set('vegetable veggie mushroom kombu shiitake');
// ...for steaks, ribs and meatballs only: "cauliflower steak", "corn ribs", "lentil meatballs".
const CUT_BEFORE = set('tofu potato cauliflower daikon konnyaku mushroom eggplant cabbage portobello tempeh seitan celeriac watermelon corn lentil chickpea bean zucchini');
const CUT_W = set('steak rib meatball');
// A word just after that makes it something else: "oyster mushrooms", "butter beans".
const AFTER = {
  oyster: set('mushroom'),
  duck: set('sauce'),
  butter: set('bean lettuce'),
  fish: set('fragrant mint shaped'),
  steak: set('sauce seasoning rub'),
  eel: set('sauce'),
  unagi: set('sauce'),
  egg: set('plant'),
  milk: set('thistle'),
  // "pine nuts" and the like are still nuts; these aren't.
  nut: set('milk'),
};

/** The flags for a piece of text: a recipe's name, or an ingredient line the catalog didn't match. */
export function wordFlags(text, { line = false } = {}) {
  const t = words(String(text ?? '').replace(/[-/]/g, ' '));
  let f = 0;
  for (let i = 0; i < t.length; i++) {
    const w = t[i];
    const before = t[i - 1];
    const before2 = t[i - 2];
    const after = t[i + 1];
    // "egg free", "meatless", "no pork" say it isn't in there.
    if (after === 'free' || after === 'less' || before === 'no' || before === 'without') continue;
    if (ANY_BEFORE.has(before) || ANY_BEFORE.has(before2) || (t[i - 3] === 'plant' && before2 === 'based') || (before === 'based' && before2 === 'plant')) continue;
    if (CUT_W.has(w) && (CUT_BEFORE.has(before) || before === '“')) continue;
    if (w === 'meat' && before === 'coconut') continue;
    if (AFTER[w]?.has(after)) continue;
    // "hen of the woods", "chicken of the woods", "cream of tartar"
    if (after === 'of' && (t[i + 2] === 'tartar' || t[i + 3] === 'wood')) continue;
    if (w === 'chestnut' && before === 'water') continue;
    const dairy = DAIRY_W.has(w);
    // "dairy-free butter", "egg-free mayo"
    if (before === 'free' && (before2 === 'dairy' || before2 === 'egg' || before2 === 'meat')) continue;
    // "coconut milk", "peanut butter" (still nuts: those are counted below)
    if (dairy && DAIRY_BEFORE.has(before)) continue;
    if ((STOCK_W.has(w) || w === 'dashi') && STOCK_BEFORE.has(before)) continue;
    if (PORK_W.has(w)) f |= MEAT | PORK;
    if (MEAT_W.has(w)) f |= MEAT;
    if (line && STOCK_W.has(w)) f |= MEAT;
    if (SHELL_W.has(w)) f |= FISH | SHELLFISH;
    if (FISH_W.has(w)) f |= FISH;
    if (dairy) f |= DAIRY;
    if (EGG_W.has(w)) f |= EGG;
    if (OTHER_W.has(w)) f |= OTHER;
    if (NUT_W.has(w)) f |= NUTS;
  }
  // Nuts are checked on their own, so "peanut butter" and "almond milk" still count.
  for (const w of t) if (NUT_W.has(w) && !(w === 'chestnut' && t[t.indexOf(w) - 1] === 'water')) f |= NUTS;
  if (/\bnut[\s-]free\b/i.test(String(text))) f &= ~NUTS;
  return f;
}

/** A recipe's name. One that calls itself vegan or vegetarian isn't flagged for the meat it imitates. */
export function titleFlags(name) {
  let f = wordFlags(name);
  const t = new Set(words(name));
  if (t.has('vegan') || (t.has('plant') && t.has('based'))) f &= ~(VEGAN | SHELLFISH | PORK);
  else if (t.has('vegetarian') || t.has('meatless') || t.has('veggie') || t.has('mock')) f &= ~(MEAT | FISH | SHELLFISH | PORK);
  return f;
}

const ITEM_PLANT = new Set(['vegetarian', 'vegan', 'plant', 'mushroom', 'mushrooms', 'kombu', 'coconut', 'peanut', 'almond', 'oat', 'soy', 'cashew', 'vegetable', 'tartar']);
const ITEM_MEAT = new Set(['gelatin', 'lard', 'chicken', 'beef', 'pork', 'bacon', 'broth', 'stock', 'bouillon', 'foie', 'corned', 'luncheon', 'meatballs']);
const ITEM_FISH = new Set(['dashi', 'fish', 'oyster', 'oysters', 'anchovy', 'anchovies', 'shrimp', 'bonito', 'hondashi', 'katsuobushi', 'worcestershire', 'sardines', 'tuna', 'shellfish', 'xo']);
const ITEM_SHELL = new Set(['oyster', 'oysters', 'shrimp', 'shellfish', 'xo', 'squid', 'octopus', 'cuttlefish']);
const ITEM_PORK = new Set(['pork', 'bacon', 'ham', 'lard', 'sausage', 'salami', 'bratwurst', 'luncheon', 'dogs']);
const ITEM_DAIRY = new Set(['butter', 'buttermilk', 'ghee', 'cream', 'milk', 'cheese', 'yogurt', 'feta', 'parmesan', 'margarine', 'half']);
const ITEM_EGG = new Set(['egg', 'eggs', 'mayo', 'mayonnaise']);
const ITEM_NUT = new Set(['nuts', 'peanut', 'peanuts', 'almond', 'almonds', 'cashew', 'cashews', 'walnut', 'walnuts', 'hazelnut', 'hazelnuts', 'pistachio', 'pistachios', 'pecan', 'pecans', 'candlenuts', 'chestnuts', 'macadamia']);

/**
 * The flags for a catalog item a line matched, from its shelf and the words in its id and
 * its parents' ids ("pork-belly" is pork; "abalone" is a kind of shellfish).
 *   ids: the item's id followed by its parents' ids
 */
export function itemFlags(ids, item) {
  const id = ids[0];
  const own = id.split('-');
  const all = ids.flatMap((x) => x.split('-'));
  const has = (s) => own.some((t) => s.has(t));
  const plant = own.some((t) => ITEM_PLANT.has(t));
  let f = 0;
  if (item.section === 'meat') f |= MEAT;
  if (item.section === 'seafood') f |= FISH;
  if (item.section !== 'produce' && !plant) {
    if (has(ITEM_MEAT)) f |= MEAT;
    if (has(ITEM_FISH)) f |= FISH;
  }
  if (f & FISH && all.some((t) => ITEM_SHELL.has(t))) f |= SHELLFISH;
  if (f & MEAT && all.some((t) => ITEM_PORK.has(t))) f |= PORK;
  if (item.section !== 'produce' && !plant) {
    if (has(ITEM_EGG)) f |= EGG;
    else if ((item.section === 'dairy-eggs' && id !== 'kimchi') || has(ITEM_DAIRY)) f |= DAIRY;
    // Kimchi sits on the dairy shelf at the store; it's usually made with fish sauce or shrimp.
    if (id === 'honey' || id === 'kimchi') f |= OTHER;
  }
  if (all.some((t) => ITEM_NUT.has(t)) && item.section !== 'produce') f |= NUTS;
  return f;
}

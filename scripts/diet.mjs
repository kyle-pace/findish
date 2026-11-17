// What a recipe has in it that some people leave out, worked out when the index is built.
// Each recipe gets one small number (a set of flags) that the search reads, so "vegetarian"
// and "no dairy" are decided the same way on the page, in the MCP server and in Ask.
//
// Three things are read for every recipe:
//   1. its ingredient lines the catalog matched, by the item's shelf and name, and by the
//      line's own words for meat and fish the match missed ("tuna in olive oil" matches
//      olive oil) or a plant version it couldn't tell ("vegan chicken" matches chicken),
//   2. its ingredient lines the catalog did NOT match (about one in ten), by plain words, and
//   3. its name, by the same words ("Korean Fried Chicken" has chicken in it whatever the
//      ingredient list managed to match), and by dishes that are meat unless they say
//      otherwise ("Katsudon", "Smash Burgers", "Pho"). A video has only this.
//
// A line that leaves the choice to the cook isn't flagged: "chicken or vegetable stock",
// "beef broth or water" (Kyle's review, 2026-11-17: a vegetarian can make it, so hiding it
// loses more than it protects). A bare "stock" with no choice offered still counts as meat.
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

const PORK_W = set('pork bacon ham sausage chorizo prosciutto pancetta guanciale salami pepperoni spam lard tonkatsu carnitas hotdog mortadella kielbasa bratwurst andouille siu shumai siomai');
const MEAT_W = set(
  'chicken beef lamb mutton veal duck goose turkey steak brisket meatball meatloaf meat wagyu bulgogi pastrami venison rabbit quail liver tripe oxtail tallow suet gelatin gelatine giblet drumstick rib ribeye bone yakitori ' +
    'schmaltz snail escargot hen poultry capon pheasant squab pigeon partridge boar bison goat elk sirloin chuck lardon nduja chicharron wiener frankfurter foie',
);
// Dishes that are meat unless they say otherwise, read in names only (a video has nothing
// but its name): "Katsudon", "Easy Pho", "The Best Burger". Not read in ingredient lines,
// where "burger buns" and "satay sauce" are on the shelf by those names.
const PORK_DISH = set('katsudon carbonara chashu bossam tonkotsu butadon kakuni samgyeopsal jokbal jeyuk');
const MEAT_DISH = set(
  'burger hamburger cheeseburger katsu karaage gyudon oyakodon bolognese schnitzel yakiniku sukiyaki shabu laab larb satay pho ' +
    'nikujaga hambagu tsukune galbi kalbi dakgalbi samgyetang galbitang galbijjim yukgaejang ragu stroganoff wellington cacciatore kiev gumbo jambalaya ' +
    'shawarma souvlaki gyro doner kebab kabob birria barbacoa rendang jerky',
);
// Only in ingredient lines, where a bare "stock" or "broth" is usually chicken or beef.
const STOCK_W = set('broth stock bouillon');
const SHELL_W = set('shrimp prawn crab lobster scallop clam mussel oyster squid calamari octopus crawfish crayfish langoustine abalone cockle shellfish belacan xo');
const FISH_W = set(
  'fish salmon tuna cod tilapia halibut trout mackerel sardine anchovy bass snapper barramundi kingfish swordfish catfish eel unagi seafood bonito katsuobushi dashi hondashi roe caviar tobiko ikura mentaiko sashimi surimi worcestershire fishcake ' +
    'whiting haddock pollock flounder herring perch carp mahi yellowtail hamachi saba sanma pike monkfish grouper pompano sablefish branzino dace smelt whitebait shirasu niboshi iriko kamaboko chikuwa narutomaki',
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
// ...for a dish (MEAT_DISH, PORK_DISH), one or two words before or the word after: "black
// bean burger", "tofu katsu", "mushroom bolognese", "halloumi burgers", "karaage okra".
const DISH_BEFORE = set(
  'tofu potato cauliflower daikon konnyaku mushroom eggplant cabbage portobello tempeh seitan celeriac corn lentil chickpea bean zucchini ' +
    'vegetable jackfruit paneer halloumi falafel quinoa beet shiitake pumpkin squash avocado spinach broccoli carrot kimchi egg cheese impossible beyond pea okra',
);
// A word just after that makes it something else: "oyster mushrooms", "butter beans".
const SHELF = set('sauce bun seasoning spice dressing marinade rub paste powder');
const AFTER = {
  oyster: set('mushroom'),
  seafood: set('mushroom'),
  duck: set('sauce'),
  goat: set('cheese milk yogurt butter'),
  tonkatsu: set('sauce'),
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
// Birds whose eggs are eggs, not meat: "quail eggs", "salted duck egg yolks".
const BIRD = set('chicken duck quail goose');
const EGG_DISH = set('roll noodle drop');
// "the meat of a coconut": the flesh of a fruit or a nut.
const FLESH_OF = set('coconut avocado date walnut nut');
const MUSHROOMS = set('mushroom shiitake shimeji enoki straw');
const [OR, WATER, EGGW, CELERY, HOT, DOG, BUN, ROAST, POT] = ['or', 'water', 'egg', 'celery', 'hot', 'dog', 'bun', 'roast', 'pot'].map((w) => words(w)[0]);
const VEG_BITS = 1 | 2 | 64 | 128; // MEAT | FISH | SHELLFISH | PORK

/**
 * Reads a piece of text word by word. `flags` is what's in it; `spared` says a meat or fish
 * word was there but something beside it made it a plant version or a lookalike ("vegan
 * chicken", "mushroom stock", "hot dog buns").
 *   line    an ingredient line: a bare "stock" counts as meat, dish names don't count
 *   either  an ingredient line the catalog matched to something without meat or fish:
 *           "lard or butter" leaves the choice to the cook, so it isn't flagged
 */
function read(text, { line = false, either = false } = {}) {
  const t = words(String(text ?? '').replace(/[-/]/g, ' '));
  let f = 0;
  let spared = false;
  let plantStock = -2; // where the last "vegetable stock" was, so "vegetable stock/broth" is one thing
  // What one word would flag, before anything beside it is looked at.
  const bitsOf = (w, i) => {
    let b = 0;
    if (PORK_W.has(w)) b |= MEAT | PORK;
    if (MEAT_W.has(w)) b |= MEAT;
    if (line && STOCK_W.has(w)) b |= MEAT;
    if (!line && PORK_DISH.has(w)) b |= MEAT | PORK;
    if (!line && MEAT_DISH.has(w)) b |= MEAT;
    // "hot dogs", "pot roast"
    if (w === DOG && t[i - 1] === HOT) b |= MEAT | PORK;
    if (!line && w === ROAST && t[i - 1] === POT) b |= MEAT;
    if (SHELL_W.has(w)) b |= FISH | SHELLFISH;
    if (FISH_W.has(w)) b |= FISH;
    if (DAIRY_W.has(w)) b |= DAIRY;
    // White chocolate is made with milk ("milk chocolate" says so itself). Plain or dark may not be.
    if (w === 'chocolate' && t[i - 1] === 'white') b |= DAIRY;
    if (EGG_W.has(w)) b |= EGG;
    if (OTHER_W.has(w)) b |= OTHER;
    if (NUT_W.has(w)) b |= NUTS;
    return b;
  };
  // Whether what's beside word i says it isn't what it looks like.
  const excused = (w, i) => {
    const before = t[i - 1];
    const before2 = t[i - 2];
    const after = t[i + 1];
    // "egg free", "meatless", "no pork" say it isn't in there.
    if (after === 'free' || after === 'less' || before === 'no' || before === 'without') return true;
    if (ANY_BEFORE.has(before) || ANY_BEFORE.has(before2) || (t[i - 3] === 'plant' && before2 === 'based') || (before === 'based' && before2 === 'plant')) return true;
    if (CUT_W.has(w) && (CUT_BEFORE.has(before) || before === '“')) return true;
    if (w === 'meat' && FLESH_OF.has(before)) return true;
    if (AFTER[w]?.has(after)) return true;
    // "hen of the woods", "chicken of the woods", "cream of tartar"
    if (after === 'of' && (t[i + 2] === 'tartar' || t[i + 3] === 'wood')) return true;
    if (w === 'chestnut' && before === 'water') return true;
    // "dairy-free butter", "egg-free mayo"
    if (before === 'free' && (before2 === 'dairy' || before2 === 'egg' || before2 === 'meat')) return true;
    // "coconut milk", "peanut butter" (still nuts: those are counted below)
    if (DAIRY_W.has(w) && DAIRY_BEFORE.has(before)) return true;
    if (STOCK_W.has(w) || w === 'dashi') {
      // "vegetable stock", and "vegetable stock/broth" after it
      if (STOCK_BEFORE.has(before) || plantStock === i - 1) return (plantStock = i), true;
    }
    // "celery ribs", "2 ribs celery", "a rib of celery"
    if (w === 'rib' && (before === CELERY || before2 === CELERY || after === CELERY || (after === 'of' && t[i + 2] === CELERY))) return true;
    // "quail eggs", "salted duck egg yolks", "duck or chicken eggs", "eggs, duck or chicken"
    // In a name only when it's the next word, and not a hen's ("Chicken & Egg Bao" has chicken in it).
    if (BIRD.has(w)) {
      if (after === EGGW && (line ? !EGG_DISH.has(t[i + 2]) : w !== 'chicken')) return true;
      if (line && after === OR && BIRD.has(t[i + 2]) && (t[i + 3] === EGGW || before === EGGW)) return true;
      if (line && before === OR && BIRD.has(before2) && t[i - 3] === EGGW) return true;
    }
    // "oyster or straw mushrooms", "shiitake, oyster"
    if (w === 'oyster' && after !== 'sauce' && t.some((x) => MUSHROOMS.has(x))) return true;
    // In a list, "hot dog buns" are buns. In a name they're a bun with a hot dog baked in.
    if (line && w === DOG && after === BUN) return true;
    if (PORK_DISH.has(w) || MEAT_DISH.has(w) || (w === ROAST && before === POT)) {
      // "burger buns", "satay sauce", "black bean burgers", "tofu pho"
      if (SHELF.has(after) || DISH_BEFORE.has(before) || DISH_BEFORE.has(before2) || DISH_BEFORE.has(after)) return true;
      if (w === 'pho' && t.includes('tofu')) return true;
    }
    return false;
  };
  const each = t.map((w, i) => {
    const b = bitsOf(w, i);
    if (!b) return 0;
    if (excused(w, i)) {
      if (b & VEG_BITS) spared = true;
      return 0;
    }
    return b;
  });
  // "chicken or vegetable stock", "beef broth or water": the cook can choose, so the meat
  // on the other side of "or" isn't counted. Any stock line that offers vegetable stock or
  // water; and, when the catalog matched the line to something with no meat in it ("lard or
  // butter", "fish sauce or soy sauce"), any line with a side that has none.
  if (line && t.includes(OR)) {
    const sides = [[]];
    t.forEach((w, i) => (w === OR ? sides.push([]) : sides.at(-1).push(i)));
    const meaty = (side) => side.some((i) => each[i] & VEG_BITS);
    const stock = t.some((w) => STOCK_W.has(w) || w === 'dashi');
    const free = sides.some((side) => side.length && !meaty(side) && (either || (stock && side.some((i) => STOCK_BEFORE.has(t[i]) || t[i] === WATER))));
    if (free && sides.some(meaty)) {
      spared = true;
      for (let i = 0; i < each.length; i++) each[i] &= ~VEG_BITS;
    }
  }
  for (const b of each) f |= b;
  // Nuts are checked on their own, so "peanut butter" and "almond milk" still count.
  for (const w of t) if (NUT_W.has(w) && !(w === 'chestnut' && t[t.indexOf(w) - 1] === 'water')) f |= NUTS;
  if (/\bnut[\s-]free\b/i.test(String(text))) f &= ~NUTS;
  return { flags: f, spared };
}

/** The flags for a piece of text: a recipe's name, or an ingredient line the catalog didn't match. */
export function wordFlags(text, opts) {
  return read(text, opts).flags;
}

/**
 * The flags for one ingredient line. `item` is what the catalog item it matched carries
 * (itemFlags), or null when it matched nothing.
 *   - Matched nothing: the line's words decide.
 *   - Matched something with no meat or fish ("olive oil" for "tuna in olive oil", "celery"
 *     for "celery, or 1 cup diced ham"): the words are read too, for meat and fish only.
 *   - Matched meat or fish, but the line says it's a plant version or a lookalike ("vegan
 *     chicken", "mushroom stock", "hot dog buns"): the words win, and it isn't flagged.
 */
export function lineFlags(line, item = null) {
  if (item == null) return wordFlags(line, { line: true });
  const { flags, spared } = read(line, { line: true, either: !(item & VEG_BITS) });
  if (item & VEG_BITS) return spared && !(flags & VEG_BITS) ? item & ~VEG_BITS : item;
  return item | (flags & VEG_BITS);
}

/** A recipe's name. One that calls itself vegan or vegetarian isn't flagged for the meat it imitates. */
export function titleFlags(name) {
  return nameFlags(name);
}

/**
 * A name, and what the catalog item it matched carries (a video has only its name, and
 * "Vegan Mapo Tofu with Mushroom Mince" may match an item with meat in it). The name's own
 * words win when it calls itself vegan or vegetarian, or names a plant version or a lookalike
 * ("Mock Duck", "Tonkatsu Sauce").
 */
export function nameFlags(name, item = 0) {
  const { flags, spared } = read(name);
  const t = new Set(words(name));
  const vegan = t.has('vegan') || (t.has('plant') && t.has('based'));
  const vegetarian = vegan || t.has('vegetarian') || t.has('meatless') || t.has('veggie') || t.has('mock');
  let f = flags;
  let i = item;
  if (vegan) {
    f &= ~(VEGAN | SHELLFISH | PORK);
    i &= ~(VEGAN | SHELLFISH | PORK);
  } else if (vegetarian) {
    f &= ~VEG_BITS;
    i &= ~VEG_BITS;
  } else if (spared && !(f & VEG_BITS)) i &= ~VEG_BITS;
  return f | i;
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

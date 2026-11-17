// Which part of a meal a recipe is: main, side, soup and so on. Sites label this in about
// 185 different ways ("Mains", "Main Course", "Dinner", "Sides & Salads", "Appetiser"), and
// The Woks of Life files by ingredient ("Pork", "Tofu", "Vegetables"), so the index build
// folds their label into a few plain courses. Almost half of all recipes have no label at
// all; for those it reads the dish's name, but only when the name says it plainly ("soup",
// "salad", "cookies"). Anything still unclear stays unlabeled and only shows up when no
// course is picked: a wrong course hides a recipe, a missing one just leaves it out of a
// filter.

/** The courses, in the order the filter lists them. [id, label] */
export const COURSES = [
  ['main', 'Mains'],
  ['side', 'Sides and salads'],
  ['soup', 'Soups'],
  ['starter', 'Starters and snacks'],
  ['breakfast', 'Breakfast'],
  ['dessert', 'Desserts and sweets'],
  ['bread', 'Bread'],
  ['sauce', 'Sauces and pantry'],
  ['drink', 'Drinks'],
];

// Checked in this order, first match wins, so "Sweets and desserts" is dessert before
// anything else and "Soups & sandwiches" is soup, not main.
const FROM_LABEL = [
  ['drink', /drink|beverage|cocktail/],
  ['dessert', /dessert|sweet|cake|cookie|frosting|muffin|candy|ice cream/],
  ['sauce', /sauce|condiment|dressing|pantry|homemade ingredient|seasoning|stock|\bdips?\b/],
  ['soup', /soup/],
  ['breakfast', /breakfast|brunch/],
  ['starter', /appeti[sz]er|starter|snack|finger food|party food|dim sum/],
  ['side', /^sides?\b|side dish|side salad|sides & salads|^salads?$|^vegetab|^veggie/],
  ['bread', /bread|pizza|bakery/],
  ['main', /main|dinner|lunch|meal|^(pork|chicken|beef|lamb|fish|seafood|poultry|shrimp|tofu|eggs?|rice|noodles?|pasta|curr(y|ies)|bbq|barbecue|stir fry|sushi|bento|sandwich(es)?|dumplings?)\b/],
];

// From the dish's name, only for recipes with no label. Plain words only.
const FROM_NAME = [
  ['drink', /\b(smoothie|lemonade|latte|cocktail|milk tea|bubble tea|iced tea|punch|lassi|horchata)\b/],
  ['dessert', /\b(cakes?|cupcakes?|cheesecake|cookies?|brownies?|blondies?|tarts?|pudding|ice cream|sorbet|mochi|macarons?|fudge|truffles|meringues?|custard|cobbler|crumble|galette|frosting|candy|mousse|panna cotta|tiramisu|jelly|agar)\b/],
  // Only when the name ends on it and isn't a dish served with it ("Ribs with BBQ Sauce").
  ['sauce', /^(?!.*\b(with|in|and)\b).*\b(sauce|dressing|vinaigrette|chili oil|chilli oil|chili crisp|paste|stock|broth|marinade|seasoning|spice (mix|blend)|pickles?|jam|syrup)$/],
  ['soup', /\b(soup|congee|jook|chowder|bisque|pho|ramen|miso shiru|gazpacho)\b/],
  ['breakfast', /\b(pancakes?|waffles?|oatmeal|porridge|granola|french toast|omelet(te)?|frittata|breakfast)\b/],
  ['bread', /\b(bread|loaf|focaccia|baguette|bagels?|brioche|pizza dough|flatbread|naan|(flour|corn) tortillas?|biscuits)\b/],
  ['side', /\b(salad|slaw)\b/],
];

// A name this plain beats the site's label when the label says main or side: sites file
// dressings and pastes under "Salads" and "Main Course", and jellies under "Sides".
const OVERRIDES = new Set(['sauce', 'dessert', 'drink']);

const clean = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/&amp;?/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** A course id for a recipe, from its site's label and its name, or '' when it isn't clear. */
export function courseOf(label, name) {
  const l = clean(label);
  // Leave out bracketed bits ("Peanut Dressing (Salad Kaeg)") so a name can end on its kind.
  const n = clean(name).replace(/\s*\([^)]*\)/g, '').trim();
  const byName = () => {
    for (const [id, re] of FROM_NAME) if (re.test(n)) return id;
    return '';
  };
  // A site's mixed shelf: decide by the name, and call it a main if the name doesn't say.
  if (/soups? & sandwich/.test(l)) return courseOf('', name) || 'main';
  if (l)
    for (const [id, re] of FROM_LABEL)
      if (re.test(l)) {
        const named = id === 'main' || id === 'side' ? byName() : '';
        return OVERRIDES.has(named) ? named : id;
      }
  return n ? byName() : '';
}

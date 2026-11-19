// Which cuisine a recipe is filed under. Sites write this about 150 different ways
// ("Italian-esque", "American/Chinese", "asian fusioin", "Snanish"), some of them aren't
// cuisines at all ("Christmas", "Dog Food"), and a site with no label of its own gets its
// creator's usual cuisine, which is wrong for the dishes they cook from somewhere else (Hot
// Thai Kitchen's Mapo Tofu). The index build folds all that into the names people would pick.

// Labels as the sites write them, folded into one name. Keys are lowercase.
const FOLD = {
  'american/chinese': 'Chinese American',
  'chinese american': 'Chinese American',
  'chinese-american': 'Chinese American',
  'american chinese': 'Chinese American',
  'american chinese fusion': 'Chinese American',
  'chinese american fusion': 'Chinese American',
  'american-italian': 'Italian American',
  'thai fusion': 'Thai',
  'asian fusion': 'Asian',
  'asian fusioin': 'Asian',
  'southeast asian': 'Asian',
  'asian/american': 'Fusion',
  'asian american fusion': 'Fusion',
  'chinese fusion': 'Fusion',
  'fusion japanese': 'Fusion',
  'korean mexican fusion': 'Fusion',
  'western': 'Western', // what the sites wrote; RecipeTin Eats is Australian, so not "American"
  'western food': 'Western',
  'north american': 'American',
  'australia': 'Australian',
  'aussie': 'Australian',
  'italia': 'Italian',
  'snanish': 'Spanish',
  'argentina': 'Argentinian',
  'singapore': 'Singaporean',
  'bali': 'Indonesian',
  'latino': 'Latin American',
  'arabic': 'Middle Eastern',
  'english': 'British',
  'louisiana': 'Cajun',
  'basque country': 'Basque',
  'turkish regional': 'Turkish', // Ozlem's Turkish Table: "Turkish Regional Cuisine - Antakya Cuisine"
  'turkish regional cuisine': 'Turkish',
};
// Labels that aren't a cuisine: the recipe is left without one.
const NOT_A_CUISINE = /^(christmas|easter|holiday( recipes)?|festive|baking|desserts?|dinner|soups?|dog food|vegan|miscellaneous|universal|anime|bbq|tropical!?|any flavour you want!?)$/;
// "Thai-ish", "Greek(ish)", "French-style", "Portuguese inspired", "Mediterranean vibes", "Modern Vietnamese".
const HEDGE = /(\s*\(ish\)|-ish|[\s-]*esque|[\s-]+(style|syle|inspired|influence|vibes))$/;

/** A cuisine name from a site's label, or '' when it isn't one. */
export function foldCuisine(label) {
  let key = String(label || '').split(/[,;|]/)[0].trim().toLowerCase();
  key = key.replace(/\s+recipes?$/, ''); // Rasa Malaysia: "Thai Recipes", "American Recipes"
  if (!key || NOT_A_CUISINE.test(key)) return '';
  if (FOLD[key]) return FOLD[key];
  key = key.replace(/^(modern|contemporary)\s+/, '').replace(HEDGE, '').replace(/\s+-\s+.*$/, '').trim();
  if (FOLD[key]) return FOLD[key];
  key = key.split('/')[0].trim();
  if (!key || NOT_A_CUISINE.test(key)) return '';
  return (FOLD[key] || key).replace(/\b\w/g, (ch) => ch.toUpperCase()).replace(/ Cuisine$/, '');
}

// A cuisine named in a dish's name. Only where the name leads with it ("Filipino Chicken
// Adobo", "Nasi Goreng (Indonesian Fried Rice)", "Pancit Canton - Filipino…"), and not when
// the next word makes it an ingredient ("Chinese Sausage Fried Rice", "Chinese Broccoli").
const NAMED = {
  chinese: 'Chinese', cantonese: 'Chinese', sichuan: 'Chinese', japanese: 'Japanese', korean: 'Korean', thai: 'Thai',
  vietnamese: 'Vietnamese', indian: 'Indian', italian: 'Italian', mexican: 'Mexican', french: 'French', greek: 'Greek',
  spanish: 'Spanish', filipino: 'Filipino', malaysian: 'Malaysian', indonesian: 'Indonesian', taiwanese: 'Taiwanese',
  singaporean: 'Singaporean', burmese: 'Burmese', turkish: 'Turkish', lebanese: 'Lebanese', hawaiian: 'Hawaiian',
};
const INGREDIENT_NEXT = /^(sausages?|broccoli|cabbage|greens|chives?|celery|eggplants?|bbq|barbecue|five|5|coffee|basil|chil[ie]s?|chilli|mustard|kale|spinach|leeks?|yams?|okra|pears?|radish|cucumbers?|mint|coriander|oregano|toast|fries|yogh?urt|seasoning|mayo|mayonnaise|sweet|pumpkin|donuts?|doughnuts?|long|soy|tea|peppers?|pepper-\w+)$/;

// Dishes that belong to one cuisine whoever cooks them. Checked only when a site's usual
// cuisine is all the recipe has to go on.
const DISHES = [
  [/\bmapo (tofu|dofu|doufu)\b/, 'Chinese'],
  [/\bkung pao\b/, 'Chinese'],
  [/\bchar siu\b/, 'Chinese'],
  [/\bdan dan\b/, 'Chinese'],
  [/\bbibimbap\b/, 'Korean'],
  [/\bbulgogi\b/, 'Korean'],
  [/\bbanh mi\b/, 'Vietnamese'],
  [/\brendang\b/, 'Indonesian'],
  [/\bbutter chicken\b|\btikka masala\b|\bbiryani\b/, 'Indian'],
];

/** The cuisine a dish's name leads with, or ''. */
export function cuisineInName(name) {
  const n = String(name || '').toLowerCase();
  for (const part of n.split(/\s*[(\-–—:|]\s*/)) {
    const ws = part.replace(/[^a-z0-9/ -]/g, ' ').trim().split(/[\s/]+/);
    const c = NAMED[ws[0]];
    if (c && !INGREDIENT_NEXT.test(ws[1] || '')) return c;
  }
  // "… - Thai Style", "(Japanese-Style)", "Japanese Style Pepper Steak"
  const styled = n.match(/\b([a-z]+)[\s-]style\b/);
  return (styled && NAMED[styled[1]]) || '';
}

/**
 * A recipe's cuisine: its site's label, folded; or with no label, the site's usual cuisine.
 * The dish's name wins in two cases. When it names the site's usual cuisine, that's what it
 * is, whatever the label says (Sudachi files "Japanese Style Mapo Tofu" under Chinese). And
 * when the site's usual cuisine is all there is to go on, a name that leads with another
 * cuisine, or a dish that belongs to one, is filed there (Hot Thai Kitchen's "Filipino
 * Chicken Adobo" and "Mapo Tofu").
 */
export function cuisineOf(label, usual, name) {
  const own = foldCuisine(label);
  const fallback = foldCuisine(usual);
  const cuisine = own || fallback;
  if (!fallback || !name) return cuisine;
  const n = String(name).toLowerCase();
  if (new RegExp(`\\b${fallback.toLowerCase()}\\b`).test(n)) return fallback;
  if (cuisine !== fallback) return cuisine;
  const named = cuisineInName(name);
  if (named) return named;
  for (const [re, c] of DISHES) if (re.test(n)) return c;
  return cuisine;
}

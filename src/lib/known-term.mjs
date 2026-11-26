// What a search's words are, when they are something on finDish's own lists.
//
// Analytics never carries what someone typed (AGENTS.md, "Autocapture never carries typed
// words"). This is the one way a search's subject is counted (Kyle, 2026-11-26: "stick with
// search terms for now so we get a bit more"): when the words, as a whole, are exactly a dish,
// ingredient, cuisine or creator finDish already lists, the list's own entry is returned, and
// that is what is sent. Anything else, including a known word with one extra word beside it,
// returns null and nothing about the words is sent. So an email address, a phone number or a
// sentence can never be recorded: only values the site itself published can.
//
// `norm` is search-core's `words`, joined: the same folding the search uses, so "Tacos",
// "taco" and "tacos " are one term.

/**
 * @param {string} q the search's words
 * @param {{
 *   norm: (text: string) => string,
 *   dishes: string[],
 *   ingredients: { id: string, names: string[] }[],
 *   cuisines: string[],
 *   creators: { id: string, name: string }[],
 * }} lists
 * @returns {{ kind: 'dish' | 'ingredient' | 'cuisine' | 'creator', term: string } | null}
 */
export function knownTerm(q, lists) {
  const typed = lists.norm(q || '');
  if (!typed) return null;
  for (const d of lists.dishes) if (lists.norm(d) === typed) return { kind: 'dish', term: d };
  for (const g of lists.ingredients) if (g.names.some((n) => lists.norm(n) === typed)) return { kind: 'ingredient', term: g.id };
  for (const c of lists.cuisines) if (lists.norm(c) === typed) return { kind: 'cuisine', term: c };
  for (const c of lists.creators) if (lists.norm(c.name) === typed) return { kind: 'creator', term: c.id };
  return null;
}

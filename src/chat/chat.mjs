// Ask: someone types what they want in their own words ("what can I make with fish, kimchi
// and onions?") and Claude turns it into a Findish search. The experiment Kyle started on
// 2026-11-16, only shown at findish.now/?chat=1 for now.
//
// How it works: Claude gets two tools. `search_recipes` runs the same search as the MCP
// server (src/mcp/search.mjs) so it can see what's there and loosen a search that finds too
// little. `show_results` ends the turn: the search to show on the page plus a sentence or two.
// Claude never writes recipe names or links itself; the page shows the results with its own
// cards, so nothing is made up and no method is ever reproduced.
//
// This file has no network code: `callModel` is passed in (src/chat/anthropic.mjs in the
// Worker, a fake in the tests).

import { creatorFor, cuisineFor, ingredientFor, searchRecipes, words } from '../mcp/search.mjs';

export const LIMITS = {
  turns: 8, // messages kept from the conversation (four back-and-forths)
  chars: 400, // longest message someone can send
  rounds: 3, // searches Claude can try before it has to show one
  maxTokens: 400, // longest answer per call
  replyChars: 300, // longest sentence shown back
};

const SEARCH = {
  query: { type: 'string', description: "Words for the dish, matched in recipe names, for example 'mapo tofu' or 'noodle soup'. Not for ingredients." },
  ingredients: { type: 'array', items: { type: 'string' }, maxItems: 8, description: "Things to cook with, one per item, by plain name: ['salmon', 'kimchi', 'onion']. A recipe must use at least one; more is better." },
  without: { type: 'array', items: { type: 'string' }, maxItems: 8, description: "Ingredients to leave out: ['pork', 'peanuts']." },
  diet: { type: 'string', enum: ['vegetarian', 'vegan'] },
  course: { type: 'string', enum: ['main', 'side', 'soup', 'starter', 'breakfast', 'dessert', 'bread', 'sauce', 'drink'] },
  cuisine: { type: 'string', description: "A cuisine like 'Korean', 'Thai', 'Japanese', 'Mexican'." },
  max_minutes: { type: 'integer', minimum: 5, maximum: 600, description: 'Only recipes ready in at most this many minutes.' },
  creator: { type: 'string', description: "Only one creator, by name, when the person asks for one: 'The Woks of Life', 'Kenji'." },
};

const TOOLS = [
  {
    name: 'search_recipes',
    description: 'Search the Findish index to see what it holds. Returns how many recipes match and the top few names, with which of the asked-for ingredients each uses. Use it to check a search before showing it.',
    input_schema: { type: 'object', properties: SEARCH },
  },
  {
    name: 'show_results',
    description: 'Show a search on the page and say a sentence or two about it. Always call this last, exactly once. With no search fields, the page keeps what it shows.',
    input_schema: {
      type: 'object',
      properties: {
        reply: { type: 'string', description: 'One or two short, plain sentences. No recipe names, no links, no lists.' },
        ...SEARCH,
      },
      required: ['reply'],
    },
  },
];

const SYSTEM = `You are Ask, the search helper on Findish (findish.now), a recipe search across independent cooks' own sites. People describe what they want; you turn it into a search.

- Find the search: put dish words in query and things to cook with in ingredients, using the person's own ingredient words as plain names ("onions and fish" is ["onion", "fish"]). Never swap a general ingredient for specific ones: "fish", "seafood", "meat", "greens" or "cheese" already find every kind, and "fish" never includes fish sauce. Only name specific kinds when the person did.
- Check it with search_recipes. If it finds fewer than 3 recipes, loosen it once or twice (fewer ingredients, drop the time or cuisine) and say what you loosened.
- Then call show_results with the search to show and one or two short sentences, like "Three recipes use all three. I added ones that use kimchi with fish or onion."
- Never write recipe names, links, steps or amounts. The page shows the recipes, and every one opens on its creator's site.
- You only find recipes. For anything else (cooking questions, substitutions, other topics), call show_results with no search fields and say in one sentence that you can only help find recipes here.
- Plain, friendly, short. No exclamation marks, no emoji, no em dashes.`;

/** Keep only a well-formed conversation that ends with the person's message, or null. */
export function cleanMessages(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = [];
  for (const m of raw.slice(-LIMITS.turns)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;
    const content = m.content.trim().slice(0, m.role === 'user' ? LIMITS.chars : LIMITS.replyChars + 300);
    if (!content) return null;
    out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift(); // the API wants the person first
  if (!out.length || out.at(-1).role !== 'user') return null;
  return out;
}

/** What Claude sees from a search: the count and a few names, never more. */
export function summarize(result) {
  if (result.error) return { error: result.error };
  return {
    total: result.total_recipes,
    top: result.recipes.slice(0, 6).map((r) => (r.uses ? `${r.name} (uses ${r.uses.join(', ')})` : r.name)),
    ...(result.notes ? { notes: result.notes } : {}),
  };
}

/**
 * Turn a search into the page's own address parameters (src/scripts/search.ts readUrl), so
 * the page shows it exactly as if the person had built it. Anything the index doesn't know
 * (an ingredient by another name, a cuisine it doesn't have) becomes words or is dropped.
 */
export function pageQuery(ready, s = {}) {
  const { index } = ready;
  const p = new URLSearchParams();
  const extra = [];
  const ids = (list, unknown) => {
    const found = [];
    for (const phrase of (Array.isArray(list) ? list : []).slice(0, 8)) {
      if (typeof phrase !== 'string') continue;
      const pos = ingredientFor(ready, phrase);
      if (pos == null) unknown?.push(phrase);
      else if (!found.includes(index.ing[pos][0])) found.push(index.ing[pos][0]);
    }
    return found;
  };
  const withIds = ids(s.ingredients, extra);
  const notWords = [];
  const withoutIds = ids(s.without, notWords);
  const q = words([typeof s.query === 'string' ? s.query : '', ...extra].join(' ')).join(' ');
  if (q) p.set('q', q.slice(0, 120));
  if (withIds.length) p.set('with', withIds.join(','));
  const creator = typeof s.creator === 'string' && creatorFor(ready, s.creator);
  if (creator) p.set('site', creator.id);
  const time = Math.round(Number(s.max_minutes));
  if (time > 0 && time <= 600) p.set('time', String(time));
  const cuisine = typeof s.cuisine === 'string' && cuisineFor(ready, s.cuisine);
  if (cuisine) p.set('cuisine', cuisine);
  if ((index.courses || []).some(([id]) => id === s.course)) p.set('course', s.course);
  if (withoutIds.length) p.set('without', withoutIds.join(','));
  const not = notWords.flatMap((w) => words(w).slice(0, 1));
  if (not.length) p.set('not', not.join(','));
  if (s.diet === 'vegetarian' || s.diet === 'vegan') p.set('diet', s.diet);
  return p.toString();
}

const clip = (text) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > LIMITS.replyChars ? `${t.slice(0, LIMITS.replyChars - 1).trimEnd()}…` : t;
};

/**
 * One turn of Ask: the conversation so far (from cleanMessages) in, a reply and the page's
 * search parameters out. Throws if Claude can't be reached; the endpoint falls back then.
 */
export async function chat(ready, messages, callModel) {
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));
  for (let round = 0; round <= LIMITS.rounds; round++) {
    const res = await callModel({
      system: SYSTEM,
      max_tokens: LIMITS.maxTokens,
      tools: TOOLS,
      // Always a tool, never free text; on the last round, it has to show something.
      tool_choice: round === LIMITS.rounds ? { type: 'tool', name: 'show_results' } : { type: 'any' },
      messages: convo,
    });
    const uses = (res.content || []).filter((b) => b.type === 'tool_use');
    const show = uses.find((u) => u.name === 'show_results');
    if (show) return { reply: clip(show.input?.reply), query: pageQuery(ready, show.input), searches: round };
    if (!uses.length) throw new Error('Claude answered without a tool');
    convo.push({ role: 'assistant', content: res.content });
    convo.push({
      role: 'user',
      content: uses.map((u) => ({
        type: 'tool_result',
        tool_use_id: u.id,
        content: JSON.stringify(summarize(searchRecipes(ready, { ...u.input, limit: 6, videos: false }))),
      })),
    });
  }
  throw new Error('Claude never showed a search');
}

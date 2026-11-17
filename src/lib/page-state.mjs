// Small, pure pieces of the search page (src/scripts/search.ts and src/scripts/chat.ts),
// kept apart from the DOM so `npm test` can run them: the order tags sit in, the words that
// go in the address, the tab's title, and when Enter may send what's typed to Ask.

/** What's typed, ready for the address: spaces tidied, and no punctuation left on the end ("mapo tofu." -> "mapo tofu"). */
export function cleanQ(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.,;:!?…]+$/u, '');
}

/**
 * The order tags show in, and come off in with Backspace: the order they were added.
 * `before` is the order so far; `now` is every tag the search has (in the page's usual
 * order). Tags that are gone drop out; new ones go on the end.
 */
export function tagOrder(before, now) {
  const have = new Set(now);
  const kept = before.filter((k) => have.has(k));
  const seen = new Set(kept);
  return [...kept, ...now.filter((k) => !seen.has(k))];
}

/** "a, b and c" */
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/**
 * The tab's title for a search, so tabs and history can be told apart: "mapo tofu: Findish",
 * "ginger and tofu: Findish". `parts` is the words, then the tags' labels. Nothing searched
 * gives back `home`.
 */
export function titleFor(parts, home, name = 'Findish') {
  const said = parts.map((p) => String(p || '').trim()).filter(Boolean);
  if (!said.length) return home;
  const text = said.length > 3 ? `${said.slice(0, 3).join(', ')} and more` : said.length > 1 && said[0].includes(' ') ? said.join(', ') : andList(said);
  return `${text.slice(0, 80)}: ${name}`;
}

/** A dish name from the address ("sides to go with …"): letters, numbers and spaces only, so it can't carry markup. */
export function dishName(text) {
  return String(text ?? '')
    .replace(/[^\p{L}\p{N}' -]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** "Nothing here has “x”, so it was left out." for the words a search dropped. */
export function ignoredSentence(ignored, quote = (w) => `“${w}”`) {
  if (!ignored.length) return '';
  const said = ignored.map(quote);
  const list = said.length < 2 ? said[0] : `${said.slice(0, -1).join(', ')} or ${said.at(-1)}`;
  return `Nothing here has ${list}, so ${ignored.length === 1 ? 'it was' : 'they were'} left out.`;
}

const fold = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * A site Findish only links to (Serious Eats), when what was typed names it: gives back the
 * site and the words left over, to hand to that site's own search. Otherwise null.
 */
export function linkOnlyTyped(text, sites) {
  const typed = ` ${fold(text)} `;
  for (const site of sites || []) {
    const name = fold(site.name);
    if (!name || !typed.includes(` ${name} `)) continue;
    const rest = typed
      .replace(` ${name} `, ' ')
      .replace(/ (from|by|on|at|recipes?) /g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { site, rest };
  }
  return null;
}

/**
 * Whether pressing Enter sends what's typed to Ask (it leaves the device) or searches the
 * words here. Ask only gets it when the person picked the "Ask" option themselves (`how`
 * is 'ask'), when Ask's results are up and this carries on that chat, or when it reads
 * like a question and they have already chosen Ask once this visit. "Search for these
 * words" (`how` is 'plain') never goes to Ask.
 */
export function goesToAsk({ on, how = 'enter', text = '', fromAsk = false, question = false, chosen = false }) {
  if (!on || !String(text).trim() || how === 'plain') return false;
  if (how === 'ask') return true;
  return fromAsk || (question && chosen);
}

/** The address's search, as the key Ask's answers are remembered under for the visit: no "?", no chat switch. */
export function askKey(search) {
  const p = new URLSearchParams(String(search ?? '').replace(/^\?/, ''));
  p.delete('chat');
  return p.toString();
}

/** What Ask is sent: each question as typed, each earlier answer as only the search the page showed for it. */
export function askMessages(turns) {
  return turns.map((t) => (t.role === 'user' ? { role: 'user', content: t.content } : { role: 'assistant', showed: t.showed || '' }));
}

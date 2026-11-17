// Small, pure pieces of the search page (src/scripts/search.ts and src/scripts/chat.ts),
// kept apart from the DOM so `npm test` can run them: the order tags sit in, the words that
// go in the address, the tab's title, when Enter may send what's typed to Ask, the order
// results are put in, the "Narrow it" line, and the search box's completions. (What the
// page keeps on the device is in kept.mjs.)

/** The longest search the page keeps: as long as a question to Ask can be. */
export const MAX_Q = 400;
const END_MARK = new Set([' ', '.', ',', ';', ':', '!', '?', '…']);

/**
 * What's typed, ready for the address: spaces tidied, no punctuation left on the end ("mapo
 * tofu." -> "mapo tofu"), and no longer than MAX_Q, so a link made to be enormous can't keep
 * the page busy. The end is trimmed one character at a time, not with a pattern, which
 * would look again from every punctuation mark in a long run of them.
 */
export function cleanQ(text) {
  const s = String(text ?? '')
    .slice(0, MAX_Q * 4)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_Q);
  let end = s.length;
  while (end && END_MARK.has(s[end - 1])) end--;
  return s.slice(0, end);
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

/**
 * The words of a link like /?q=quick+vegetarian+dinner (what the site's SearchAction hands
 * out), when `q` is the only thing the address searches for: those are read as a typed
 * sentence, so the link finds what typing it would. '' when the address also holds tags or
 * filters (then `q` is just the words, as the page itself wrote it). Ask's switch and
 * campaign tags don't count as part of the search.
 */
export function soleQuery(search) {
  const p = new URLSearchParams(String(search ?? '').replace(/^\?/, ''));
  let q = '';
  for (const [k, v] of p) {
    if (k === 'q') q = v;
    else if (k !== 'chat' && !k.startsWith('utm_') && v) return '';
  }
  return cleanQ(q);
}

/**
 * Results in the order asked for. '' leaves the search's own order (best match). 'quickest':
 * shortest time first, recipes that give no time last. 'newest': found most recently first.
 * Equal ones keep the search's order.
 */
export function sortHits(hits, order) {
  if (order === 'quickest') return [...hits].sort((a, b) => (a.r.min ?? 1e9) - (b.r.min ?? 1e9));
  if (order === 'newest') return [...hits].sort((a, b) => (a.r.added < b.r.added ? 1 : a.r.added > b.r.added ? -1 : 0));
  return hits;
}

/** "Uses all 3", "Uses 2 of 3": the heading over ingredient results that use `used` of the `total` ingredients picked. */
export function coverLabel(used, total) {
  return used >= total ? `Uses ${total === 2 ? 'both' : `all ${total}`}` : `Uses ${used} of ${total}`;
}

/**
 * Ways to narrow the results on the page, from the results themselves: up to three
 * cuisines, "30 minutes or less" (or an hour), and vegetarian. `rows` is each result's
 * { cuisine, min }; `set` says which filters are already chosen; `vegetarian` is how many
 * a vegetarian search would keep. A way that keeps everything or nothing isn't offered,
 * and a short list gets none.
 */
export function narrowFacets(rows, { set = {}, vegetarian = 0, least = 6 } = {}) {
  const total = rows.length;
  if (total < least) return [];
  const out = [];
  const useful = (n) => n > 0 && n < total;
  if (!set.cuisine) {
    const by = new Map();
    for (const r of rows) if (r.cuisine) by.set(r.cuisine, (by.get(r.cuisine) || 0) + 1);
    const top = [...by.entries()].filter(([, n]) => useful(n)).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    for (const [c, n] of top.slice(0, 3)) out.push({ kind: 'cuisine', value: c, label: c, n });
  }
  if (!set.time) {
    for (const t of [30, 60]) {
      const n = rows.filter((r) => r.min != null && r.min <= t).length;
      if (!useful(n)) continue;
      out.push({ kind: 'time', value: String(t), label: t === 60 ? '1 hour or less' : `${t} minutes or less`, n });
      break;
    }
  }
  if (!set.diet && useful(vegetarian)) out.push({ kind: 'diet', value: 'vegetarian', label: 'vegetarian', n: vegetarian });
  return out;
}

/**
 * Dish phrases that finish what's being typed ("map" -> "mapo tofu"), from the index's list
 * (most common first). Ones that start with it come before ones where a later word does.
 * `at` is where the typed part sits in the phrase, for marking it.
 */
export function completions(phrases, text, max = 3) {
  const typed = String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trimStart();
  if (typed.trim().length < 2) return [];
  const starts = [];
  const inside = [];
  for (const phrase of phrases || []) {
    if (phrase === typed.trim()) continue;
    if (phrase.startsWith(typed)) starts.push({ phrase, at: 0 });
    else {
      const at = phrase.indexOf(` ${typed}`);
      if (at >= 0) inside.push({ phrase, at: at + 1 });
    }
    if (starts.length >= max) break;
  }
  return [...starts, ...inside].slice(0, max).map((c) => ({ ...c, length: typed.trimEnd().length }));
}

/**
 * The filters that are set, in the row's order, each as the page words it: `name` is the
 * filter ("time"), `value` what to take off (a creator's id for "site"), `label` what's
 * shown ("30 minutes or less"). `say` turns ids into words: { creator(id), course(id),
 * time(minutes), order(id) }.
 */
export function setFilters(s, say) {
  const out = [];
  if (s.show) out.push({ name: 'show', value: s.show, label: `${s.show} only` });
  if (s.course) out.push({ name: 'course', value: s.course, label: say.course(s.course) || s.course });
  if (s.cuisine) out.push({ name: 'cuisine', value: s.cuisine, label: s.cuisine });
  for (const id of s.sites || []) out.push({ name: 'site', value: id, label: `from ${say.creator(id) || id}` });
  if (s.time) out.push({ name: 'time', value: String(s.time), label: `${say.time(s.time)} or less` });
  if (s.diet) out.push({ name: 'diet', value: s.diet, label: s.diet });
  if (s.sort) out.push({ name: 'order', value: s.sort, label: say.order(s.sort) || s.sort });
  return out;
}

/** The one filter control on a narrow screen: "Filters", or "Filters, 2 set" (creators count once). */
export function filtersLabel(set) {
  const n = new Set(set.map((f) => f.name)).size;
  return n ? `Filters, ${n} set` : 'Filters';
}

/** The sheet's button, which closes it: what it will show. "Show 11 recipes", "Show 4 videos", "Nothing matches", or "Done" with no search. */
export function showLabel(recipes, videos, blank = false) {
  if (blank) return 'Done';
  if (recipes) return `Show ${recipes.toLocaleString('en-US')} ${recipes === 1 ? 'recipe' : 'recipes'}`;
  if (videos) return `Show ${videos.toLocaleString('en-US')} ${videos === 1 ? 'video' : 'videos'}`;
  return 'Nothing matches';
}

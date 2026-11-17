// Ask: type what you want in your own words, right in the search box ("what can I make with
// fish, kimchi and onions?"), and the page shows the search for it. The chat experiment Kyle
// started on 2026-11-16. search.ts loads this file only at ?chat=1 (then for the rest of the
// visit in that tab). The server side is src/pages/api/chat.ts and src/chat/chat.mjs.
//
// Nothing is sent without the person choosing it: while a question is being typed, the
// suggestions offer "Ask: …" with a line saying it goes to Claude, next to "Search for these
// words" (search.ts). Picking Ask sends it here as a "findish:ask" event. The answer comes
// back as a sentence or two plus a search; the search goes back to search.ts as
// "findish:show", which shows it with the page's own results, tags and filters, and the
// sentence shows as one line above the results. Asking again while those results are up
// carries on the same chat ("make it vegetarian"); changing the search by hand ends it.
//
// The chat is remembered for the visit in this tab (sessionStorage, on the device), under the
// search each answer showed, so a reload or Back brings the answer back with its results.

import { track } from 'kp-design/analytics';
import { askKey, askMessages } from '../lib/page-state.mjs';
import type { Turn } from '../lib/page-state.mjs';
import '../styles/chat.css';

const MAX_TURNS = 4; // then a fresh chat, to keep each one short and cheap
const MAX_CHARS = 400;
const STORE = 'findish-ask-answers';
const KEPT = 8; // answers remembered for the visit

/** One answer, as remembered: what was asked, what Ask said, and the chat up to it. */
type Answer = { asked: string; reply: string; turns: Turn[]; plain: boolean; fresh: boolean };
let turns: Turn[] = [];
let busy = false;

const app = document.getElementById('app')!;
const searchForm = document.getElementById('search-form')!;
const statusEl = document.getElementById('status')!;
const qInput = document.getElementById('q') as HTMLInputElement;
const go = searchForm.querySelector<HTMLButtonElement>('.go')!;

const qHint = document.getElementById('q-hint');
if (qHint) qHint.textContent += ' You can also type a question: the suggestions then offer to send it to Ask, or to search its words here.';

// The answer, one block above the results.
const line = document.createElement('div');
line.className = 'ask-line';
line.hidden = true;
line.tabIndex = -1;
line.setAttribute('data-amp-mask', '');
line.innerHTML = `
  <p class="ask-asked"><span class="ask-fresh" hidden>Starting over from here. </span><button type="button" class="ask-again" aria-describedby="ask-again-hint"></button><span id="ask-again-hint" hidden>Puts your question back in the box to change it</span></p>
  <p class="ask-reply" role="status" aria-live="polite"></p>
  <p class="ask-foot"><span class="ask-about">Answered by Claude, Anthropic’s AI. What you ask isn’t kept. <a href="/privacy/#ask">Privacy</a>.</span> <button type="button" class="ask-plain">Search my words instead</button></p>`;
statusEl.before(line);
const fresh = line.querySelector<HTMLElement>('.ask-fresh')!;
const again = line.querySelector<HTMLButtonElement>('.ask-again')!;
const replyEl = line.querySelector<HTMLElement>('.ask-reply')!;
const about = line.querySelector<HTMLElement>('.ask-about')!;
const plain = line.querySelector<HTMLButtonElement>('.ask-plain')!;
let lastText = '';

// ---------------------------------------------------------------------------------------
// Remembered for the visit, on the device.

function remembered(): Record<string, Answer> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) || '{}') || {};
  } catch {
    return {};
  }
}

function remember(key: string, answer: Answer) {
  try {
    const all = Object.entries(remembered()).filter(([k]) => k !== key);
    sessionStorage.setItem(STORE, JSON.stringify(Object.fromEntries([...all, [key, answer]].slice(-KEPT))));
  } catch {
    // Private mode or a full store: the answer just won't survive a reload.
  }
}

function draw(a: Answer) {
  line.hidden = false;
  fresh.hidden = !a.fresh;
  again.textContent = `You asked: “${a.asked}”`;
  replyEl.textContent = a.reply;
  about.hidden = !a.plain; // only when Claude answered
  plain.hidden = !a.plain;
  lastText = a.asked;
}

/** The address changed (a reload, Back): bring back the answer that showed this search, or put the line away. */
function restore() {
  if (busy) return;
  const key = askKey(location.search);
  const a = key ? remembered()[key] : undefined;
  if (!a) {
    line.hidden = true;
    turns = [];
    return;
  }
  turns = a.turns;
  app.dataset.fromAsk = '1';
  draw(a);
  dispatchEvent(new Event('findish:ask-ready')); // the box's hint now offers a follow-up
}
addEventListener('findish:url', restore);

// When the person changes the search by hand, search.ts drops data-from-ask: the chat is over.
new MutationObserver(() => {
  if (!app.dataset.fromAsk && !busy) {
    line.hidden = true;
    turns = [];
  }
}).observe(app, { attributes: true, attributeFilter: ['data-from-ask'] });

const show = (query: string) => {
  const detail: { query: string; count?: number } = { query };
  dispatchEvent(new CustomEvent('findish:show', { detail }));
  return detail.count ?? 0;
};

/** The person's own words, searched by the page as if typed and entered. `notice` is shown with the count (Ask couldn't answer). */
const searchWords = (text: string, notice = '') => dispatchEvent(new CustomEvent('findish:plain', { detail: { text: text.slice(0, 120), notice } }));

plain.addEventListener('click', () => {
  turns = [];
  line.hidden = true;
  searchWords(lastText);
  track('Tapped Search Instead', {});
});

// "You asked: …" puts the question back in the box, to change and ask again.
again.addEventListener('click', () => {
  qInput.value = lastText;
  qInput.focus();
  qInput.dispatchEvent(new Event('input', { bubbles: true }));
});

function setBusy(on: boolean) {
  busy = on;
  // The old results dim and the home page's ideas step aside while Ask is looking (chat.css).
  app.toggleAttribute('data-asking', on);
  if (on) searchForm.setAttribute('aria-busy', 'true');
  else searchForm.removeAttribute('aria-busy');
  go.setAttribute('aria-disabled', String(on));
}

// While Ask is looking, the button doesn't start a second question.
searchForm.addEventListener(
  'submit',
  (e) => {
    if (!busy) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  },
  true,
);

addEventListener('findish:ask', async (e) => {
  const text = String((e as CustomEvent<{ text: string }>).detail.text || '').trim().slice(0, MAX_CHARS);
  if (!text || busy) return;
  const asked = turns.filter((t) => t.role === 'user').length;
  // A chat is short on purpose. After four questions the next one starts a new chat, and says so.
  const startsOver = !!app.dataset.fromAsk && asked >= MAX_TURNS;
  if (!app.dataset.fromAsk || startsOver) turns = [];
  turns = [...turns, { role: 'user', content: text }];
  const turn = turns.filter((t) => t.role === 'user').length;

  setBusy(true);
  draw({ asked: text, reply: 'Looking…', turns, plain: false, fresh: startsOver });
  qInput.value = '';

  const started = performance.now();
  let answer: { reply?: string; query?: string; fallback?: string; reason?: string; searches?: number } | null = null;
  let failed = '';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Earlier answers go back as the search the page showed, never as text.
      body: JSON.stringify({ messages: askMessages(turns) }),
    });
    if (res.ok) answer = await res.json();
    else failed = `http_${res.status}`;
  } catch {
    failed = 'network';
  }
  const ms = Math.round(performance.now() - started);
  setBusy(false);

  // Never the words themselves: only their length and what came back.
  const facts = { turn_number: turn, message_length: text.length, response_ms: ms };

  // It didn't go through, or Ask can't answer right now: search the person's own words here,
  // the way the page understands them, and say that's what happened.
  if (!answer?.reply || answer.fallback) {
    turns = [];
    line.hidden = true;
    track('Failed Chat Message', { ...facts, reason: answer?.fallback ? `${answer.fallback}:${answer.reason || 'unknown'}` : failed || 'no_reply' });
    searchWords(text, 'Ask isn’t available right now, so here’s a plain search for your words.');
    return;
  }

  const query = answer.query || '';
  turns = [...turns, { role: 'assistant', showed: query }];
  const count = query ? show(query) : 0;
  app.dataset.fromAsk = '1'; // set again after showing, so the chat carries on
  const kept: Answer = { asked: text, reply: answer.reply, turns, plain: true, fresh: startsOver };
  draw(kept);
  if (query) remember(askKey(query), kept);

  track('Sent Chat Message', {
    ...facts,
    showed_search: Boolean(query),
    result_count: count,
    searches: Number(answer.searches) || 0,
  });
});

restore();
dispatchEvent(new Event('findish:ask-ready'));

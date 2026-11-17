// Ask: type what you want in your own words, right in the search box ("what can I make with
// fish, kimchi and onions?"), and the page shows the search for it. The chat experiment Kyle
// started on 2026-11-16. search.ts loads this file only at ?chat=1 (then for the rest of the
// visit in that tab). The server side is src/pages/api/chat.ts and src/chat/chat.mjs.
//
// search.ts decides what reads like a question and sends it here as a "findish:ask" event.
// The answer comes back as a sentence or two plus a search; the search goes back to search.ts
// as "findish:show", which shows it with the page's own results, tags and filters, and the
// sentence shows as one line above the results. Asking again while those results are up
// carries on the same chat ("make it vegetarian"); changing the search by hand ends it.

import { track } from 'kp-design/analytics';
import '../styles/chat.css';

const MAX_TURNS = 4; // then a fresh chat, to keep each one short and cheap
const MAX_CHARS = 400;

type Message = { role: 'user' | 'assistant'; content: string };
let messages: Message[] = [];
let busy = false;

const app = document.getElementById('app')!;
const searchForm = document.getElementById('search-form')!;
const statusEl = document.getElementById('status')!;
const qInput = document.getElementById('q') as HTMLInputElement;

// No hint under the box for now (Kyle, 2026-11-16: the home page was getting cluttered).
// While Ask is hidden behind ?chat=1 the answer line carries the privacy note; a line
// before anything is sent comes back before Ask goes public.
qInput.placeholder = 'A dish, ingredient or question';
const qHint = document.getElementById('q-hint');
if (qHint) qHint.textContent += ' You can also type a question and press Enter to ask.';

// The answer, one line above the results.
const line = document.createElement('div');
line.className = 'ask-line';
line.hidden = true;
line.innerHTML = `
  <p class="ask-asked"></p>
  <p class="ask-reply" role="status" aria-live="polite"></p>
  <p class="ask-actions"><button type="button" class="ask-plain">Search my words instead</button></p>
  <p class="ask-about">Answered by Claude, Anthropic’s AI. What you ask isn’t kept. <a href="/privacy/#ask">Privacy</a></p>`;
statusEl.before(line);
const asked = line.querySelector<HTMLElement>('.ask-asked')!;
const replyEl = line.querySelector<HTMLElement>('.ask-reply')!;
const plain = line.querySelector<HTMLButtonElement>('.ask-plain')!;
let lastText = '';

// When the person changes the search by hand, search.ts drops data-from-ask: the chat is over.
new MutationObserver(() => {
  if (!app.dataset.fromAsk && !busy) {
    line.hidden = true;
    messages = [];
  }
}).observe(app, { attributes: true, attributeFilter: ['data-from-ask'] });

const show = (query: string) => {
  const detail: { query: string; count?: number } = { query };
  dispatchEvent(new CustomEvent('findish:show', { detail }));
  return detail.count ?? 0;
};

plain.addEventListener('click', () => {
  messages = [];
  line.hidden = true;
  show(new URLSearchParams({ q: lastText.slice(0, 120) }).toString());
  delete app.dataset.fromAsk; // a plain search is the person's own
  track('Tapped Search Instead', {});
});

addEventListener('findish:ask', async (e) => {
  const text = String((e as CustomEvent<{ text: string }>).detail.text || '').trim().slice(0, MAX_CHARS);
  if (!text || busy) return;
  if (!app.dataset.fromAsk || messages.filter((m) => m.role === 'user').length >= MAX_TURNS) messages = [];
  messages.push({ role: 'user', content: text });
  lastText = text;

  busy = true;
  searchForm.setAttribute('aria-busy', 'true');
  line.hidden = false;
  asked.textContent = `You asked: “${text}”`;
  replyEl.textContent = 'Looking…';
  plain.hidden = true;

  let answer: { reply?: string; query?: string; fallback?: string } | null = null;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    if (res.ok) answer = await res.json();
  } catch {
    answer = null;
  }
  busy = false;
  searchForm.removeAttribute('aria-busy');

  if (!answer?.reply) {
    messages.pop();
    replyEl.textContent = 'That didn’t go through. Try again in a moment, or search your words.';
    plain.hidden = false;
    return;
  }

  // The search goes back to Claude with the reply, so "make it vegetarian" knows what "it" is.
  messages.push({ role: 'assistant', content: answer.query ? `${answer.reply} [showed: ${answer.query}]` : answer.reply });
  const count = answer.query ? show(answer.query) : 0;
  app.dataset.fromAsk = '1'; // set again after showing, so the chat carries on
  line.hidden = false;
  asked.textContent = `You asked: “${text}”`;
  replyEl.textContent = answer.reply;
  plain.hidden = Boolean(answer.fallback);

  // Never the words themselves: only their length and what came back.
  track('Sent Chat Message', {
    turn_number: messages.filter((m) => m.role === 'user').length,
    message_length: text.length,
    showed_search: Boolean(answer.query),
    result_count: count,
    fell_back: answer.fallback || '',
  });
});

dispatchEvent(new Event('findish:ask-ready'));

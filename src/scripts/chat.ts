// Ask: say what you want in your own words and the page shows the search for it. The chat
// experiment Kyle started on 2026-11-16. search.ts loads this file only at ?chat=1 (then for
// the rest of the visit in that tab). The server side is src/pages/api/chat.ts and
// src/chat/chat.mjs.
//
// The answer is a sentence or two plus a search. The search goes back to search.ts as a
// "findish:show" event, which shows it with the page's own results, filters and tags, so
// the person can keep adjusting it by hand.

import { track } from 'kp-design/analytics';
import '../styles/chat.css';

const MAX_TURNS = 4; // then a fresh start, to keep each chat short and cheap
const MAX_CHARS = 400;

type Message = { role: 'user' | 'assistant'; content: string };
let messages: Message[] = [];
let busy = false;

const searchForm = document.getElementById('search-form')!;
const section = document.createElement('section');
section.className = 'ask';
section.setAttribute('aria-label', 'Ask');
section.innerHTML = `
  <button type="button" class="ask-toggle" id="ask-toggle" aria-expanded="false" aria-controls="ask-panel">Ask in your own words</button>
  <div class="ask-panel" id="ask-panel" hidden>
    <div class="ask-log" id="ask-log" role="log" aria-live="polite" aria-label="Your chat with Ask"></div>
    <form class="ask-form" id="ask-form">
      <label for="ask-input">What are you in the mood for?</label>
      <div class="ask-row">
        <textarea id="ask-input" name="ask" rows="2" maxlength="${MAX_CHARS}" placeholder="What can I make with fish, kimchi and onions?" required></textarea>
        <button type="submit" class="ask-send" id="ask-send">Ask</button>
      </div>
      <p class="ask-note">An experiment. What you type here goes to Claude, Anthropic’s AI, to turn into a search. Findish doesn’t keep it. <a href="/privacy/#ask">More on privacy</a></p>
      <button type="button" class="ask-new" id="ask-new" hidden>Start a new chat</button>
    </form>
  </div>`;
searchForm.after(section);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const toggle = $<HTMLButtonElement>('ask-toggle');
const panel = $('ask-panel');
const log = $<HTMLDivElement>('ask-log');
const form = $<HTMLFormElement>('ask-form');
const input = $<HTMLTextAreaElement>('ask-input');
const send = $<HTMLButtonElement>('ask-send');
const fresh = $<HTMLButtonElement>('ask-new');

function say(role: 'you' | 'ask' | 'note', text: string) {
  const li = document.createElement('p');
  li.className = `ask-${role}`;
  const who = document.createElement('span');
  who.className = 'visually-hidden';
  who.textContent = role === 'you' ? 'You: ' : 'Ask: ';
  li.append(who, text);
  log.append(li);
  li.scrollIntoView({ block: 'nearest' });
  return li;
}

function setBusy(on: boolean) {
  busy = on;
  send.disabled = on;
  send.textContent = on ? 'Looking…' : 'Ask';
  form.setAttribute('aria-busy', String(on));
}

function atLimit() {
  const done = messages.filter((m) => m.role === 'user').length >= MAX_TURNS;
  input.disabled = done;
  send.disabled = done || busy;
  fresh.hidden = !messages.length;
  if (done) input.placeholder = 'That’s the end of this chat. Start a new one to keep going.';
}

toggle.addEventListener('click', () => {
  const open = panel.hidden;
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) {
    input.focus();
    track('Opened Chat', { opened_from: document.getElementById('page')?.dataset.mode === 'home' ? 'home' : 'results' });
  }
});

fresh.addEventListener('click', () => {
  messages = [];
  log.replaceChildren();
  input.disabled = false;
  input.placeholder = 'What can I make with fish, kimchi and onions?';
  atLimit();
  input.focus();
});

// Enter sends, Shift+Enter makes a new line, like most chat boxes.
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim().slice(0, MAX_CHARS);
  if (!text || busy) return;
  messages.push({ role: 'user', content: text });
  say('you', text);
  input.value = '';
  setBusy(true);

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
  setBusy(false);

  if (!answer?.reply) {
    messages.pop();
    say('note', 'That didn’t go through. Try again in a moment.');
    input.value = text;
    atLimit();
    return input.focus();
  }

  // Ask hands its search to the page (search.ts), which shows it and says how many it found.
  const detail: { query: string; count?: number } = { query: answer.query || '' };
  if (detail.query) dispatchEvent(new CustomEvent('findish:show', { detail }));

  // The search goes back to Claude with the reply, so "make it vegetarian" knows what "it" is.
  messages.push({ role: 'assistant', content: detail.query ? `${answer.reply} [showed: ${detail.query}]` : answer.reply });
  say(answer.fallback ? 'note' : 'ask', answer.reply);

  const turn = messages.filter((m) => m.role === 'user').length;
  // Never the words themselves: only their length and what came back.
  track('Sent Chat Message', {
    turn_number: turn,
    message_length: text.length,
    showed_search: Boolean(detail.query),
    result_count: detail.count ?? 0,
    fell_back: answer.fallback || '',
  });

  atLimit();
  if (!input.disabled) input.focus();
});

atLimit();

// Scores Ask (the chat experiment) against the test questions in scripts/ask-questions.json.
// Run it after changing Ask's instructions (SYSTEM in src/chat/chat.mjs) to see what got
// better or worse, instead of spot-checking a few questions by hand.
//
//   node scripts/ask-eval.mjs                      the live site (spaced out, about 8 minutes,
//                                                  since the live rate limit is 6 a minute)
//   ANTHROPIC_API_KEY=... node scripts/ask-eval.mjs --local
//                                                  runs src/chat/chat.mjs right here against
//                                                  public/index.json (npm run build first); fast,
//                                                  and the way to try a change before pushing it
//   --only 3        just question 3
//   --match fish    the ones mentioning "fish"
//   --repeat 3      ask each question three times; a question only counts as right when every
//                   run is, so an answer that's right two times in three shows up
//
// Besides each question's own checks, every answer is checked for two things: the search it
// shows finds something (run here, on the same index), and the reply doesn't name a recipe
// or video from those results.
//
// Each question costs a fraction of a cent. Nothing is kept except the printed report.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { prepare } from '../src/mcp/search.mjs';
import { namesIn, searchShown } from '../src/chat/chat.mjs';

/** The checks a question can ask for. Anything else in `expect` is a typo, and fails. */
export const CHECKS = ['with', 'notWith', 'without', 'notWithout', 'course', 'cuisine', 'diet', 'maxTime', 'site', 'new', 'show', 'sidesFor', 'noQ', 'q', 'noSearch', 'noNames', 'minResults'];

/**
 * Every check a question's `expect` asks for, each [what was checked, passed].
 *   answer  what Ask sent back: { reply, query, fallback? }
 *   ctx     { ready, asked }: the index to run the shown search on, and everything the
 *           person typed in this chat (a dish they named may be said back). Without `ready`,
 *           the two checks that need the index are skipped.
 */
export function grade(expect, answer, ctx = {}) {
  const p = new URLSearchParams(answer.query || '');
  const list = (k) => (p.get(k) || '').split(',').filter(Boolean);
  const checks = [];
  if (answer.fallback) return [[`answered (fell back: ${answer.fallback}${answer.reason ? `, ${answer.reason}` : ''})`, false]];
  for (const k of Object.keys(expect)) if (!CHECKS.includes(k)) checks.push([`"${k}" is a check this script knows`, false]);
  for (const id of expect.with || []) checks.push([`uses ${id}`, list('with').includes(id)]);
  for (const id of expect.notWith || []) checks.push([`doesn't use ${id}`, !list('with').includes(id)]);
  for (const id of expect.without || []) checks.push([`leaves out ${id}`, list('without').includes(id)]);
  for (const id of expect.notWithout || []) checks.push([`doesn't leave out ${id}`, !list('without').includes(id)]);
  if (expect.course) checks.push([`course ${expect.course}`, p.get('course') === expect.course]);
  if (expect.cuisine) checks.push([`cuisine ${expect.cuisine}`, p.get('cuisine') === expect.cuisine]);
  if (expect.diet) checks.push([`diet ${expect.diet}`, p.get('diet') === expect.diet]);
  if (expect.maxTime) checks.push([`time ≤ ${expect.maxTime}`, Number(p.get('time')) > 0 && Number(p.get('time')) <= expect.maxTime]);
  if (expect.site) checks.push([`creator ${expect.site}`, list('site').includes(expect.site)]);
  if (expect.new) checks.push(['new this week only', p.get('new') === '1']);
  if (expect.show) checks.push([`shows only ${expect.show}`, p.get('show') === expect.show]);
  if (expect.sidesFor) checks.push([`says the sides are for "${expect.sidesFor}"`, (p.get('sidesFor') || '').toLowerCase().includes(expect.sidesFor)]);
  if (expect.noQ) checks.push(['no dish words', !p.get('q')]);
  if (expect.q) checks.push([`dish words include "${expect.q}"`, (p.get('q') || '').includes(expect.q)]);
  if (expect.noSearch) checks.push(['shows no search', !answer.query]);
  else checks.push(['shows a search', Boolean(answer.query)]);
  for (const w of expect.noNames || []) checks.push([`reply has no "${w}"`, !String(answer.reply).toLowerCase().includes(w)]);
  checks.push(['says something', Boolean(String(answer.reply || '').trim())]);

  if (ctx.ready && answer.query) {
    // What the page will show for this search, as far as the server's copy of the search knows.
    const shown = searchShown(ctx.ready, answer.query, 30);
    const found = (shown.total_recipes ?? 0) + (shown.total_videos ?? shown.videos?.length ?? 0);
    const min = expect.minResults ?? 1;
    if (min > 0) checks.push([`the search finds at least ${min} (found ${found})`, found >= min]);
    const titles = [...(shown.recipes || []).map((r) => r.name), ...(shown.videos || []).map((v) => v.title)];
    const leaked = namesIn(answer.reply, titles, [...(ctx.asked || []), p.get('q') || '', p.get('sidesFor') || '']);
    checks.push([`reply names no recipe${leaked.length ? ` (named: ${leaked.join('; ')})` : ''}`, !leaked.length]);
  }
  return checks;
}

/** A question is one ask, or a chat of several: [{ ask, expect }, ...]. */
export const turnsOf = (q) => (Array.isArray(q.turns) ? q.turns : [{ ask: q.ask, expect: q.expect || {} }]);

async function main() {
  const args = process.argv.slice(2);
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : '');
  const local = args.includes('--local');
  const only = Number(value('--only')) || 0;
  const match = value('--match').toLowerCase();
  const repeat = Math.max(1, Math.min(10, Number(value('--repeat')) || 1));
  const base = args.find((a) => a.startsWith('http')) || 'https://findish.now';

  const { questions } = JSON.parse(readFileSync(new URL('./ask-questions.json', import.meta.url), 'utf8'));
  const picked = questions
    .map((q, i) => ({ ...q, n: i + 1 }))
    .filter((q) => (!only || q.n === only) && (!match || turnsOf(q).some((t) => t.ask.toLowerCase().includes(match))));

  let ready;
  let ask; // (messages) => answer
  let pause = async () => {};
  if (local) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('Set ANTHROPIC_API_KEY for --local (never commit it).');
    const { chat, cleanMessages } = await import('../src/chat/chat.mjs');
    const { callClaude } = await import('../src/chat/anthropic.mjs');
    ready = prepare(JSON.parse(readFileSync(new URL('../public/index.json', import.meta.url), 'utf8')));
    ask = (messages) => chat(ready, cleanMessages(messages), (body, opts) => callClaude(process.env.ANTHROPIC_API_KEY, body, opts));
  } else {
    // The same index the live site searches, so the shown search can be run here too.
    ready = prepare(await (await fetch(`${base}/index.json`)).json());
    let sent = 0;
    pause = () => (sent++ ? new Promise((r) => setTimeout(r, 11_000)) : null); // stay under 6 a minute
    ask = async (messages) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }) });
        const out = await res.json();
        if (out.fallback !== 'busy') return out;
        await new Promise((r) => setTimeout(r, 30_000)); // over the rate limit: wait and try again
      }
      return { fallback: 'busy', reply: '', query: '' };
    };
  }

  let passed = 0;
  let total = 0;
  let perfect = 0;
  const flaky = [];
  for (const q of picked) {
    let goodRuns = 0;
    for (let run = 1; run <= repeat; run++) {
      const messages = [];
      const asked = [];
      let allOk = true;
      for (const [t, turn] of turnsOf(q).entries()) {
        await pause();
        messages.push({ role: 'user', content: turn.ask });
        asked.push(turn.ask);
        let answer;
        try {
          answer = await ask(messages);
        } catch (e) {
          answer = { fallback: 'error', reason: e.reason || e.message, reply: '', query: '' };
        }
        // What the page sends back next time: only the search it showed.
        messages.push({ role: 'assistant', showed: answer.query || '' });
        const checks = grade(turn.expect || {}, answer, { ready, asked });
        const ok = checks.filter(([, pass]) => pass).length;
        passed += ok;
        total += checks.length;
        if (ok !== checks.length) allOk = false;
        const label = `${q.n}${turnsOf(q).length > 1 ? `.${t + 1}` : ''}${repeat > 1 ? ` (run ${run})` : ''}`;
        console.log(`\n${ok === checks.length ? 'PASS' : 'MISS'} ${label}. ${turn.ask}`);
        console.log(`  search: ${decodeURIComponent(answer.query || '(none)')}`);
        console.log(`  reply:  ${answer.reply}`);
        for (const [what, pass] of checks) if (!pass) console.log(`  missed: ${what}`);
      }
      if (allOk) goodRuns++;
    }
    if (goodRuns === repeat) perfect++;
    else if (goodRuns) flaky.push(`${q.n} (${goodRuns} of ${repeat})`);
  }
  console.log(`\n${perfect} of ${picked.length} questions fully right${repeat > 1 ? ` on all ${repeat} runs` : ''}, ${passed} of ${total} checks passed (${local ? 'local' : base}).`);
  if (flaky.length) console.log(`Right only some of the time: ${flaky.join(', ')}.`);
  if (perfect !== picked.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

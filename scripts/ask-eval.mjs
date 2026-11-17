// Scores Ask (the chat experiment) against the test questions in scripts/ask-questions.json.
// Run it after changing Ask's instructions (SYSTEM in src/chat/chat.mjs) to see what got
// better or worse, instead of spot-checking a few questions by hand.
//
//   node scripts/ask-eval.mjs                      the live site (spaced out, about 6 minutes,
//                                                  since the live rate limit is 6 a minute)
//   ANTHROPIC_API_KEY=... node scripts/ask-eval.mjs --local
//                                                  runs src/chat/chat.mjs right here against
//                                                  public/index.json (npm run build first); fast,
//                                                  and the way to try a change before pushing it
//   add --only 3 to run just question 3, or --match fish to run the ones mentioning "fish"
//
// Each question costs a fraction of a cent. Nothing is kept except the printed report.

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const local = args.includes('--local');
const only = args.includes('--only') ? Number(args[args.indexOf('--only') + 1]) : 0;
const match = args.includes('--match') ? args[args.indexOf('--match') + 1].toLowerCase() : '';
const base = args.find((a) => a.startsWith('http')) || 'https://findish.now';

const { questions } = JSON.parse(readFileSync(new URL('./ask-questions.json', import.meta.url), 'utf8'));
const picked = questions
  .map((q, i) => ({ ...q, n: i + 1 }))
  .filter((q) => (!only || q.n === only) && (!match || q.ask.toLowerCase().includes(match)));

let ask;
if (local) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Set ANTHROPIC_API_KEY for --local (never commit it).');
  const { prepare } = await import('../src/mcp/search.mjs');
  const { chat } = await import('../src/chat/chat.mjs');
  const { callClaude } = await import('../src/chat/anthropic.mjs');
  const ready = prepare(JSON.parse(readFileSync(new URL('../public/index.json', import.meta.url), 'utf8')));
  ask = (text) => chat(ready, [{ role: 'user', content: text }], (body) => callClaude(process.env.ANTHROPIC_API_KEY, body));
} else {
  ask = async (text) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: text }] }),
      });
      const out = await res.json();
      if (out.fallback !== 'busy') return out;
      await new Promise((r) => setTimeout(r, 30_000)); // over the rate limit: wait and try again
    }
    return { fallback: 'busy', reply: '', query: '' };
  };
}

/** Every check a question's `expect` asks for, each [what was checked, passed]. */
export function grade(expect, answer) {
  const p = new URLSearchParams(answer.query || '');
  const list = (k) => (p.get(k) || '').split(',').filter(Boolean);
  const checks = [];
  if (answer.fallback) return [[`answered (fell back: ${answer.fallback})`, false]];
  for (const id of expect.with || []) checks.push([`uses ${id}`, list('with').includes(id)]);
  for (const id of expect.notWith || []) checks.push([`doesn't use ${id}`, !list('with').includes(id)]);
  if (expect.course) checks.push([`course ${expect.course}`, p.get('course') === expect.course]);
  if (expect.cuisine) checks.push([`cuisine ${expect.cuisine}`, p.get('cuisine') === expect.cuisine]);
  if (expect.diet) checks.push([`diet ${expect.diet}`, p.get('diet') === expect.diet]);
  if (expect.maxTime) checks.push([`time ≤ ${expect.maxTime}`, Number(p.get('time')) > 0 && Number(p.get('time')) <= expect.maxTime]);
  if (expect.noQ) checks.push(['no dish words', !p.get('q')]);
  if (expect.q) checks.push([`dish words include "${expect.q}"`, (p.get('q') || '').includes(expect.q)]);
  if (expect.noSearch) checks.push(['shows no search', !answer.query]);
  else checks.push(['shows a search', Boolean(answer.query)]);
  for (const w of expect.noNames || []) checks.push([`reply has no "${w}"`, !String(answer.reply).toLowerCase().includes(w)]);
  return checks;
}

let passed = 0;
let total = 0;
let perfect = 0;
for (const [i, q] of picked.entries()) {
  if (!local && i) await new Promise((r) => setTimeout(r, 11_000)); // stay under 6 a minute
  let answer;
  try {
    answer = await ask(q.ask);
  } catch (e) {
    answer = { fallback: `error: ${e.message}`, reply: '', query: '' };
  }
  const checks = grade(q.expect, answer);
  const ok = checks.filter(([, pass]) => pass).length;
  passed += ok;
  total += checks.length;
  if (ok === checks.length) perfect++;
  console.log(`\n${ok === checks.length ? 'PASS' : 'MISS'} ${q.n}. ${q.ask}`);
  console.log(`  search: ${decodeURIComponent(answer.query || '(none)')}`);
  console.log(`  reply:  ${answer.reply}`);
  for (const [what, pass] of checks) if (!pass) console.log(`  missed: ${what}`);
}
console.log(`\n${perfect} of ${picked.length} questions fully right, ${passed} of ${total} checks passed (${local ? 'local' : base}).`);

#!/usr/bin/env node
// Before a crawl starts in GitHub Actions: is another crawl already reading one of these sites?
// If so this run stands down (a site only ever gets one request at a time), instead of waiting
// and using up build minutes. A run started by a push (the 5-page smoke test) just skips; a
// weekly or hand-started run fails with a message, so it shows up and can be started again.
// Writes go=true|false to $GITHUB_OUTPUT.
import { appendFileSync } from 'node:fs';
import { ahead } from './lib/turns.mjs';

const { GITHUB_REPOSITORY: repo, GITHUB_RUN_ID, GH_TOKEN: token, GITHUB_OUTPUT: out, GITHUB_EVENT_NAME: event, RUN_TITLE } = process.env;
const say = (go) => out && appendFileSync(out, `go=${go}\n`);
const mine = { id: Number(GITHUB_RUN_ID), title: RUN_TITLE || 'Crawl: all sites', started: new Date().toISOString() };

let runs;
try {
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/crawl.yml/runs?status=in_progress&per_page=50`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  runs = (await res.json()).workflow_runs.map((r) => ({ id: r.id, title: r.display_title, started: r.run_started_at || r.created_at }));
} catch (err) {
  // Not being able to ask must not stop the weekly crawl.
  console.log(`Couldn't check for other crawls (${err.message}); going ahead.`);
  say(true);
  process.exit(0);
}

const busy = ahead(mine, runs);
if (!busy.length) {
  console.log(`No other crawl is reading these sites (${runs.length - 1 < 0 ? 0 : runs.length - 1} other crawl(s) running).`);
  say(true);
  process.exit(0);
}
const who = busy.map((r) => `run ${r.id} (${r.title})`).join(', ');
console.log(`Another crawl is already reading some of these sites: ${who}.`);
say(false);
if (event === 'push') {
  console.log('This is the smoke test for a push, so it is skipped.');
  process.exit(0);
}
console.log('Start this crawl again when that one has finished.');
process.exit(1);

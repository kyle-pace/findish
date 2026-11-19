#!/usr/bin/env node
// Before a crawl starts in GitHub Actions: is another crawl already reading one of these sites?
// If so this run stands down (a site only ever gets one request at a time), instead of waiting
// and using up build minutes. A run started by a push (the 5-page smoke test) just skips; a
// weekly or hand-started run fails with a message, so it shows up and can be started again,
// unless all that's ahead of it is a smoke test, which it waits out.
// Writes go=true|false to $GITHUB_OUTPUT.
import { appendFileSync } from 'node:fs';
import { ahead, turn } from './lib/turns.mjs';

const { GITHUB_REPOSITORY: repo, GITHUB_RUN_ID, GH_TOKEN: token, GITHUB_OUTPUT: out, GITHUB_EVENT_NAME: event, RUN_TITLE } = process.env;
const say = (go) => out && appendFileSync(out, `go=${go}\n`);
const mine = { id: Number(GITHUB_RUN_ID), title: RUN_TITLE || 'Crawl: all sites', started: new Date().toISOString(), event };

async function others() {
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/crawl.yml/runs?status=in_progress&per_page=50`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).workflow_runs.map((r) => ({ id: r.id, title: r.display_title, started: r.run_started_at || r.created_at, event: r.event }));
}

// A smoke test ahead of a real crawl is waited for, a minute at a time, for up to 25 minutes.
for (let minute = 0; ; minute++) {
  let runs;
  try {
    runs = await others();
  } catch (err) {
    // Not being able to ask must not stop the weekly crawl.
    console.log(`Couldn't check for other crawls (${err.message}); going ahead.`);
    say(true);
    process.exit(0);
  }
  const what = turn(mine, runs);
  const who = ahead(mine, runs).map((r) => `run ${r.id} (${r.title}${r.event === 'push' ? ', a smoke test' : ''})`).join(', ');
  if (what === 'go') {
    console.log('No other crawl is reading these sites.');
    say(true);
    process.exit(0);
  }
  if (what === 'wait' && minute < 25) {
    console.log(`Waiting for a smoke test to finish: ${who}.`);
    await new Promise((r) => setTimeout(r, 60000));
    continue;
  }
  console.log(`Another crawl is already reading some of these sites: ${who}.`);
  say(false);
  if (what === 'skip') {
    console.log('This is the smoke test for a push, so it is skipped.');
    process.exit(0);
  }
  console.log('Start this crawl again when that one has finished.');
  process.exit(1);
}

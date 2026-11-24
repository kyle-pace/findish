// What the crawler does when a site refuses a page (since 2026-11-24, when Kyle asked that small
// things stop turning the weekly run red).
//
// HTTP 429 means "too many requests": the site wants us slower, not gone. So the crawler waits a
// minute, doubles the gap between pages (up to 30 seconds) and goes on. Only when the site still
// refuses three times in a row at that slowest pace does it stop reading the site for this run,
// as "slowed": a note in the run, not an alert, and the pages it didn't reach wait for next week.
// A site that keeps doing this wants crawl.delay_seconds in KitchenCatalog.
//
// HTTP 401 or 403 three times in a row is a site shutting us out: "blocked", which is an alert.

export const SLOWEST_MS = 30000;
export const COOL_OFF_MS = 60000;

// `seen` carries the refusals in a row between calls; start it as {}. Returns what to do next:
// { stop: 'slowed' | 'blocked' | null, pause, wait } where `pause` is the new gap between pages
// and `wait` an extra one-off wait before the next page.
export function afterRefusal(seen, status, pause) {
  if (status === 429) {
    seen.tooMany = (seen.tooMany || 0) + 1;
    seen.shut = 0;
    if (pause >= SLOWEST_MS && seen.tooMany >= 3) return { stop: 'slowed', pause, wait: 0 };
    if (pause >= SLOWEST_MS) return { stop: null, pause, wait: COOL_OFF_MS };
    seen.tooMany = 0;
    return { stop: null, pause: Math.min(pause * 2, SLOWEST_MS), wait: COOL_OFF_MS };
  }
  seen.shut = (seen.shut || 0) + 1;
  seen.tooMany = 0;
  return { stop: seen.shut >= 3 ? 'blocked' : null, pause, wait: 0 };
}

// A page came back: the next refusal starts a new count.
export function afterSuccess(seen) {
  seen.tooMany = 0;
  seen.shut = 0;
}

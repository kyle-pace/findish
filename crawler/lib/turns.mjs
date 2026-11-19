// Two crawls may run at once only when they read different sites: every site still gets one
// request at a time. These are the small rules behind that: which sites a run reads (from its
// title), whether two runs share one, and how two runs' counts become one status file.

/** The sources a run reads, from its title ("Crawl: woks,sk"), or 'all' ("Crawl: all sites", or an older untitled run). */
export function sourcesOf(title) {
  const m = String(title || '').match(/^Crawl:\s*(.+)$/);
  if (!m || /^all sites$/i.test(m[1].trim())) return 'all';
  const ids = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  return ids.length ? ids : 'all';
}

/** Whether two runs would read a site at the same time. */
export function overlaps(a, b) {
  if (a === 'all' || b === 'all') return true;
  return a.some((id) => b.includes(id));
}

/**
 * Runs that got to these sites first: in progress, sharing a site with `mine`, and started
 * before it (the lower id on a tie). Each run is { id, title, started }.
 */
export function ahead(mine, runs) {
  const me = runs.find((r) => r.id === mine.id) || mine;
  return runs.filter((r) => r.id !== mine.id
    && overlaps(sourcesOf(r.title), sourcesOf(mine.title))
    && (r.started < me.started || (r.started === me.started && r.id < mine.id)));
}

/**
 * One status file from two crawls that finished apart. `theirs` is what's already saved,
 * `ours` what this run wrote. This run's word wins for the sources it read; everything else
 * stays as saved, so a crawl of three sites doesn't wipe out the counts another crawl of five
 * saved while it was running.
 */
export function mergeStatus(theirs, ours) {
  const ran = (id) => ours.sources?.[id] && ours.sources[id].result !== 'not run';
  const sources = { ...(theirs?.sources || {}) };
  for (const [id, s] of Object.entries(ours.sources || {})) {
    if (ran(id) || !(id in sources)) sources[id] = s;
  }
  const kept = (theirs?.alerts || []).filter((a) => !ran(String(a).split(':')[0]));
  return { ...ours, sources, alerts: [...new Set([...(ours.alerts || []), ...kept])] };
}

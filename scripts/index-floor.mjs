// The floor under the index: scripts/build-index.mjs stops (exit 1) when it's about to
// write far fewer recipes or videos than the last crawl counted, instead of quietly shipping
// a thin index. What it catches: a data file that's missing, empty or cut short; a site that
// fell off the list of sources; a crawl that came back with a fraction of a site.
//
// The crawler writes what it kept per source to data/status.json (`count`), and what it had
// kept the run before (`previous`); the larger of the two is what's expected. A source has
// to keep KEEP of that; so do all the recipes together, and all the videos together (apart,
// because together the biggest site is only an eighth of everything, and losing it whole
// once slipped under a floor on the grand total). A source the last crawl kept more than 20
// from that isn't in today's list at all stops the build by name, unless it is paused.
// Small sources (20 or fewer) aren't checked on their own, like the crawler's own alert
// (crawler/crawl.mjs, DROP_ALERT).
//
// A real drop (a site took most of its recipes down, or a source was taken off the list on
// purpose) passes after the next weekly crawl, when `previous` catches up and the crawl
// stops counting it, or right away with `node scripts/build-index.mjs --allow-drop`
// (ALLOW_INDEX_DROP=1 npm run build).

export const KEEP = 0.8;
const SMALL = 20;

/**
 * What's wrong, as sentences; none when the index is about as big as the last crawl says.
 * `recipes` and `videos`: how many each source in today's list has, by id (a site's recipes
 * in the index; a channel's videos in its data file, Shorts included, as the crawler counts).
 * `paused`: ids in today's list that are switched off on purpose.
 */
export function floorProblems({ status, recipes, videos, paused = [], keep = KEEP }) {
  const problems = [];
  const kept = { ...videos, ...recipes };
  const expected = (s) => Math.max(Number(s?.count) || 0, Number(s?.previous) || 0);
  const pct = Math.round(keep * 100);
  const off = new Set(paused);

  if (!Object.values(recipes).some((n) => n > 0)) problems.push('There are no recipes at all.');

  for (const [id, n] of Object.entries(kept)) {
    const want = expected(status.sources?.[id]);
    if (want > SMALL && n < want * keep) {
      problems.push(`${status.sources[id].name || id} (${id}) has ${n} ${id in recipes ? 'recipes' : 'videos'}; the last crawl kept ${want}. Under ${pct}% stops the build.`);
    }
  }

  // A source the last crawl ran that isn't in today's list: a typo in an id, a row deleted
  // from the list of sources, a file of sources cut short.
  for (const [id, s] of Object.entries(status.sources || {})) {
    if (id in kept || off.has(id) || s.result === 'not run' || s.result === 'paused') continue;
    if (expected(s) > SMALL) problems.push(`${s.name || id} (${id}) is not in the list of sources any more; the last crawl kept ${expected(s)} from it.`);
  }

  // Each kind together, which notices many sources each a little short.
  for (const [what, counts] of [['recipes', recipes], ['videos', videos]]) {
    let want = 0;
    let have = 0;
    for (const [id, n] of Object.entries(counts)) {
      const s = status.sources?.[id];
      if (!s || s.result === 'not run') continue;
      want += expected(s);
      have += n || 0;
    }
    if (have < want * keep) problems.push(`All the ${what} together come to ${have}; the last crawl kept ${want}. Under ${pct}% stops the build.`);
  }
  return problems;
}

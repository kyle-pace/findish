// The floor under the index: scripts/build-index.mjs stops (exit 1) when it's about to
// write far fewer recipes or videos than the last crawl counted, instead of quietly shipping
// a thin index. What it catches: a data file that's missing, empty or cut short; a site that
// fell off the list of sources; a crawl that came back with a fraction of a site.
//
// The crawler writes what it kept per source to data/status.json (`count`), and what it had
// kept the run before (`previous`); the larger of the two is what's expected. A source has
// to keep KEEP of that, and so does everything together. Small sources (20 or fewer) aren't
// checked on their own, like the crawler's own alert (crawler/crawl.mjs, DROP_ALERT).
//
// A real drop (a site took most of its recipes down) passes after the next weekly crawl,
// when `previous` catches up, or right away with `node scripts/build-index.mjs --allow-drop`
// (ALLOW_INDEX_DROP=1 npm run build).

export const KEEP = 0.8;
const SMALL = 20;

/**
 * What's wrong, as sentences; none when the index is about as big as the last crawl says.
 * `recipes` and `videos`: how many each source in today's list has, by id (a site's recipes
 * in the index; a channel's videos in its data file, Shorts included, as the crawler counts).
 */
export function floorProblems({ status, recipes, videos, keep = KEEP }) {
  const problems = [];
  const kept = { ...videos, ...recipes };
  const expected = (s) => Math.max(Number(s?.count) || 0, Number(s?.previous) || 0);
  const pct = Math.round(keep * 100);

  if (!Object.values(recipes).some((n) => n > 0)) problems.push('There are no recipes at all.');

  for (const [id, n] of Object.entries(kept)) {
    const want = expected(status.sources?.[id]);
    if (want > SMALL && n < want * keep) {
      problems.push(`${status.sources[id].name || id} (${id}) has ${n} ${id in recipes ? 'recipes' : 'videos'}; the last crawl kept ${want}. Under ${pct}% stops the build.`);
    }
  }

  // Everything the last crawl ran, together: this is what notices a source missing from the list.
  let want = 0;
  let have = 0;
  const gone = [];
  for (const [id, s] of Object.entries(status.sources || {})) {
    if (s.result === 'not run' || !expected(s)) continue;
    want += expected(s);
    have += kept[id] || 0;
    if (!(id in kept)) gone.push(id);
  }
  if (have < want * keep) {
    problems.push(
      `Everything together comes to ${have}; the last crawl kept ${want}. Under ${pct}% stops the build.` +
        (gone.length ? ` Not in the list of sources any more: ${gone.join(', ')}.` : ''),
    );
  }
  return problems;
}

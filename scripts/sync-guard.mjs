// What a catalog sync would take away, worked out before anything is copied
// (scripts/sync-catalog.mjs). The copy in vendor/kitchen-catalog/ is replaced whole, so a
// clone of KitchenCatalog that is behind, or a source or ingredient added to the copy here
// by hand, would otherwise vanish without a word: on 2026-11-17 a sync from a clone one
// commit behind would have dropped three sources.

/** Ingredient ids the incoming catalog no longer answers to (an id moved into `also` still counts). */
export function lostItems(current, incoming) {
  const known = new Set(Object.keys(incoming?.items || {}));
  for (const item of Object.values(incoming?.items || {})) for (const id of item.also || []) known.add(id);
  return Object.keys(current?.items || {}).filter((id) => !known.has(id));
}

/** Source ids (sites and their YouTube channels) in the copy here that the incoming list lacks. */
export function lostSources(current, incoming) {
  const ids = (data) => (data?.sources || []).flatMap((s) => [s.id, s.youtube?.id]).filter(Boolean);
  const known = new Set(ids(incoming));
  return ids(current).filter((id) => !known.has(id));
}

/**
 * Reasons not to sync, as sentences; empty when the sync only adds or changes things.
 * `current` and `incoming` are { catalog, sources }, each as parsed JSON (or null when the
 * file isn't there yet, which is never a problem).
 */
export function syncProblems(current, incoming) {
  const problems = [];
  const items = lostItems(current.catalog, incoming.catalog);
  if (items.length) problems.push(`${items.length} ingredient id${items.length === 1 ? '' : 's'} here would disappear: ${list(items)}. Ids never change in KitchenCatalog; a merged one belongs in the survivor's "also".`);
  const sources = lostSources(current.sources, incoming.sources);
  if (sources.length) problems.push(`${sources.length} source${sources.length === 1 ? '' : 's'} here would disappear: ${list(sources)}. Was it added to this copy and not to KitchenCatalog, or is the clone behind (git pull there)?`);
  if (!Object.keys(incoming.catalog?.items || {}).length) problems.push('The incoming catalog has no items.');
  if (!(incoming.sources?.sources || []).length) problems.push('The incoming sources list is empty.');
  return problems;
}

const list = (ids) => (ids.length > 8 ? `${ids.slice(0, 8).join(', ')} and ${ids.length - 8} more` : ids.join(', '));

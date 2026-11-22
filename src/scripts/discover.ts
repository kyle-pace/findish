// Clicks and views on the Discover page (/discover/). Nothing typed.
//   Viewed Collection     collection_id, position (which shelf, counting from 1): once per visit, when half of it is on screen
//   Opened Recipe         source, position (in the shelf), opened_from: discover, collection_id, recipe_key (counts toward popularity)
//   Opened Full Search    browse_kind: discover, browse_page and collection_id: the shelf ("See all")
//   Opened Creator Page   source, opened_from: discover (the creator of the week)
//   Opened Collection     collection_id, position: a jump link in "On the shelves this week"
import { track } from 'kp-design/analytics';
import { rememberOpened } from '../lib/kept.mjs';

const opened = (key?: string) => {
  try {
    rememberOpened(key, localStorage);
  } catch {
    // Storage is blocked: nothing is kept.
  }
};

const shelves = [...document.querySelectorAll<HTMLElement>('[data-collection]')];
const placeOf = (el: Element | null) => {
  const shelf = el?.closest<HTMLElement>('[data-collection]');
  return { id: shelf?.dataset.collection || '', position: shelf ? shelves.indexOf(shelf) + 1 : 0 };
};

if ('IntersectionObserver' in window) {
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        seen.unobserve(e.target);
        const { id, position } = placeOf(e.target);
        track('Viewed Collection', { collection_id: id, position });
      }
    },
    { threshold: 0.5 },
  );
  for (const s of shelves) seen.observe(s);
}

document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a');
  if (!a) return;
  const d = a.dataset;
  const { id, position } = placeOf(a);
  if (d.srcId) {
    opened(d.key);
    track('Opened Recipe', {
      source: d.srcId,
      position: Number(d.pos || 0),
      opened_from: 'discover',
      collection_id: id,
      ingredient_count: 0,
      ...(d.key ? { recipe_key: d.key } : {}),
    });
  } else if ('fullSearch' in d) track('Opened Full Search', { browse_kind: 'discover', browse_page: id, collection_id: id });
  else if (d.creatorPage) track('Opened Creator Page', { source: d.creatorPage, opened_from: 'discover' });
  else if (d.jump) track('Opened Collection', { collection_id: d.jump, position: Number(d.pos || 0) });
});

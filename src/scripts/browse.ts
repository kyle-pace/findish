// Clicks on the browse pages (/browse/, /cuisine/…, /course/…, /with/…). Nothing typed.
//   Opened Recipe         source, position, opened_from: cuisine, course or ingredient, recipe_key (counts toward popularity)
//   Opened Full Search    browse_kind (cuisine, course, ingredient), browse_page (korean, soup, tofu): "Search all …" and the narrower searches
//   Opened Creator Page   source, opened_from: browse
//   Opened Browse Page    browse_kind, browse_page, opened_from: browse (the list of them all) or the kind of page it was on
import { track } from 'kp-design/analytics';

const page = document.querySelector<HTMLElement>('[data-page="browse"]');
const kind = page?.dataset.browseKind || 'browse';
const slug = page?.dataset.browsePage || '';

document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a');
  if (!a) return;
  const d = a.dataset;
  if (d.srcId)
    track('Opened Recipe', {
      source: d.srcId,
      position: Number(d.pos || 0),
      opened_from: kind,
      ingredient_count: 0,
      ...(d.key ? { recipe_key: d.key } : {}),
    });
  else if ('fullSearch' in d) track('Opened Full Search', { browse_kind: kind, browse_page: slug });
  else if (d.creatorPage) track('Opened Creator Page', { source: d.creatorPage, opened_from: 'browse' });
  else if (d.browseKind && d.browsePage) track('Opened Browse Page', { browse_kind: d.browseKind, browse_page: d.browsePage, opened_from: kind });
});

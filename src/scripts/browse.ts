// Clicks on the browse pages (/browse/, /cuisine/…, /course/…, /with/…). Nothing typed.
//   Opened Recipe         source, position, opened_from: cuisine, course or ingredient, recipe_key (counts toward popularity)
//   Opened Full Search    browse_kind (cuisine, course, ingredient), browse_page (korean, soup, tofu): "Search all …" and the narrower searches
//   Opened Creator Page   source, opened_from: browse
//   Opened Browse Page    browse_kind, browse_page, opened_from: browse (the list of them all) or the kind of page it was on
//   Opened World Cuisine  note_kind: cuisine, note_id, link: world-cuisine (the line under a cuisine page's heading)
// On the cuisine, course and ingredient pages each of these but the last also carries
// browse_section, the part of the page the link was in: top, quick (an ingredient page's
// "Ready in 30 minutes or less"), picks, narrower, related or cooks. Added 2026-11-26.
import { track } from 'kp-design/analytics';
import { rememberOpened } from '../lib/kept.mjs';

/** Kept on this device only, for "Recently opened" under the search box (src/lib/kept.mjs). Never sent. */
const opened = (key?: string) => {
  try {
    rememberOpened(key, localStorage);
  } catch {
    // Storage is blocked: nothing is kept.
  }
};

const page = document.querySelector<HTMLElement>('[data-page="browse"]');
const kind = page?.dataset.browseKind || 'browse';
const slug = page?.dataset.browsePage || '';

document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a');
  if (!a) return;
  const d = a.dataset;
  const section = a.closest<HTMLElement>('[data-section]')?.dataset.section;
  const where = section ? { browse_section: section } : {};
  if (d.noteLink) track('Opened World Cuisine', { note_kind: d.note, note_id: d.noteId, link: d.noteLink });
  else if (d.srcId) {
    opened(d.key);
    track('Opened Recipe', {
      source: d.srcId,
      position: Number(d.pos || 0),
      opened_from: kind,
      ingredient_count: 0,
      ...(d.key ? { recipe_key: d.key } : {}),
      ...where,
    });
  } else if ('fullSearch' in d) track('Opened Full Search', { browse_kind: kind, browse_page: slug, ...where });
  else if (d.creatorPage) track('Opened Creator Page', { source: d.creatorPage, opened_from: 'browse', ...where });
  else if (d.browseKind && d.browsePage) track('Opened Browse Page', { browse_kind: d.browseKind, browse_page: d.browsePage, opened_from: kind, ...where });
});

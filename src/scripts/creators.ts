// Clicks and the filter box on the creator pages (/creators/ and /creators/<id>/).
//   Opened Creator Page   source, opened_from: creators (the list)
//   Opened Support Link   source, link_kind (join, book, shop, follow, site), opened_from: creator
//   Opened Recipe         source, position, opened_from: creator, recipe_key (counts toward popularity)
//   Filtered Creators     result_count (never what was typed), once the filter box loses focus
import { track } from 'kp-design/analytics';

document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a');
  if (!a) return;
  const d = a.dataset;
  if (d.creatorPage) track('Opened Creator Page', { source: d.creatorPage, opened_from: 'creators' });
  else if (d.support) track('Opened Support Link', { source: d.support, link_kind: d.kind || 'link', opened_from: 'creator' });
  else if (d.srcId)
    track('Opened Recipe', {
      source: d.srcId,
      position: Number(d.pos || 0),
      opened_from: 'creator',
      ingredient_count: 0,
      ...(d.key ? { recipe_key: d.key } : {}),
    });
});

// The list's filter: hides creators whose name, site or cuisine doesn't have every typed word,
// and groups left empty. Works on the list the page was built with; nothing is fetched.
const input = document.querySelector<HTMLInputElement>('#find');
if (input) {
  const rows = [...document.querySelectorAll<HTMLLIElement>('li[data-name]')];
  const groups = [...document.querySelectorAll<HTMLElement>('[data-group]')];
  const found = document.getElementById('found')!;
  let shown = rows.length;
  const apply = () => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    shown = 0;
    for (const li of rows) {
      const hit = words.every((w) => li.dataset.name!.includes(w));
      li.hidden = !hit;
      if (hit) shown++;
    }
    for (const g of groups) g.hidden = !g.querySelector('li[data-name]:not([hidden])');
    found.textContent = words.length ? (shown ? `${shown} ${shown === 1 ? 'creator matches' : 'creators match'}.` : 'No creator matches that.') : '';
  };
  input.addEventListener('input', apply);
  input.addEventListener('change', () => {
    if (input.value.trim()) track('Filtered Creators', { result_count: shown });
  });
  // Coming back with the browser's back button can restore what was typed.
  if (input.value) apply();
}

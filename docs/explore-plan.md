# Explore: World cuisine becomes a section of finDish

Started 2026-11-26. Kyle's decision, from a conversation that day: World cuisine was a fun
explorer with nowhere to go, and finDish assumed you already knew what to search for. Each
was missing what the other has. Neither will ever be monetized.

## The model

finDish has two ways in, and both end at the same place: a list of recipes that link out to
the cooks who wrote them.

- **Search**, for when you know what you want. Unchanged.
- **Explore**, for when you don't: the globe, the linked pages, Dish drop, and the recipe
  shelves built as Discover.

They join at one page per cuisine, dish and ingredient: a short intro with its Wikipedia
link, recipes for it from finDish, the creators who cook it, and related pages.

## Decisions (Kyle, 2026-11-26)

| Question | Answer |
| --- | --- |
| Where it lives | `findish.now/explore/` |
| finDish's `/cuisine/<slug>/` and `/with/<id>/` vs the explorer's own cuisine and ingredient pages | Merge into one page. The finDish page gains the intro, photo, dishes and related links; dishes and anything without recipes get pages of their own. |
| Explore and Discover | One section. Explore holds the globe and the shelves, with one link from the home page. |
| Home page | Stays one screen with no scrolling. One "Explore cuisines" link under the ideas; the globe is one click away, never on the home page. |
| Outside hosts | Wikipedia's API approved "for now" for live intros. Cookbook covers self-hosted in `public/covers/`, never loaded from Open Library. |
| Search engines | Index only pages that have finDish recipes on them; the rest stay noindex. |

## Stages

1. **Serve the explorer here, unlisted.** Done 2026-11-26, in the `explore-section` pull
   request: `/explore/`, `/explore/app/`, `/explore/<type>/<slug>/` and `/explore/img/` work
   behind `EXPLORE_LISTED = false`. See "Explore" in AGENTS.md for how.
   The Every ingredient page (`/explore/ingredients/`) came over the same day.
   Left in this stage: About and How it's built for the explorer (they fold into finDish's
   own About in stage 3) and finDish share cards.
2. **Merge the overlapping pages.** Done 2026-11-26 for cuisines and ingredients:
   `/cuisine/korean/` and `/with/tofu/` show the explorer's page as their About section, and
   `/explore/cuisine/korean-cuisine/` and `/explore/ingredient/tofu/` forward there (40
   cuisines, 132 ingredients; `src/lib/explore.ts`). Ingredient intros are left out.
   Done 2026-11-27: a dish's page leads with "Find recipes for <dish>" when finDish has
   three or more recipes named for it (274 of 1,558 dishes that day; `/explore/links.json`,
   `src/lib/explore-links.mjs`). And the pages with no match were gone through: nine more
   cuisines and six more ingredients are matched by hand or by a better plural rule
   (`CUISINE_BY_HAND`, `INGREDIENT_BY_HAND` in `src/lib/explore.ts`), so 48 of 57 cuisine
   pages and 138 of 200 ingredient pages have an About section. Two cuisine pages went away:
   "Europian" was a site's typo for European, and "Gluten Free" isn't a cuisine
   (`scripts/cuisine.mjs`). What's left has no page in the explorer at all (see "Still open").
   The design pass was done the same day (`design/PLAN.md`, "Explore").
3. **One Explore section.** Done 2026-11-26: `/explore/` shows the globe and then the
   shelves, `/discover/` forwards there, the home page and footer link to it,
   `EXPLORE_LISTED` is on, `/explore/` and `/explore/ingredients/` are in the sitemap, a
   one-cuisine search links to its page here, and About and the privacy page mention it.
   Share cards for Explore are finDish's own since the design pass.
   Done 2026-11-27: a search that is exactly one dish, or one ingredient, links to its page
   ("About Bibimbap, in Explore"), and Confluence is current.
   Set aside 2026-11-27: the ideas row offering a cuisine or dish. The home page was trimmed
   to the box and two links the day this was written down, and the row it would have gone in
   is hidden there now; Explore's own link does the job. Bring it back only if Kyle wants
   ideas on the home page again.
   Left in this stage: the explorer's own About and How it's built folded into finDish's
   (Kyle wasn't sure about them).
4. **Retire the old home.** Done 2026-11-26 (Kyle's OK): every address under
   kylepace.dev/world-cuisine/ answers with a 301 to the same place here. World cuisine's
   own Worker does it and keeps its routes (kyle-pace/world-cuisines,
   `src/lib/forward.mjs`); the hub's `_redirects` has the same rules as a fallback, and
   its Labs card opens `/explore/`. The iOS demo app's share links ride the same redirect.
   World cuisine's weekly refresh stays in its repo, and `.github/workflows/explore.yml`
   here copies the result every Monday. Its events are finDish's since stage 1.
   The World cuisines app is moving into the finDish app as an Explore tab (Kyle, 2026-11-26):
   built, merged and on internal TestFlight as finDish Dev the same day; the iPad layout,
   largest text and VoiceOver haven't been checked yet.
   Not done, and not planned without Kyle asking: removing the old Worker or its repo.

## Still open

- Nine cuisine pages (Asian, Caribbean, European, International, Italian Japanese Fusion,
  Mediterranean, Middle Eastern, South American, Western) and 62 ingredient pages (kale,
  kimchi, bok choy, chicken thighs, udon, wasabi and the like) have no About section because
  the explorer has no page for them. That is a gap in world-cuisines' data, not a match to
  fix here: add the page there and it shows up after the next Monday copy.
- A dish's page links to a search for its name; it doesn't list recipes itself.
- The explorer's About and How it's built pages stay out (Kyle wasn't sure about them, 2026-11-26).
- The home page's way in is two links under the box, "Explore" and "The globe" (2026-11-26).

## Reordered, recipes first (2026-11-26)

Kyle, after seeing it live: the globe is a cool feature but not the most effective way to
find something, so it shouldn't take the first screen. He wants it on its own page and still
very findable, and Explore about finding recipes and creators, with what's in season.
`/explore/` is now the week's shelves and Browse (top cuisines and ingredients, the courses,
a line to creators), with one ink button at the top, "The globe", to `/explore/globe/`, which
is the old top of the page. Still to think through with Kyle: whether `/browse/` folds in
fully, how creators show up here beyond one line, and whether the globe also wants a link
from the home page or footer.

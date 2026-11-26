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
   Left in this stage: dish pages don't show finDish recipes yet (a search for the dish's
   name is the plan) and the 20 cuisine pages and 68 ingredient pages with no match.
   The design pass was done the same day (`design/PLAN.md`, "Explore").
3. **One Explore section.** Done 2026-11-26: `/explore/` shows the globe and then the
   shelves, `/discover/` forwards there, the home page and footer link to it,
   `EXPLORE_LISTED` is on, `/explore/` and `/explore/ingredients/` are in the sitemap, a
   one-cuisine search links to its page here, and About and the privacy page mention it.
   Share cards for Explore are finDish's own since the design pass.
   Left in this stage: the ideas row offering a cuisine or dish, dish and ingredient searches linking to their
   pages, the explorer's own About and How it's built folded into finDish's, and Confluence.
4. **Retire the old home.** Done 2026-11-26 (Kyle's OK): every address under
   kylepace.dev/world-cuisine/ answers with a 301 to the same place here. World cuisine's
   own Worker does it and keeps its routes (kyle-pace/world-cuisines,
   `src/lib/forward.mjs`); the hub's `_redirects` has the same rules as a fallback, and
   its Labs card opens `/explore/`. The iOS demo app's share links ride the same redirect.
   World cuisine's weekly refresh stays in its repo, and `.github/workflows/explore.yml`
   here copies the result every Monday. Its events are finDish's since stage 1.
   Not done, and not planned without Kyle asking: removing the old Worker or its repo,
   and folding the World cuisines demo app into the finDish app as a tab.

## Still open

- A dish's page (`/explore/dish/…`) shows no finDish recipes yet.
- On phones shorter than 780px the home page's Explore line is hidden so the page fits one
  screen; the footer link is the way in there.

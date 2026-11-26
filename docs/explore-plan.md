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
   name is the plan), the 20 cuisine pages and 68 ingredient pages with no match, and a
   design pass so the About sections and `/explore/` pages share finDish's look.
3. **One Explore section.** Done 2026-11-26: `/explore/` shows the globe and then the
   shelves, `/discover/` forwards there, the home page and footer link to it,
   `EXPLORE_LISTED` is on, `/explore/` and `/explore/ingredients/` are in the sitemap, a
   one-cuisine search links to its page here, and About and the privacy page mention it.
   Left in this stage: finDish share cards for Explore (it still uses World cuisine's),
   the ideas row offering a cuisine or dish, dish and ingredient searches linking to their
   pages, the explorer's own About and How it's built folded into finDish's, and Confluence.
4. **Retire the old home.** kylepace.dev/world-cuisine/ forwards here (the hub's
   `_redirects`, then remove the Worker's routes), the hub's Labs listing and the iOS app's
   share links point here, World cuisine's weekly refresh either moves into this repo or
   opens a sync here, and its events move from the kylepace.dev Amplitude project to
   finDish's. The World cuisines demo app folds into the finDish app as a tab.
   Removing the old Worker needs Kyle's OK first.

## Still open

- Confluence: the Findish page (6848557) and World cuisine's page in the Labs space.
- Keeping the copy fresh: nothing syncs `vendor/explore/` automatically yet.
- The About sections and `/explore/` pages still wear the explorer's look; they haven't
  been through `design/PLAN.md`.
- On phones shorter than 780px the home page's Explore line is hidden so the page fits one
  screen; the footer link is the way in there.

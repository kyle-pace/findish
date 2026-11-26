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
| Search engines | Index only pages that have finDish recipes on them; the rest stay noindex. |

## Stages

1. **Serve the explorer here, unlisted.** Done 2026-11-26, in the `explore-section` pull
   request: `/explore/`, `/explore/app/`, `/explore/<type>/<slug>/` and `/explore/img/` work
   behind `EXPLORE_LISTED = false`. See "Explore" in AGENTS.md for how.
   Left in this stage: the Every ingredient page, About and How it's built for the explorer,
   and its own share card.
2. **Merge the overlapping pages.** `/cuisine/korean/` and `/with/tofu/` take in the
   explorer's intro, photo, dishes and related links; `/explore/cuisine/korean-cuisine/` and
   `/explore/ingredient/tofu/` then forward to them. Needs a map from the explorer's slugs to
   finDish's cuisine slugs and catalog ids (`data/catalog_links.json` already has the
   ingredient half), and a pass through `design/PLAN.md` so the pages share one look.
   Dish pages get a recipes section fed by a search for the dish's name.
3. **One Explore section.** `/explore/` shows the globe and the Discover shelves;
   `/discover/` forwards there; the home page gets its link and the ideas row can offer a
   cuisine or dish; a search that is exactly one cuisine, dish or ingredient links to its
   page. Turn on `EXPLORE_LISTED`, add the pages with recipes to the sitemap, add the hosts
   and events below, update About and the privacy page.
4. **Retire the old home.** kylepace.dev/world-cuisine/ forwards here (the hub's
   `_redirects`, then remove the Worker's routes), the hub's Labs listing and the iOS app's
   share links point here, World cuisine's weekly refresh either moves into this repo or
   opens a sync here, and its events move from the kylepace.dev Amplitude project to
   finDish's. The World cuisines demo app folds into the finDish app as a tab.
   Removing the old Worker needs Kyle's OK first.

## Open before the flag goes on

- Kyle's OK for two outside hosts in this project: `en.wikipedia.org` (live intros) and
  `covers.openlibrary.org` (cookbook covers), both approved for world-cuisines on 2026-11-08.
  finDish self-hosts its own cookbook covers, so the covers could go that way instead.
- `opened_from` on "Opened Full Search" in the Amplitude tracking plan, plus whatever events
  the globe needs (it sends none of its own from here yet).
- Confluence: the Findish page (6848557) and World cuisine's page in the Labs space.
- `docs/web-and-app.md`: a row for Explore in the feature table.
- Keeping the copy fresh: nothing syncs `vendor/explore/` automatically yet.

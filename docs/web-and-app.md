# Findish on the web and in the app: keeping them in step

Findish has two front ends: the website (this repo, findish.now) and the iPhone and iPad app
(`kyle-pace/findish-app`, private, checked out next to this repo as `~/Developer/findish-app`).
They should feel like one product. Someone who searches "mapo tofu" on the site and in the app
should get the same recipes in the same order, see the same creators and the same ways to back
them, and find the same features unless there's a reason one side does something differently.

This page is the agreement between the two repos. Both AGENTS.md files point here. Change it in
this repo only; the app repo links to it rather than keeping a copy.

## What they share, and where each piece lives

| Piece | Source of truth | How the other side gets it |
| --- | --- | --- |
| The recipes, videos, creators, support links, cuisines, courses | `public/index.json`, built by `scripts/build-index.mjs` | The app downloads `https://findish.now/index.json` and reads it in `App/Sources/Index/RecipeIndex.swift` |
| Search and ranking (typo fixing, dish-first order, diets, related rules) | `src/lib/search-core.mjs` | Bundled into the app with `src/lib/related.mjs` by `App/update-search.sh` (`App/Resources/findish-search.js`) and run on the device in JavaScriptCore |
| Which sites are in Findish and how to back each creator | `sources.yaml` and the index's `support` | Through the index; the app has no list of its own |
| Analytics events | The Findish Amplitude project's tracking plan | Both send to the same project with the same event names |
| Name, wordmark, colors | `design/PLAN.md` here | The app uses the same colors, wordmark and favicon-based icon (`Theme.swift`, `Wordmark.swift`, `design/app-icon.html`) |

Nothing about search, ranking or the recipe data is ever written twice. If the app needs a search
behavior the site doesn't have, it goes in `search-core.mjs` behind an option, not in Swift.

## The rules

1. **Search changes start here.** Change `src/lib/search-core.mjs` and its tests in this repo
   first. After the change is merged, run `App/update-search.sh` in the app repo, commit the new
   bundle, and send a TestFlight build if people would notice the difference. The bundle's first
   line names the recipe-search commit it came from; `App/update-search.sh --check` says whether
   the app is behind.
2. **The index only grows.** Installed copies of the app read the live `index.json`, and old
   versions stay on phones for months. Add new fields at the end of a row or as new keys. Never
   remove, rename, reorder or change the type of an existing field without first shipping an app
   version that copes with both, and say so in both repos' docs. `RecipeIndex.swift` must ignore
   fields it doesn't know.
3. **Every user-facing feature gets a row in the table below**, in the same pull request that adds
   it. Either both sides have it, or the row says which side doesn't and why ("web only: it's
   there for search engines", "app only: needs the device"). "Not yet" is fine, as long as it's
   written down.
4. **Same words for the same thing.** Labels, filter names, course names ("Sides and salads"),
   empty states and the creator support wording match across both, unless the platform has its
   own convention (Apple's "Done", say).
5. **Same analytics names.** A feature on both sides sends the same event name with the same
   property names to the Findish Amplitude project. App-only events are in the tracking plan's
   "App" category. Add the event to the tracking plan when it ships, on whichever side ships it.
6. **Ask is allowed to differ underneath.** The site's Ask uses Claude through `/api/ask`; the
   app reads the request with Apple's on-device model and falls back to rules. What both must
   share: Ask only ever turns words into a search, never writes or names a recipe on its own.
7. **When in doubt, the web goes first.** It ships the same day and is easy to roll back; the app
   catches up in its next TestFlight build. A change that only makes sense in the app can go
   there first, with its row in the table.

## Checklist for a change to either side

- Does it touch search or ranking? Then it lives in `search-core.mjs`; rebundle the app.
- Does it change `index.json`? Additive only, or plan the app release first.
- Is it a feature people see? Update the table below.
- New event? Same name on both sides, in the tracking plan.
- New words on screen? Use the same ones on the other side.
- Update this page, both AGENTS.md files if a rule changed, and the Findish pages in Confluence.

## Feature table

Last checked: 2026-11-21 (web at recipe-search `7774072`, app 0.6.0 after the parity pass).

| Feature | Web | App | Notes |
| --- | --- | --- | --- |
| Search by dish words and ingredients | Yes | Yes | Same `search-core.mjs` |
| Typo fixing, plurals, dish-first ranking | Yes | Yes | Comes with the bundle |
| Filters: cuisine, time, sites | Yes | Yes | |
| Filter: course | Yes | Yes | App added in 0.6.0 |
| Vegetarian | Yes | Yes | |
| Vegan, "no dairy" and other groups | Yes | Yes | App: Diet and Leave out in the Edit sheet |
| Leave out an ingredient | Yes | Yes | |
| Videos from creators' channels | Yes | Yes | Both show six under the recipes with "Show all N videos"; the app plays them in an in-app browser |
| Ways to back each creator | Yes (creator pages) | Yes (Creators tab) | Same `support` data |
| A page per creator | Yes | Partly | App has a row per creator in Creators, not a full page |
| Starred creators ranked first | No | Yes | App only for now: stars live on the device |
| Ask in your own words | Experiment (`?chat=1`) | Yes | Different engines on purpose (rule 6). Without Apple Intelligence the app reads the sentence with the site's own `understand()` |
| Moods ("comforting", "light") | No | Yes | App only for now; candidates for `search-core.mjs` |
| Sides to go with a main | Yes | Yes | App shows it once per cuisine on the page |
| Related dishes | Yes | Yes | App bundles `related.mjs` with the search |
| New this week | Yes (footer) | Yes | App: a home shortcut and a filter |
| Browse pages by cuisine, course, ingredient | Yes | No | Web only: they're there for search engines |
| Discover shelves (collections) | Unlisted (`/discover/`) | Not yet | Built from `/discover.json`, which the app can read as is when it gets a Discover tab; same shelf ids and event names |
| World cuisine notes on cuisine searches | Yes (link) | Not yet | |
| Recently opened, saved recipes | Yes (this browser) | Yes (Saved, offline) | |
| Clean recipe card, scaling, cook mode | No | Yes | App only: reads the creator's page inside the app |
| Works offline | No | Yes | App keeps the last index |
| Assistants (MCP) | Yes | No | Web only: it's a server |
| Recipes for a shopping list (`/api/with`) | Yes | No | Web only: used by the Grocery Deals app |

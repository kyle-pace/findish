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
3. **Every decision about what people see is made for both sides** and written in the
   decision log below, saying what each side does and whether that's the same, adapted, one
   side only, or later. Same isn't the goal; a deliberate choice for each side is.
4. **Every user-facing feature gets a row in the table below**, in the same pull request that adds
   it. Either both sides have it, or the row says which side doesn't and why ("web only: it's
   there for search engines", "app only: needs the device"). "Not yet" is fine, as long as it's
   written down.
5. **Same words for the same thing.** Labels, filter names, course names ("Sides and salads"),
   empty states and the creator support wording match across both, unless the platform has its
   own convention (Apple's "Done", say).
6. **Same analytics names.** A feature on both sides sends the same event name with the same
   property names to the Findish Amplitude project. App-only events are in the tracking plan's
   "App" category. Add the event to the tracking plan when it ships, on whichever side ships it.
7. **Ask is allowed to differ underneath.** The site's Ask uses Claude through `/api/ask`; the
   app reads the request with Apple's on-device model and falls back to rules. What both must
   share: Ask only ever turns words into a search, never writes or names a recipe on its own.
8. **When in doubt, the web goes first.** It ships the same day and is easy to roll back; the app
   catches up in its next TestFlight build. A change that only makes sense in the app can go
   there first, with its row in the table.

## Decided for each side: the decision log

The two sides are one product, but they aren't copies: a choice that is right on a website
(a page for search engines, a link in a footer) can be wrong in an app (a tab, a gesture,
something that needs the device), and the other way round. So every decision about something
people see is made **for both sides at once**, wherever it starts, and written down in the log
below in the same change:

- **What was decided**, in a sentence, and who decided (usually Kyle) and when.
- **Web:** what the website does.
- **App:** what the app does.
- **How they relate:** *same* (same words and behavior), *adapted* (same intent, shaped for the
  platform: say how), *web only* or *app only* (say why the other side doesn't need it), or
  *later* (the other side should follow; say what's left, and add it to the feature table as
  "Not yet").

A decision isn't finished until both lines are filled in. *Later* is a fine answer; leaving the
other side out without saying so is not. Newest first. When an entry stops being true, change
it rather than adding a contradicting one below it.

### 2026-11-26: Search and Explore, one word for one place (Kyle, model A)

Search is for when you know what you want; Explore is for when you don't, and holds
everything else: the week's shelves, cuisines, ingredients, courses, creators and the globe.
"Browse" is never on screen (addresses and event properties keep the word). The map is in
`design/PLAN.md`, "Search and Explore".

- **Web:** the Explore page's section is "Cuisines, ingredients and courses"; `/browse/` is
  "Every cuisine, course and ingredient"; the explorer's page browser is "Cuisines". The home
  page has "Surprise me" as a die inside the search box, and two links under it: Explore and
  The globe.
- **App:** the Explore tab's views are Cuisines, Globe and Wander (Cuisines was Browse). Tabs
  stay Search, Explore, Creators, Saved.
- **How they relate:** *same* words for Explore, Cuisines and the globe. *Adapted* for the way
  in: the website's home page links to Explore and the globe; the app has a tab, with the
  globe one of its views. *Later*: the week's shelves in the app's Explore (the web leads with
  them; the app reads `/discover.json` when it gets them), and "Surprise me" in the app (the
  app has no random pick yet; if it gets one, a die beside the search field, as on the web).
  *Web only*: the full lists at `/browse/`, which are there for search engines.

## Checklist for a change to either side

- Does it touch search or ranking? Then it lives in `search-core.mjs`; rebundle the app.
- Does it change `index.json`? Additive only, or plan the app release first.
- Is it something people see? Write the decision in the log above, with what the web does and what the app does, and update the table below.
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
| Pages for each cuisine, course and ingredient (`/browse/` lists them) | Yes | No | Web only: they're there for search engines |
| Surprise me (a random recipe) | Yes: a die in the home page's box, and in the count line | Not yet | See the decision log, 2026-11-26 |
| The week's shelves (collections) | Yes, on `/explore/#shelves` since 2026-11-26 (`/discover/` forwards there) | Not yet | Built from `/discover.json`, which the app can read as is when it gets a Discover tab; "See all" is the search held to a shelf (`collection=`, keys in `/discover/keys.json`); same shelf ids and event names |
| Explore: the globe, a page for every cuisine, dish and ingredient, Every ingredient | Yes (`/explore/`, 2026-11-26; moved in from World cuisine) | Yes (2026-11-26, internal TestFlight): an Explore tab with Cuisines, Globe and Wander (Cuisines was Browse until the "one word for one place" decision), and "Find recipes" on every page | The World cuisines app's screens moved into the app; it reads `/explore/app/data/` and `/covers/`. Checked on the iPhone simulator only: iPad, largest text and VoiceOver still need a look. The app adds "Changed Explore View" |
| Today's dish on Explore | No (the site publishes the list the app picks from: `/explore/app/data/web/daily.json`, from `scripts/featured-dishes.mjs`) | Yes: one a day from that list, in order; before the list has loaded, a dish with a photo, a cuisine and two ingredients | Which dishes can be featured, and their order, are decided on the site so both stay in step: nothing that isn't a dish (sauces, pastes, cheeses, drinks, restaurants), only fuller pages, and no cuisine twice in a week. `version: 1`; fields only ever added |
| About sections on cuisine and ingredient pages | Yes (2026-11-26) | Not yet | The app has no browse pages |
| World cuisine notes on cuisine searches | Yes (link) | Not yet | |
| Recently opened, saved recipes | Yes (this browser) | Yes (Saved, offline) | |
| Clean recipe card, scaling, cook mode | No | Yes | App only: reads the creator's page inside the app |
| Works offline | No | Yes | App keeps the last index |
| Assistants (MCP) | Yes | No | Web only: it's a server |
| Recipes for a shopping list (`/api/with`) | Yes | No | Web only: used by the Grocery Deals app |
| Send feedback (email to Kyle) | Yes (footer) | Yes (Settings) | Same words, "Send feedback", and the same event, "Opened Feedback Link" (`opened_from`: welcome, footer, settings). Added 2026-11-23 |
| About (what finDish is) | Yes (the About page, linked from the footer; the short "About this site" dialog was removed 2026-11-26) | Yes (Settings has an About section) | Web only: the page. |

**Search terms (2026-11-26, web only so far):** the web's "Searched Recipes" now carries `term_kind`, `term`, `ingredient_ids`, `creator_ids`, `cuisine`, `course` and `diet`, all values from finDish's own lists (`src/lib/known-term.mjs`), never typed text. The app should send the same properties with the same rule before the two are compared in one chart.

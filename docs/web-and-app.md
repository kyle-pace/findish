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

### 2026-11-27: Recipes on cuisine and ingredient pages, and collection lists, in the app

Kyle, after trying the app: it had none of the website's browse pages, and no way to see a whole collection.

- **Web:** unchanged. `/cuisine/korean/` and `/with/tofu/` lead with recipes and carry Explore's About section; each shelf's "See all" opens the search held to that collection.
- **App:** the app's own Explore page for a cuisine or ingredient leads with "Ready in 30 minutes or less", "More to start with" and "See all N recipes", then "About <name>" and the page as before (Kyle chose this over separate recipe pages). Each shelf has "See all N", opening the collection's whole list. Also: a look-up field on Cuisines in place of a lone button, and Wander starting at a well-connected cuisine. All in [findish-app#8](https://github.com/kyle-pace/findish-app/pull/8), a draft not yet built.
- **How they relate:** *same* idea, one page per cuisine and ingredient with recipes first, and the same words ("Ready in 30 minutes or less", "More to start with", "See all"). *Adapted*: on the web the recipe page is the address and About is a section of it; in the app the Explore page is the address and the recipes are a section of it, since Explore is where the app has those pages. A collection is a list page in the app and a held search on the web, because the app's search can't be held to a set of keys yet. *Later* for the app: course pages, and the narrower searches and "Cuisines that cook with" links the web pages have.

### 2026-11-27: Explore's loose ends (Kyle: "all four")

Four small decisions from one clean-up session.

**Today's dish gets a line and holidays.**
- **Web:** still shows no dish of the day. It publishes more for the app in `daily.json`:
  `lines`, a sentence per dish built from the explorer's own links ("A Korean dish made with
  gochujang, rice and egg."), and `dates`, the days a dish is hand-picked for a holiday.
- **App:** shows the sentence under the dish ("Today's dish. …", or "Today's dish, for Burns
  Night. …"), picks the holiday's dish on its day, and leaves today's dish out of "Pick up
  where you left off". All merged 2026-11-27 in [findish-app#7](https://github.com/kyle-pace/findish-app/pull/7) and sent to internal TestFlight; checked in the iPhone simulator only.
- **How they relate:** *app only* on screen (the website has no front page for Explore's
  dishes; its Explore leads with recipes). The wording and the holiday list are the web's.

**A dish finDish has recipes for says so.**
- **Web:** a dish's page under `/explore/dish/` leads with "Find recipes for <dish>" when
  three or more recipe names carry the dish's name (`/explore/links.json`,
  `src/lib/explore-links.mjs`). No button otherwise.
- **App:** every Explore page has had "Find recipes" since 2026-11-26, whether or not the
  search finds anything.
- **How they relate:** *same* words, "Find recipes". *Adapted*: the web shows it only when
  it leads somewhere, because a web page with a dead-end button reads as broken; the app's
  button opens the Search tab, where "nothing found" offers ways on. *Later*: the app could
  read `/explore/links.json` and do the same.

**A search that is exactly one dish or one ingredient points at its Explore page.**
- **Web:** one line above the results, "About Bibimbap, in Explore", like the line a
  one-cuisine search has had since 2026-11-16.
- **App:** nothing yet. The app has no line above results for cuisines either.
- **How they relate:** *web only* for now; *later* for the app, together with the cuisine line.

**The week's shelves and Surprise me reach the app.**
- **Web:** unchanged: shelves lead `/explore/`, and the die is in the home page's box and
  over a search's results.
- **App:** "Recipes for this week" in Explore's Cuisines (the first three shelves, "All" for
  the rest), and a die at the left of the ask box on the home screen. Both merged 2026-11-27 in [findish-app#7](https://github.com/kyle-pace/findish-app/pull/7) and sent to internal TestFlight; checked in the iPhone simulator only.
- **How they relate:** *same* shelf names, blurbs and ids, and the same events ("Viewed
  Collection", "Opened Recipe" with `opened_from: discover`, "Picked Random Recipe").
  *Adapted*: the app shows three shelves in Cuisines with a page for all of them, since
  Cuisines also holds the continents. *Later* for the app: "See all" for one shelf (the web
  holds the search to the shelf's keys; the app's search can't yet), and the die over results.

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

Last checked: 2026-11-21 (web at recipe-search `7774072`, app 0.6.0 after the parity pass). Rows touched since carry their own dates.

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
| Pages for each cuisine, course and ingredient (`/browse/` lists them) | Yes | Cuisines and ingredients: recipes on Explore's own pages (findish-app#8, not built yet); no course pages | See the decision log, 2026-11-27 |
| Surprise me (a random recipe) | Yes: a die in the home page's box, and in the count line | Yes (findish-app#7, 2026-11-27): a die in the ask box on the home screen | See the decision log, 2026-11-27. The app has no die over results yet |
| The week's shelves (collections) | Yes, on `/explore/#shelves` since 2026-11-26 (`/discover/` forwards there) | Yes (findish-app#7, 2026-11-27): "Recipes for this week" in Explore's Cuisines, three shelves and "All" | Built from `/discover.json`, which the app reads as is. The app has no "See all" for one shelf yet; "See all" is the search held to a shelf (`collection=`, keys in `/discover/keys.json`); same shelf ids and event names |
| Explore: the globe, a page for every cuisine, dish and ingredient, Every ingredient | Yes (`/explore/`, 2026-11-26; moved in from World cuisine) | Yes (2026-11-26, internal TestFlight): an Explore tab with Cuisines, Globe and Wander (Cuisines was Browse until the "one word for one place" decision), and "Find recipes" on every page | The World cuisines app's screens moved into the app; it reads `/explore/app/data/` and `/covers/`. Checked on the iPhone simulator only: iPad, largest text and VoiceOver still need a look. The app adds "Changed Explore View" |
| Today's dish on Explore | No (the site publishes the list the app picks from: `/explore/app/data/web/daily.json`, from `scripts/featured-dishes.mjs`; since 2026-11-27 also a sentence per dish and the holidays' dishes) | Yes: one a day from that list, in order; before the list has loaded, a dish with a photo, a cuisine and two ingredients. The sentence, the holidays and not repeating it in "Pick up where you left off" came in with findish-app#7 | Which dishes can be featured, and their order, are decided on the site so both stay in step: nothing that isn't a dish (sauces, pastes, cheeses, drinks, restaurants), only fuller pages, and no cuisine twice in a week. `version: 1`; fields only ever added |
| About sections on cuisine and ingredient pages | Yes (2026-11-26) | Not yet | The app has no browse pages |
| "Find recipes" on a dish's Explore page | Yes, only for a dish with three or more recipes here (2026-11-27) | Yes, on every page | See the decision log, 2026-11-27 |
| A line to Explore above a one-dish or one-ingredient search | Yes (2026-11-27) | Not yet | With the cuisine line, when the app gets one |
| World cuisine notes on cuisine searches | Yes (link) | Not yet | |
| Recently opened, saved recipes | Yes (this browser) | Yes (Saved, offline) | |
| Clean recipe card, scaling, cook mode | No | Yes | App only: reads the creator's page inside the app |
| Works offline | No | Yes | App keeps the last index |
| Assistants (MCP) | Yes | No | Web only: it's a server |
| Recipes for a shopping list (`/api/with`) | Yes | No | Web only: used by the Grocery Deals app |
| Send feedback (email to Kyle) | Yes (footer) | Yes (Settings) | Same words, "Send feedback", and the same event, "Opened Feedback Link" (`opened_from`: welcome, footer, settings). Added 2026-11-23 |
| About (what finDish is) | Yes (the About page, linked from the footer; the short "About this site" dialog was removed 2026-11-26) | Yes (Settings has an About section) | Web only: the page. |

**Search terms (2026-11-26, web only so far):** the web's "Searched Recipes" now carries `term_kind`, `term`, `ingredient_ids`, `creator_ids`, `cuisine`, `course` and `diet`, all values from finDish's own lists (`src/lib/known-term.mjs`), never typed text. The app should send the same properties with the same rule before the two are compared in one chart.

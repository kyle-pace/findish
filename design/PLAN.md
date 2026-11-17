# Findish: design plan (November 8, 2026, third pass)

**First pass** read as generated: a hero headline over a pill search bar, pills for every control, a grid of identical rounded cards, an eyebrow label, colored squares and middle-dot meta lines.

**Second pass** made the query a sentence ("I have ___ / I want to make ___") set very large. It was distinctive, but two fields and a sentence asked people to learn a new way to search, and the About section sat under the app.

**Third pass:** Kyle's call. A search engine is the right model for a search engine: one box, centered, with the explanation on its own page. What keeps it from looking generated is in the details below, not in a novel layout.

**Fourth pass, "Hushed" (November 9, Kyle's pick of three):** the third pass, with the volume down. It read as cluttered, worst in dark mode: the bright mint did six jobs (button, actions, idea links, active filter, highlights, focus), every result title had its matching word boxed in green, two columns of big bold near-white titles glowed, the filters wrapped to three lines on a phone, and the home page was a wall of about 25 green links. The fixes:

- **Color does one job.** Nori is only for tags, focus and the underline under a filter that's set. The search button and every action are ink.
- **No highlights in result names.** Every result matches, so marking the words again is noise. The suggestions still highlight as you type.
- **Quieter titles:** body size, semi-bold (600).
- **Filters on one short line,** small, each with a ▾. (On phones the line scrolled sideways until November 17; it is one word, "Filters", now. See "The polish round".)
- **Softer dark mode:** a lifted charcoal (#151918) and an off-white (#DFE5E2) instead of near-black and near-white.
- **Home:** the ideas are smaller, in ink, and the creator line names two creators and links to the full list on About.

The other two directions considered: a cookbook-index list (one column, time on a dotted leader) and a contact sheet of square photos. Their stylesheets are on the `design-options` branch.

## The wordmark (November 16, 2026)

Findish is "fin", a plate-shaped d in tomato red, "ish", in Atkinson bold. The d (a plate seen from above, with its stem) is where find and dish meet. Kyle picked the plate d on November 16 from mocks that combined two earlier ideas, bars over and under the name and the plate d; it replaced the curve under "dish", and he had the bars taken off the same day because they boxed the name in. That night the d got heavier strokes (11 units, matching the bold letters) and lost the extra room on its right so the gaps either side of it are even. Lines over "fin" and under "ish" alone read as a diagonal, so Kyle settled on lines that cross the d: one over "find", one under "dish", highlighting both words with the d shared between them. It's text and one small inline SVG for the d (`src/components/Wordmark.astro`), so it scales and follows light and dark; screen readers hear "Findish" from hidden text and skip the drawing. It's the big name on the home page, the small link home in results, and a link home at the top of every other page (`src/components/SiteHead.astro`, since there's no top bar). The plate d on its own is the favicon (`public/favicon-v3.svg`, tomato since November 16, renamed so search engines refetch it; every page passes it to `LabLayout`), and the home share card (`design/og.html`) uses the full mark.

## The subject

People look for a recipe three ways: by dish ("mapo tofu"), by what they have ("ginger, tofu") and by who they trust ("something from Maangchi"). One box takes all three. Words are words; an ingredient or a creator picked from the suggestions becomes a tag in the box, marked like a highlighter on a shopping list.

## Two modes

- **Home** (nothing searched): the name, one line on what's in it, the box, "Pick one at random", and three short lines of ideas (dishes, ingredients, creators). All centered in the window, like a search engine's front page. No filters.
- **Results** (after a search): the name shrinks to a link home in the upper left, the box sits under it, then the filters as words (Show, Course, Cuisine, Creator, Time), then results. Left-aligned. A main dish carries one tomato link, "Thai sides to go with it", that swaps the search for sides from the same cuisine (Course: sides, Cuisine: Thai) and says which dish they're for.
- **New this week** (November 16): a fourth line under the home page ideas names up to three recipes the latest crawl's week found (not a creator's first crawl) and offers "See all", which shows them as a removable "new this week" tag.

```
Home                                       Results

          Findish                    Findish
   2,226 recipes from …, and 3,761 videos  [ from The Woks of Life × | tofu × | and…   (⌕) ]
 [ A dish, ingredient or creator     (⌕) ] Cuisine: any  Creator: The Woks of Life  Time: any  Pick one at random  Start over
          Pick one at random               102 recipes and 4 videos on YouTube.
   Try mapo tofu, pad thai or dumplings.   [photo] How to Make Frozen Tofu
                                                   8 hours 25 minutes, Chinese, from The Woks of Life
```

## The box

- Square-shouldered (0.5rem corners), a 1px rule at 3:1 contrast, the search button inside on the right as an ink square with a magnifier. Not a pill.
- Tags: ingredients are filled with scallion green; creators are outlined in it and read "from Maangchi", so the two kinds look different without color alone.
- Suggestions group by what they do: things to add (creators, ingredients, each labeled "Creator" or "Ingredient") above a rule, recipes to open below, then "Search for …".

## About

Its own page (`/about/`), built at build time from the index: why it exists, every creator with counts and ways to support them, how it works, and a note for site owners (the crawler's user agent links here). Top bar: Search and About.

## Color

"Tomato and basil" (Kyle's pick, November 16, from three warmer directions; it replaced "Nori", the deep seaweed green from November 8, which read too quiet). A warm cream page, brown-black ink, tomato red as the one bold color, and a soft basil green behind ingredient tags. Tokens in `src/styles/theme.css`; every text pair checked for AA in light and dark.

| Name | Light | Dark | Use |
| --- | --- | --- | --- |
| Cream (page) | #FBF5EC | #1D1714 | Background |
| Raised | #FFFDF9 | #251E1A | The box, menus |
| Ink | #2A1712 | #F1E6DF | Text, actions |
| Muted | #6E5249 | #B8A49B | Secondary text |
| Field rule | #9A7E72 | #7D6A61 | The box's border, underlines under actions |
| Tomato | #B8341C (button #C23B22, white glass) | #FF9F86 (button, dark glass) | The plate d, the search button, focus, links, a filter that's set, the ring around creator tags (#F3C9BC / #5A2C22) |
| Basil | fill #E2EFD9 | fill #25331F | Behind ingredient tags |
| Chili | #9F1D1D | #FF8F80 | Removing |
| Line | #EFE2D6 | #332924 | Dividers |

No source tints: the photos carry the color.

## Type

Atkinson Hyperlegible Next only. The name is the one large thing on the home page; in results it drops to the size of a heading. Numbers in tabular figures, not monospace.

## Still true from before

Results are rows (photo left), one column on phones, two on wide screens. Meta lines are plain sentences ("25 minutes, Chinese, from The Woks of Life"), never middle dots. No pills, eyebrows or badges.


## Where the home page sits (November 16, 2026)

The name and box sit a little above the middle of the window, like a search engine's front page, and the ideas follow under them. The space above is `clamp(2rem, 30svh - 7rem, 18rem)`, so it grows with the window's height: the box's middle lands at 41 to 48 percent of the height from a small phone to a 1920 by 1080 monitor (measured November 16). It used to be centered with flexbox, which pushed the name off the top once the ideas made the column taller than the window.

## A Mobbin pass (November 16, 2026)

Kyle found the home page cramped and the menus fussy. From filter menus on Navan, TravelPerk, Hotjar and Klarna, search home pages on Perplexity and Surfshark, and result lists on Klarna and Airbnb:

- **Home:** clear space between the name and its line, the box, and the ideas (more on tall screens, via `clamp()` with `vh`); lines break evenly (`text-wrap: balance`) so no word sits alone; New this week is set a little apart, since it's news rather than a way in.
- **Filter menus:** as wide as the longest option, one line per option (radio, label, count in a grid), counts right-aligned and never wrapping, a soft basil highlight on hover. Show's counts are plain numbers like the other menus. 40px rows on desktop, 44px on phones.
- **Results:** the "Support them" links are muted ink with a quiet underline instead of tomato, so the recipe's name leads.

## Cuisines and the note card (November 16, 2026)

Kyle wanted people to be able to search for a cuisine, or an ingredient, as the thing itself, without the page getting busy. The rule: one extra thing at a time, and only when the search is clearly about it.

- A cuisine is a suggestion like a creator or an ingredient, and becomes a tag with a basil outline (between an ingredient's fill and a creator's tomato ring).
- When the search is exactly one cuisine, one quiet line under the count: "Explore Thai cuisine on World cuisine". Nothing else. (It was a strip with a Wikipedia sentence for cuisines and ingredients until November 16; the sentences were dictionary definitions, so Kyle cut it to the link.)
- It's a show/hide ("About Thai cuisine"), so anyone who'd rather not see notes can close it to one quiet line; it stays closed on later searches in that browser.

## Creator pages (November 16, 2026)

Findish is heading toward a hundred creators, and backing them is half its point, so each one gets a page (`/creators/<id>/`) and there's a list of all of them (`/creators/`). Built at build time from the index (`src/lib/creators.ts`); no script on a creator page beyond the shared click tracking.

**Who it's for:** someone who just cooked a good recipe and wonders who made it and how to give something back. The page answers in that order: who they are, how to back them, a few of their recipes.

**The one bold thing: the bookshelf.** Their cookbooks stand on a tomato rule like books on a shelf, covers at the same height and different widths, titles under them. A book Open Library has no cover for is drawn as a plain cloth cover (raised color, a tomato band, the title set in it), so a missing cover still looks like a book. Covers are fetched once by `npm run covers` and served from `public/covers/`, never hotlinked.

**Ways to back them, most helpful first,** each group only when it has something: Join (pays them directly), Buy (books, shops), Follow (free). The group comes from the link's address (`scripts/support.mjs`), so nobody tags 100 creators by hand.

```
Findish

The Woks of Life
1,372 recipes and 217 videos, mostly Chinese.
[Search their recipes]   thewoksoflife.com

How to back them
Buy      ┃▌The Woks  ▌┃                       Their books go through Bookshop.org…
━━━━━━━━━┻━━━━━━━━━━━━┻━━━━━━━━━━ (tomato shelf)
Follow   YouTube

A few of their recipes
[photo] Mapo Tofu                     [photo] Scallion Pancakes
        40 minutes, Chinese                   …
Search all 1,372 of their recipes
```

**The list** (`/creators/`): a filter box, then creators grouped under their main cuisine (the one half or more of their recipes are), biggest groups first and "Many cuisines" last. Each is a ruled line, not a card: their name, what Findish has from them, and a short hint like "Patreon and 2 cookbooks". Columns on wide screens.

Checked against the defaults: no cards, pills, eyebrows or dots; group names are real headings; the only color is the tomato shelf and links.

## Browse pages (November 17, 2026)

Pages for someone who arrives from a web search for "Korean recipes" or "recipes with tofu", not from the search box: one per cuisine (`/cuisine/korean/`), per course (`/course/soup/`) and per common ingredient (`/with/tofu/`), and `/browse/` listing them all.

**Who it's for:** someone who wants a few good places to start and doesn't know Findish yet. The page answers in that order: what this is and how many, a few recipes, then the way into the full search.

**Nothing new to look at.** They wear the creator pages' clothes: the same big heading and one muted sentence of counts, the ink "Search all 24 Korean recipes" button, the search's rows (photo, name, a plain sentence: "40 minutes, from The Woks of Life"), then ruled lists of a name and a count. The photos carry the color; the only tomato is links. No intro paragraph of filler about the cuisine: the count and the recipes are the content.

```
findish

Korean recipes
24 Korean recipes from 3 independent cooks. Each one opens on the cook's own site…
[Search all 24 Korean recipes]

A few to start with
[photo] Bibimbap                          [photo] Japchae
        1 hour 10 minutes, from RecipeTin Eats    40 minutes, from The Woks of Life
Search all 24 Korean recipes

By course            Who they're from
Mains  19 recipes    The Woks of Life  19 recipes
```

Checked against the defaults: no cards, pills, eyebrows or dots; headings are real headings; lists are ruled lines.


## The UI pass (November 17, 2026)

From a user test, an engineering audit and a second Mobbin pass. Nothing about the look changed direction; these are the rules that were added.

- **Phone filter menus are sheets:** the page behind dims, each sheet has a "Done" text button at the bottom right (bold ink, tomato underline, like a filter that's set), and a sheet with one choice closes when you pick. (Since the polish round a phone opens all the filters in one sheet; the single menus are what a wider screen shows.)
- **What's chosen with the keyboard gets a tomato bar** down its left edge, on top of the basil fill: the selected suggestion and the focused option in a filter menu. The fill alone was too faint to see (1.2:1).
- **Large text:** the search button sits beside the field as its own item, and takes a full-width row under it when the box gets very narrow; a result's photo goes above its words when the row is too narrow for both.
- **Nothing moves while loading:** a link to a search opens already laid out as results, with its tags and words in the box; the home page's lines hold their place.
- **Opened recipes** are muted ink, like the line under them.
- **Nothing found** lists what would find something (each with its count), then the home page's three idea lines, left-aligned.
- **Ask:** the choice comes first. A question's suggestions are just two rows, "Ask: …" ("Sent to Claude to turn into a search. Not kept.") and "Search for these words" ("Searched here, on your device."). The answer is one block with a tomato rule on the left: the question (tap to put it back in the box; one line on a phone), the answer in full ink, and one small muted line with who answered and "Search my words instead". Centred, without the rule, on the home page.

## The features round (November 17, 2026)

From the Mobbin pass's gap list. Each one is drawn with what the page already has: sentence lines of underlined words, the filter row, the suggestions panel. No chips, no cards, no icons beyond the × that tags already use.

- **Under the empty box:** click into the box with nothing in it and the panel that holds suggestions lists what's kept on this device: "Recent searches" (the last 8, each one line like "tofu, ginger, from The Woks of Life", with a × and "Clear recent searches"), "Recently opened" (up to 5 recipes) and "Your 3 saved recipes". They are real links and buttons under small bold headings, not options in a list, so removing one works with a finger, a keyboard or a screen reader. Typing swaps them for suggestions.
- **Save:** a quiet underlined word at the end of the line under a recipe ("…from The Woks of Life. Save"). Once saved it reads "Saved" in ink with a tomato underline, like a filter that's set. The saved view is a removable "saved" tag, reached from the footer, the panel and one line on the home page ("Or go back to your 3 saved recipes.").
- **The creator's name** in that line is a link to their page.
- **Diet and Order** are two more words in the filter row ("Diet: any", "Order: best match"). The three actions (Pick one at random, Share this search, Start over) left the row for the count line in the polish round, below.
- **"Narrow it"** is one muted sentence under the count: "Narrow it: Chinese (9), Japanese (2), 30 minutes or less (6), vegetarian (2)." Only choices that would narrow this list, and none for a short list.
- **"Related"** is one sentence after the results of a dish search: "Related: twice cooked pork, kung pao chicken." It shows only when there are two or more worth offering, which is less often than not.
- **Ingredient results** (two or more ingredient tags, no dish words) sit under headings: "Uses all 3", "Uses 2 of 3", "Uses 1 of 3" ("Uses both" for two), each with its count, a rule over every heading but the first.
- **Completions:** up to three common dishes that finish what's typed ("map" offers "mapo tofu"), between the tags to add and the recipes, the typed part marked like the words in recipe names.
- **Creator pages** lead with a search box for just that creator (a square-shouldered field and an ink "Search" button, in place of the "Search their recipes" button) and, when the latest crawl found any, "New from them this week" above "How to back them".

```
Results                                             Under the empty box
[ mapo tofu                                  (⌕) ]  [ A dish, ingredient, cuisine or creator (⌕) ]
Show ▾ Course ▾ Cuisine ▾ Creator ▾ Time ▾          Recent searches
Diet: any ▾ Order: best match ▾   Pick…  Share…     pad thai, ginger                          ×
11 recipes and 17 videos on YouTube.                mapo tofu, Chinese cuisine                ×
Narrow it: Chinese (9), 30 minutes or less (6).     Clear recent searches
[photo] Mapo Tofu                                   Recently opened
        35 minutes, Chinese, from The Woks of Life. Save     Mapo Tofu            The Woks of Life
…                                                   Your 2 saved recipes
Related: twice cooked pork, kung pao chicken.
```

Checked against the defaults: the new things are sentences, words in the filter row and headed lists; the only new colour is the tomato underline under "Saved".

## The polish round (November 17, 2026)

The filter row had grown to ten words (seven filters and three actions): about 1,100px in one line on a 390px phone, so the actions were a long swipe away and a filter that was set was easy to miss. From the filter sheets on Airbnb, NYT Cooking and Epicurious (one control, one sheet, a button that says how many it will show), drawn with what the page already has.

- **One word on a narrow screen: "Filters ▾".** It reads "Filters, 2 set" when any are, in ink with the tomato underline of a filter that's set, so the state is in the words and not in a colour. "Narrow" is the row's own width (a container query at 40rem), so a desktop at 200% text gets it too.
- **What's set is a sentence under it:** "mains ×, 30 minutes or less ×, quickest first ×." Underlined words like every other action, each with a chili × that takes it off. Not chips: no fill, no outline, commas between them. It lists only what the box doesn't already show: a cuisine, a creator and a diet are tags in the box with their own ×, and the first build said each of them twice (once in the box, once in the sentence). So "Filters, 2 set" counts the words in the sentence, and a search with only a cuisine reads plain "Filters". The wide row is unchanged: its words ("Cuisine: Chinese ▾") are the controls themselves.
- **One sheet holds every filter,** stacked under bold names with a rule between groups: Show, Course, Cuisine, Creators, Ready in, Diet, Order. The page behind dims. Cuisines the search has none of are left out, and a list longer than twelve shows its first six with "Show all 14 creators". At the bottom, staying put while the filters scroll: "Clear filters" (an underlined word; muted when there is nothing to clear) and the page's second filled button, an ink square-shouldered "Show 24 recipes" that counts as you pick and closes the sheet. ("Nothing matches" when it would show none.)
- **The actions sit with the count:** "24 recipes." on the left and "Pick one at random", "Share this search", "Start over" at the far end of the same line. When there isn't room (a phone) they go under the count together. Nothing on the results page scrolls sideways any more.
- **Wide screens keep the row** of seven words, which now fits one line at 1280 and wraps to two below that.
- **Very large text** (the sheet narrower than 20rem): an option's count goes under its name, and only the "Show" button stays at the bottom; "Clear filters" ends the list.

```
Phone                                   Its sheet
[ Chinese cuisine × vegetarian ×  (⌕) ] Filters
[ tofu                                ]
Filters, 2 set ▾                        Show
mains ×, 30 minutes or less ×.          (•) Recipes and videos        416
24 recipes.                             ( ) Recipes                   334
                                        ────────────────────────────────
Pick one at random  Share this search   Course
Start over                              (•) Any course                334
[photo] Spicy Cold Tofu                 …
        5 minutes, Chinese, from …      ────────────────────────────────
                                        Clear filters   [ Show 24 recipes ]

Desktop
Show: recipes and videos ▾  Course: any ▾  Cuisine: Thai ▾  Creator: any ▾  Time: 30 minutes or less ▾  Diet: any ▾  Order: quickest first ▾
16 recipes.                                              Pick one at random   Share this search   Start over
```

Checked against the defaults: no pills or chips (the set filters are a sentence), no card, no eyebrow; the one new filled thing is the sheet's button, in ink like the search button's shape, and the only colour is the tomato underline and the chili ×.

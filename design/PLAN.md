# Findish: design plan (November 8, 2026, third pass)

**First pass** read as generated: a hero headline over a pill search bar, pills for every control, a grid of identical rounded cards, an eyebrow label, colored squares and middle-dot meta lines.

**Second pass** made the query a sentence ("I have ___ / I want to make ___") set very large. It was distinctive, but two fields and a sentence asked people to learn a new way to search, and the About section sat under the app.

**Third pass:** Kyle's call. A search engine is the right model for a search engine: one box, centered, with the explanation on its own page. What keeps it from looking generated is in the details below, not in a novel layout.

**Fourth pass, "Hushed" (November 9, Kyle's pick of three):** the third pass, with the volume down. It read as cluttered, worst in dark mode: the bright mint did six jobs (button, actions, idea links, active filter, highlights, focus), every result title had its matching word boxed in green, two columns of big bold near-white titles glowed, the filters wrapped to three lines on a phone, and the home page was a wall of about 25 green links. The fixes:

- **Color does one job.** Nori is only for tags, focus and the underline under a filter that's set. The search button and every action are ink.
- **No highlights in result names.** Every result matches, so marking the words again is noise. The suggestions still highlight as you type.
- **Quieter titles:** body size, semi-bold (600).
- **Filters on one short line,** small, each with a ▾. On phones the line scrolls sideways and fades at the edge.
- **Softer dark mode:** a lifted charcoal (#151918) and an off-white (#DFE5E2) instead of near-black and near-white.
- **Home:** the ideas are smaller, in ink, and the creator line names two creators and links to the full list on About.

The other two directions considered: a cookbook-index list (one column, time on a dotted leader) and a contact sheet of square photos. Their stylesheets are on the `design-options` branch.

## The wordmark (November 16, 2026)

Findish is "fin", a plate-shaped d in tomato red, "ish", in Atkinson bold. The d (a plate seen from above, with its stem) is where find and dish meet. Kyle picked the plate d on November 16 from mocks that combined two earlier ideas, bars over and under the name and the plate d; it replaced the curve under "dish", and he had the bars taken off the same day because they boxed the name in. It's text and one small inline SVG for the d (`src/components/Wordmark.astro`), so it scales and follows light and dark; screen readers hear "Findish" from hidden text and skip the drawing. It's the big name on the home page, the small link home in results, and a link home at the top of every other page (`src/components/SiteHead.astro`, since there's no top bar). The plate d on its own is the favicon (`public/favicon-v3.svg`, tomato since November 16, renamed so search engines refetch it; every page passes it to `LabLayout`), and the home share card (`design/og.html`) uses the full mark.

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
- When the search is exactly one cuisine or one ingredient, a quiet strip under the count: its name, one sentence from World cuisine (from Wikipedia), and links to both. A field-rule line on the left, not a panel or card, so it reads as a note and not a result. Two ingredients, a dish name, a creator or anything left out: no strip.

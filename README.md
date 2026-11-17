# Findish

One search box across the recipe sites I trust: The Woks of Life, Just One Cookbook, Hot Thai Kitchen, Smitten Kitchen, Maangchi, and J. Kenji López-Alt's YouTube videos. It runs on our own small index, not Google, and every result opens on the original site.

**Status:** live at **[findish.now](https://findish.now/)** (November 16, 2026). It started as Recipe search, an experiment at kylepace.dev/recipe-search/ (November 8, 2026); those old addresses forward here.

## How it will work

1. A weekly job checks each site's robots.txt, reads its sitemap, and keeps only the data needed to find a recipe: title, link, ingredient names, time and cuisine. Never the method.
2. Kenji's videos come from the official YouTube Data API.
3. Ingredients are matched to KitchenCatalog names, so "scallions" and "green onion" find the same recipes.
4. The data becomes a static search index that runs in the browser (`scripts/build-index.mjs`, on every build). Free to host, no server, and nothing typed leaves the page.
5. Sites we can't index, like Serious Eats, get an "Also search" link instead.

Every source and why it's in or out lives in [KitchenCatalog](https://github.com/kyle-pace/kitchen-catalog)'s `recipe-sources/sources.json` (vendored to `vendor/kitchen-catalog/`; edit it there, then `npm run sync-catalog`). See `CLAUDE.md` for the rules.

## The crawler

```sh
npm ci
npm test
node crawler/crawl.mjs --limit 5 --sources woks   # a small try
```

GitHub Actions runs the full crawl every Monday and commits `data/` and `state/`. A push that changes the crawler or the vendored source list runs a smoke test on the live sites instead (5 pages each, nothing committed). The first full run fills the index; later runs fetch only pages whose sitemap date changed. A run with a blocked site, a failed source or a big drop in recipe count fails, so it shows up as a GitHub notification.

## The search page

```sh
npm install
npm run dev       # http://localhost:4321/
npm run build     # builds the index, then the site, to dist/
npm run preview   # builds, then runs it the way Cloudflare will
```

| What | Where |
| --- | --- |
| The page | `src/pages/index.astro` |
| Searching, typeahead, filters, URL state | `src/scripts/search.ts` |
| The index (generated, not committed) | `public/index.json`, from `scripts/build-index.mjs` |
| Ingredient matching and the source list | `vendor/kitchen-catalog/` (refresh with `npm run sync-catalog`), read through `crawler/lib/sources.mjs` |
| Links to World cuisine (the line above a one-cuisine search) | `vendor/world-cuisine/notes.json` from World cuisine (refresh with `npm run sync-world-cuisine`), sentence rules in `scripts/world-cuisine.mjs` |
| Page shell (back link, footer line, analytics) | `LabLayout` from [kp-design](https://github.com/kyle-pace/kp-design), with Findish's own settings in `src/lib/site.ts` |
| Its own look (colors) | `src/styles/theme.css` |
| Creator pages (`/creators/` and `/creators/<id>/`) | `src/pages/creators/`, built from `src/lib/creators.ts`; styles in `src/styles/creators.css` |
| Sorting support links into join, buy and follow | `scripts/support.mjs` (tests in `scripts/support.test.mjs`) |
| Cookbook covers | `public/covers/`, fetched from Open Library by `npm run covers` (run it after `npm run sync-catalog` adds books, and commit the covers) |
| Sitemap | `src/pages/sitemap.xml.ts` (pages in `PAGES`, plus every creator page) |
| Share cards | `design/og*.html`, rendered to `public/og*.png` |
| Outside hosts (recipe photos) | `.agents/allowed-hosts.txt` |

It's its own Cloudflare Worker, `recipe-search`, with findish.now as its Custom Domain in `wrangler.jsonc`. Cloudflare Workers Builds deploys `main` (build `npm run build`, deploy `npx wrangler deploy`), so each Monday's crawl ships a fresh index on its own.

## For AI assistants (MCP)

The same index is searchable by AI assistants over MCP (Model Context Protocol, the standard way to give an assistant tools) at `https://findish.now/mcp`. Read-only, no sign-in, nothing about the person asking is kept.

| Tool | What it answers |
| --- | --- |
| `search_recipes` | Recipes by dish name, by ingredients to cook with, or both; plus without, vegetarian or vegan, course, cuisine, time and creator. Results are names and links to the original, never the method. |
| `list_sources` | Who is indexed, ways to support them (marked join, buy or follow), each creator's page, and the cuisines and courses to filter on. |

| What | Where |
| --- | --- |
| The endpoint (the only server-run part of the site) | `src/pages/mcp.ts` |
| The search rules, as plain functions | `src/mcp/search.mjs`, tests in `src/mcp/search.test.mjs` (`npm test`) |
| The server's address, the Claude link and the page paths | `src/lib/assistants.ts` |
| Try every tool with the official MCP client | `npm run preview`, then `npm run try-mcp` (add the live address to check a deploy) |

To connect: the For AI assistants page has an Add to Claude button and the address (findish.now/assistants/, `src/pages/assistants.astro`). The privacy page, which is also the privacy policy for a Connectors Directory listing, is findish.now/privacy/. By hand in Claude: Customize > Connectors > Add custom connector, and paste the address. In Claude Code, `claude mcp add --transport http findish https://findish.now/mcp`.

## Ask (an experiment)

At [findish.now/?chat=1](https://findish.now/?chat=1) only: type a question in the search box ("what can I make with fish, kimchi and onions?") and Claude (Haiku 5.5, through Anthropic's API) turns it into a Findish search, which the page shows like any other. Claude never writes recipe names or links; it only picks the search. Nothing typed is kept.

| What | Where |
| --- | --- |
| The logic and its tests | `src/chat/chat.mjs`, `src/chat/chat.test.mjs` |
| The one file that calls Anthropic | `src/chat/anthropic.mjs` (key: the Worker secret `ANTHROPIC_API_KEY`) |
| The endpoint | `src/pages/api/chat.ts`, rate limits in `wrangler.jsonc` |
| Telling a question from a search | `looksLikeAsk()` in `src/scripts/search.ts` |
| The hint and the answer line | `src/scripts/chat.ts`, `src/styles/chat.css` |

## The prototype

```sh
python3 prototype/build.py   # writes prototype/index.html
```

Open `prototype/index.html` in a browser. It uses a small real sample: 34 recipes and 14 videos.

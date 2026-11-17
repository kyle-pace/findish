// Findish as an MCP server, at findish.now/mcp: lets an AI assistant
// (Claude, ChatGPT, anything that speaks MCP over Streamable HTTP) search the same index the
// page uses. Read-only, no sign-in, and nothing about the person asking is kept or logged.
//
// This is the only part of the site that runs code on the server; the pages are still
// static files. The answers are worked out in src/mcp/search.mjs.

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { z } from 'zod';
import { listSources, searchRecipes } from '../mcp/search.mjs';
import { loadIndex } from '../mcp/load-index';

export const prerender = false;

// Bump this when the tools, their arguments or their answers change, so assistants that
// remember a server by version notice.
const VERSION = '0.2.0';
const ROUTE = '/mcp';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
// Each answer goes out twice, as the spec asks: as text for assistants that only read text,
// and as `structuredContent` (matching the tool's outputSchema) for those that read data.
const json = (value: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value });
const failed = (e: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: `Could not search right now: ${e instanceof Error ? e.message : 'unknown error'}. Try again in a minute, or use https://findish.now/` }],
});

const strings = z.array(z.string()).max(25);
const COURSES = ['main', 'side', 'soup', 'starter', 'breakfast', 'dessert', 'bread', 'sauce', 'drink'] as const;

// What comes back. Only the parts every answer has are required; the rest is optional and
// extra fields are allowed, so the search (src/mcp/search.mjs) can add to its answers
// without this file turning them away.
const SEARCH_OUTPUT = z.looseObject({
  total_recipes: z.number().optional().describe('How many recipes match in all; `recipes` holds the first `limit` of them.'),
  recipes: z
    .array(
      z.looseObject({
        name: z.string(),
        url: z.string().describe('The recipe on its own site. Always give this link.'),
        from: z.string().optional().describe('The site it is from.'),
        time: z.string().optional(),
        cuisine: z.string().optional(),
        course: z.string().optional(),
        uses: z.array(z.string()).optional().describe('Which of the asked-for ingredients it uses.'),
        also_needs: z.array(z.string()).optional().describe('What else it needs.'),
      }),
    )
    .optional(),
  videos: z.array(z.looseObject({ title: z.string(), url: z.string(), channel: z.string().optional(), on: z.string().optional(), published: z.string().optional() })).optional(),
  cooking_with: z.array(z.string()).optional().describe('The ingredients the search understood.'),
  understood: z.looseObject({ query: z.string().optional() }).optional().describe('What was taken out of `query` and searched as a filter instead, with the words that were left.'),
  corrected: z.array(z.looseObject({ from: z.string(), to: z.string() })).optional().describe('Spellings that were fixed.'),
  leaving_out: z.array(z.string()).optional().describe('What is really being left out for `without`, by name; a word in quotes could only be left out by recipe name.'),
  relaxed: z
    .looseObject({
      dropped: z.string().optional().describe('The one thing dropped for the recipes listed here.'),
      total_recipes: z.number().optional(),
      recipes: z.array(z.looseObject({ name: z.string(), url: z.string() })).optional(),
      counts: z.record(z.string(), z.number()).optional().describe('How many recipes each single change would find.'),
    })
    .optional()
    .describe('Only when nothing matched everything: what dropping one thing would find. What is being left out is never dropped.'),
  total_videos: z.number().optional().describe('How many videos match, when only videos were asked for.'),
  notes: z.array(z.string()).optional().describe('Plain notes about this answer. Read them.'),
  error: z.string().optional().describe('Set when an argument matched nothing; the lists of what exists come with it.'),
  cuisines: z.array(z.string()).optional(),
  courses: z.array(z.string()).optional(),
  creators: z.array(z.string()).optional(),
  also_search: z.array(z.looseObject({ name: z.string(), search: z.string() })).optional().describe('Sites that are not indexed but can be searched directly.'),
  crawled: z.string().optional().describe('The day the index was last refreshed.'),
  source: z.string().optional(),
});

const SOURCES_OUTPUT = z.looseObject({
  about: z.string().optional(),
  creators: z.array(
    z.looseObject({
      name: z.string(),
      site: z.string().optional(),
      recipes: z.number().optional().describe('Written recipes in the index. Missing means none: this creator is videos only.'),
      videos: z.number().optional(),
      youtube: z.string().optional(),
      page: z.string().optional().describe('Their page on Findish, with every way to back them.'),
      support: z.array(z.looseObject({ label: z.string(), url: z.string(), kind: z.string().optional() })).optional(),
    }),
  ),
  not_indexed_but_searchable: z.array(z.string()).optional(),
  cuisines: z.array(z.string()).optional(),
  courses: z.array(z.string()).optional(),
  recipe_count: z.number().optional(),
  video_count: z.number().optional(),
  crawled: z.string().optional(),
  source: z.string().optional(),
  more: z.string().optional(),
});

const say = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] });

function createServer(origin: string) {
  const server = new McpServer(
    { name: 'findish', title: 'Findish', version: VERSION, websiteUrl: 'https://findish.now/' },
    {
      // This server keeps nothing between requests, so it can never tell a client that its
      // list of tools or prompts changed. Say so, instead of the SDK's default of "it might".
      capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
      instructions:
        'Searches a small index of recipes and cooking videos from a hand-picked set of independent recipe sites and YouTube channels. ' +
        'Use search_recipes to find recipes by dish name, by ingredients to cook with, or both; use list_sources to see who is indexed and how to support them. ' +
        'What the index holds: names, links, ingredient names, total time, cuisine and course. What it does not hold: the method, amounts, servings, nutrition, ratings, spice level, equipment or difficulty, so it cannot filter on those; say so rather than guessing. ' +
        'Labels are sparse: about a quarter of recipes have no cuisine, an eighth no course and a twelfth no time, and filtering on one leaves those recipes out. If a filtered search finds little, try it again without the cuisine, course or time. ' +
        'Some creators (see list_sources: those with videos and no recipes) are YouTube channels only; their results are videos, which carry no ingredients, time or cuisine. ' +
        'Vegetarian, vegan and `without` (an ingredient by name, or a group: dairy, eggs, nuts, shellfish, pork, meat, seafood) are best guesses from recipe names and ingredient lists: for an allergy, tell the person to check the recipe. Gluten cannot be filtered. ' +
        'Plain phrases in `query` ("quick vegetarian pad thai") are turned into filters; `understood` in the answer says which. When nothing matches, `relaxed` says what each single loosening would find. ' +
        'Always give the link so the person can read the recipe on the original site, and say which site it is from. Do not write out a recipe as if it came from these results.',
    },
  );

  server.registerTool(
    'search_recipes',
    {
      title: 'Search recipes',
      description:
        'Find recipes from independent recipe sites and YouTube channels (The Woks of Life, Hot Thai Kitchen, Smitten Kitchen, RecipeTin Eats and others; see list_sources). ' +
        'Search by dish (`query`), by what you have to cook with (`ingredients`), or both. With ingredients, recipes that use more of them and need fewer other things come first, and each result lists what it uses and what else it needs. ' +
        'Each result is a name, a link to the original recipe, the site, and time, cuisine and course when known; many recipes lack one of those labels and are left out when you filter on it. ' +
        'Matching YouTube videos from the same creators come along, labeled as YouTube; some creators have only videos. ' +
        'Read `notes` in the answer: it says what was understood, corrected, left out or loosened. There is no method, amount, serving size or nutrition here, so those cannot be searched.',
      inputSchema: z.object({
        query: z.string().max(200).optional().describe("Words for the dish, for example 'mapo tofu' or 'noodle soup'. Spelling is fixed for you (`corrected` says how). Not for ingredients you have: put those in `ingredients`."),
        ingredients: strings.optional().describe("Things to cook with, one per item, by plain name: ['chicken thighs', 'bok choy', 'tofu']. A recipe must use at least one."),
        without: strings.optional().describe("What to leave out: ingredients by name (['peanuts', 'mushrooms']) or a whole group: 'dairy', 'eggs', 'nuts', 'shellfish', 'pork', 'meat', 'seafood'. A best guess from names and ingredient lists, not an allergy check; `leaving_out` and `notes` in the answer say what was really left out. There is no gluten filter."),
        diet: z.enum(['vegetarian', 'vegan']).optional().describe('Leave out recipes with meat or seafood (vegetarian), and also dairy, eggs and honey (vegan). A best guess from recipe names and ingredient lists, not a guarantee.'),
        cuisine: z.string().max(60).optional().describe("A cuisine as listed by list_sources, for example 'Chinese', 'Thai', 'Japanese'. Recipes with no cuisine label are left out."),
        course: z
          .enum(COURSES)
          .optional()
          .describe("Which part of a meal: 'main', 'side' (sides and salads), 'soup', 'starter', 'breakfast', 'dessert', 'bread', 'sauce' (sauces and pantry) or 'drink'. Recipes no site labels are left out. For sides to go with a dish, ask for course 'side' with the dish's cuisine."),
        max_minutes: z.number().int().min(1).max(1440).optional().describe('Only recipes whose total time is known and at most this many minutes.'),
        creator: z.string().max(80).optional().describe("Only one creator, by name: 'The Woks of Life', 'Kenji', 'Maangchi'. A creator with only a YouTube channel returns videos."),
        new_only: z.boolean().optional().describe('Only recipes first found in the last week. Default false.'),
        show: z.enum(['both', 'recipes', 'videos']).optional().describe("Written recipes, YouTube videos, or both. Default 'both'."),
        sort: z.enum(['best', 'quickest', 'newest', 'random']).optional().describe("Order: 'best' match (default), 'quickest' first, 'newest' found first, or 'random' for ideas."),
        videos: z.boolean().optional().describe("Set false to leave YouTube videos out (the same as show 'recipes'). Default true."),
        limit: z.number().int().min(1).max(30).optional().describe('How many recipes to return. Default 10.'),
        offset: z.number().int().min(0).max(1000).optional().describe('Skip this many recipes, to see the next page: with limit 10, offset 10 is page two. Default 0.'),
      }),
      outputSchema: SEARCH_OUTPUT,
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return json(searchRecipes(await loadIndex(origin), args));
      } catch (e) {
        return failed(e);
      }
    },
  );

  server.registerTool(
    'list_sources',
    {
      title: 'Sources and cuisines',
      description:
        'Who is in the recipe index: each creator with their site, how many recipes and videos (a creator with videos and no recipes is a YouTube channel only), ways to support them (memberships and Patreon, cookbooks and shops, then free ways to follow, each marked join, buy or follow) and their page on Findish. Also the cuisines and courses that can be filtered on, with how many recipes carry each label, and sites that are not indexed but can be searched directly.',
      inputSchema: z.object({}),
      outputSchema: SOURCES_OUTPUT,
      annotations: READ_ONLY,
    },
    async () => {
      try {
        return json(listSources(await loadIndex(origin)));
      } catch (e) {
        return failed(e);
      }
    },
  );

  // Ready-made requests an assistant's app can offer as shortcuts. Each is one plain sentence
  // that leads to search_recipes; nothing here is kept.
  server.registerPrompt(
    'cook_with',
    {
      title: 'Cook with what I have',
      description: 'Find recipes that use a few ingredients you have.',
      argsSchema: z.object({ ingredients: z.string().max(300).describe("What you have, separated by commas: 'chicken thighs, bok choy, rice'") }),
    },
    ({ ingredients }) =>
      say(`Use Findish's search_recipes to find recipes I can cook with: ${ingredients}. Show the ones that use the most of them first, say what else each needs, and link each to its original site.`),
  );
  server.registerPrompt(
    'find_dish',
    {
      title: 'Find a dish',
      description: 'Find recipes and videos for a dish by name.',
      argsSchema: z.object({ dish: z.string().max(200).describe("The dish: 'mapo tofu'") }),
    },
    ({ dish }) => say(`Use Findish's search_recipes to find recipes and videos for ${dish}. Give a few from different creators, each with its link and the site it is from. Don't write out the method.`),
  );
  server.registerPrompt('whats_new', { title: 'New this week', description: 'The recipes Findish found in the last week.' }, () =>
    say("Use Findish's search_recipes with new_only true to show me the recipes found this week, each with its link and the site it is from."),
  );

  return server;
}

// Where a person who opens the address in a browser is sent: the For AI assistants page
// (assistants.astro), which has the Add to Claude button and the address to copy.
const PAGE = 'https://findish.now/assistants/';

export const ALL: APIRoute = async ({ request, locals }) => {
  // A person opening the address in a browser is sent to the page about it, not shown an error.
  if (request.method === 'GET' && !(request.headers.get('accept') || '').includes('text/event-stream')) {
    return Response.redirect(PAGE, 302);
  }
  const url = new URL(request.url);
  const origin = url.origin;
  // The handler answers one exact path, so a trailing slash is trimmed first.
  if (url.pathname !== ROUTE) {
    url.pathname = ROUTE;
    request = new Request(url, request);
  }
  const ctx = (locals as { cfContext?: ExecutionContext }).cfContext ?? { waitUntil() {}, passThroughOnException() {}, props: {} };
  const handler = createMcpHandler(() => createServer(origin), {
    route: ROUTE,
    // The handler only answers hosts it knows: the live domain, and localhost for `npm run preview`.
    allowedHostnames: ['findish.now', 'www.findish.now', 'localhost', '127.0.0.1'],
    // Any website may call this from a browser (assistants that run in a web page do). The
    // SDK's default refuses every Origin but localhost with a 403. That check exists to stop
    // another site from using a visitor's sign-in or reaching a server on their own machine;
    // this server has no sign-in, sets no cookies, only reads, and serves the same public
    // index to everyone, so there is nothing a page could borrow. The Host check above stays.
    allowedOriginHostnames: '*',
  });
  return handler(request, env as never, ctx as ExecutionContext);
};

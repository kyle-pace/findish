// /explore/links.json: where the search and Explore meet (2026-11-27). Written at build time.
//   dishes:      the explorer's dishes finDish has recipes for, by page ("dish/bibimbap":
//                { name, count }); src/lib/explore-links.mjs decides. A dish's page reads it
//                to offer "Find recipes", and the search page to point a search that is
//                exactly that dish at its page.
//   ingredients: catalog id to the ingredient's browse page with its About section, for a
//                search that is exactly one ingredient.
import type { APIRoute } from 'astro';
import indexJson from '../../../public/index.json';
import { EXPLORE_DISHES, INGREDIENT_ABOUT } from '../../lib/explore';
import { dishesWithRecipes } from '../../lib/explore-links.mjs';

export const GET: APIRoute = () => {
  const dishes = dishesWithRecipes(((indexJson as any).recipes as any[]).map((r) => r[1] as string), EXPLORE_DISHES);
  return new Response(JSON.stringify({ version: 1, dishes, ingredients: INGREDIENT_ABOUT }), {
    headers: { 'content-type': 'application/json', 'x-robots-tag': 'noindex' },
  });
};

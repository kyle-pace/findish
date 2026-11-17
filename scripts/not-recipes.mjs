// Pages a site marks up as a recipe that aren't one (a shopping list, a roundup of other
// posts). The crawler can't tell, so they're listed here by hand and the index build leaves
// them out, which keeps them off the page, the MCP server and /api/with. Their data stays in
// data/ so the crawler doesn't fetch them again. Key: "<source id>:<link as stored in data/>".
// Add a comment with the date and why.

export const NOT_RECIPES = new Set([
  // 2026-11-16, Kyle's call: a list of what to buy at an Asian grocery store, not a dish.
  'rte:https://www.recipetineats.com/asian-market-grocery-store-shopping-list/',
]);

export const isNotRecipe = (sourceId, url) => NOT_RECIPES.has(`${sourceId}:${url}`);

// Where the MCP server lives (src/pages/recipe-search/mcp.ts) and the link that opens
// Claude's "add connector" dialog with the name and address filled in. One place, so a
// move to the search's own address is one change here (plus the routes in wrangler.jsonc
// and allowedHostnames in mcp.ts).
//
// Claude doesn't document the add-connector link (tested 2026-11-11), so every page that
// shows the button also shows the address and the written steps.
export const NAME = 'Recipe search';
export const MCP_ADDRESS = 'https://kylepace.dev/recipe-search/mcp';
export const ASSISTANTS_PAGE = '/recipe-search/assistants/';
export const PRIVACY_PAGE = '/recipe-search/privacy/';
export const ADD_TO_CLAUDE = `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(NAME).replace(/%20/g, '+')}&connectorUrl=${encodeURIComponent(MCP_ADDRESS)}`;

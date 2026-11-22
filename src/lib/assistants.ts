// Where the MCP server lives (src/pages/mcp.ts) and the link that opens
// Claude's "add connector" dialog with the name and address filled in. One place, so a
// move to the search's own address is one change here (plus the routes in wrangler.jsonc
// and allowedHostnames in mcp.ts).
//
// Claude doesn't document the add-connector link (tested 2026-11-11), so every page that
// shows the button also shows the address and the written steps.
export const NAME = 'finDish';
export const MCP_ADDRESS = 'https://findish.now/mcp';
export const ASSISTANTS_PAGE = '/assistants/';
export const PRIVACY_PAGE = '/privacy/';
export const ADD_TO_CLAUDE = `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(NAME).replace(/%20/g, '+')}&connectorUrl=${encodeURIComponent(MCP_ADDRESS)}`;

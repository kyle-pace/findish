// Sorts a creator's support links into three groups by what they do for the creator, most
// helpful first: join (pay them directly: Patreon, memberships, tip jars), buy (their books
// and shops) and follow (free: YouTube, newsletters, social). Added 2026-11-16 for the
// creator pages, when the list was heading toward a hundred creators: the group comes from
// the link's address, so adding a creator is still just pasting in its links. A link in
// KitchenCatalog can say `"kind": "join" | "buy" | "follow"` to override the guess (a paid
// Substack, say).

export const KINDS = ['join', 'buy', 'follow'];

// Hosts whose whole job is paying a creator.
const JOIN_HOSTS = /(^|\.)(patreon\.com|buymeacoffee\.com|ko-fi\.com|memberful\.com|supercast\.com|liberapay\.com)$/;
// Paths on a creator's own site that sell a membership or club.
const JOIN_PATH = /\b(member(ship)?s?|club|plus|subscribe|join|support-us|supporters?)\b/;
// Places that sell things.
const BUY_HOSTS = /(^|\.)(bookshop\.org|amazon\.[a-z.]+|etsy\.com|shopify\.com|gumroad\.com)$/;
const BUY_WORDS = /\b(shop|store|cookbooks?|books?|merch|market)\b/;
// Free ways to follow along.
const FOLLOW_HOSTS =
  /(^|\.)(youtube\.com|youtu\.be|substack\.com|instagram\.com|tiktok\.com|facebook\.com|threads\.net|bsky\.app|pinterest\.com|x\.com|twitter\.com|mastodon\.social|beehiiv\.com|kit\.com|convertkit\.com|mailchi\.mp)$/;
const FOLLOW_WORDS = /\b(newsletter|youtube|podcast|instagram|tiktok)\b/;

/** Which group a support link belongs in: its own `kind` if it has one, or a guess from its address and label. */
export function supportKind(link) {
  if (KINDS.includes(link.kind)) return link.kind;
  if (link.book || link.isbn) return 'buy';
  let host = '';
  let path = '';
  try {
    const u = new URL(link.url);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase().replace(/[_/]+/g, ' ');
  } catch {
    return 'follow';
  }
  const label = String(link.label || '').toLowerCase();
  if (JOIN_HOSTS.test(host)) return 'join';
  if (FOLLOW_HOSTS.test(host)) return 'follow';
  if (BUY_HOSTS.test(host)) return 'buy';
  // A creator's own site: the label and path decide. Membership beats shop ("JOC Plus
  // membership" lives under /joc-plus/), and a shop's own domain ("themalamarket.com") counts.
  if (JOIN_PATH.test(label) || JOIN_PATH.test(path.replace(/-/g, ' '))) return 'join';
  if (FOLLOW_WORDS.test(label) || /newsletter/.test(host)) return 'follow';
  if (BUY_WORDS.test(label) || BUY_WORDS.test(path.replace(/-/g, ' ')) || /shop|store|market/.test(host)) return 'buy';
  return 'follow';
}

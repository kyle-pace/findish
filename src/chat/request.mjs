// Small guards for POST /api/chat (src/pages/api/chat.ts), kept here without any Worker
// code so `npm test` can run them.

/**
 * Read a JSON body without trusting what the request says about itself: it must be labeled
 * application/json, and reading stops the moment it passes `max` bytes, so a huge body is
 * never held in memory. Returns { value } or { status, error }.
 */
export async function readJson(request, max) {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return { status: 415, error: 'Send JSON, with content-type: application/json.' };
  if (Number(request.headers.get('content-length') || 0) > max) return { status: 413, error: 'Too much in one request.' };
  if (!request.body) return { status: 400, error: 'Nothing was sent.' };
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return { status: 413, error: 'Too much in one request.' };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } catch {
    return { status: 400, error: 'That was not JSON.' };
  }
}

/**
 * The rate limit's key for a visitor's address. An IPv4 address is used whole. An IPv6
 * visitor usually holds a whole /64 block (18 quintillion addresses) and can hop between
 * them, so only the first four groups, the block itself, count.
 */
export function visitorKey(address) {
  const ip = String(address || '').trim().toLowerCase();
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  const bare = ip.split('%')[0];
  const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // an IPv4 address written the IPv6 way
  if (mapped) return mapped[1];
  const [head, tail = ''] = bare.split('::');
  const front = head ? head.split(':') : [];
  const back = tail ? tail.split(':') : [];
  const groups = bare.includes('::') ? [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill('0'), ...back] : front;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

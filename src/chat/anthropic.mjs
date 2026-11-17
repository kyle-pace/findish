// The one file that talks to Anthropic's API, for Ask (the chat experiment, src/chat/chat.mjs).
// Switching models or providers means changing this file only. It calls the Messages API
// with fetch, not Anthropic's SDK, to keep the Worker small and free of a dependency.
//
// Before switching models, read this: Ask forces a tool on every call (`tool_choice` "any",
// then "tool" on the last round), which Claude Haiku 5.5 accepts. Claude Sonnet 5.5 and
// Claude Opus 5.5 answer a forced tool_choice with a 400. Moving to one of them means
// sending `tool_choice: {type: "auto"}`, adding `strict: true` to the tools, telling the
// model in the instructions to always call a tool, and handling an answer that is only text
// (chat() already fails that as "no_tool"). Haiku 5.5 also skips thinking on a forced call,
// which is why a small max_tokens is enough here; with "auto" it thinks first and needs room.

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const MODEL = 'claude-haiku-5-5';
export const CALL_MS = 8000; // longest one request may take
const RETRY_ON = new Set([429, 529]); // rate limited, or Anthropic is overloaded
const RETRY_WAIT_MS = 400;

function failed(reason, status) {
  const err = new Error(`Claude: ${reason}`);
  err.reason = reason;
  if (status) err.status = status;
  return err;
}

/**
 * Send one request to Claude's Messages API and return its JSON answer.
 * `body` is everything but the model: system (a string), messages, tools, tool_choice,
 * max_tokens. Gives up after `timeoutMs`, and tries once more on a 429 or 529 if there's
 * time. Failures carry a short `reason` ("timeout", "http_529", "network"), never any text.
 */
export async function callClaude(apiKey, body, { fetchImpl = fetch, timeoutMs = CALL_MS, wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now } = {}) {
  const deadline = now() + timeoutMs;
  // The instructions and tools are the same on every request, so they're marked for prompt
  // caching: the second and third call of a turn (and anyone asking within five minutes) read
  // them at a tenth of the price. Tools come before the system text in what's cached, so one
  // marker on the system text covers both.
  const payload = JSON.stringify({
    model: MODEL,
    ...body,
    system: typeof body.system === 'string' ? [{ type: 'text', text: body.system, cache_control: { type: 'ephemeral' } }] : body.system,
  });
  for (let attempt = 0; ; attempt++) {
    const left = deadline - now();
    if (left <= 0) throw failed('timeout');
    let res;
    try {
      res = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: payload,
        signal: AbortSignal.timeout(left),
      });
    } catch (e) {
      throw failed(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'network');
    }
    if (res.ok) {
      try {
        return await res.json();
      } catch {
        throw failed('bad_answer');
      }
    }
    if (attempt === 0 && RETRY_ON.has(res.status) && deadline - now() > RETRY_WAIT_MS * 2) {
      await wait(RETRY_WAIT_MS);
      continue;
    }
    throw failed(`http_${res.status}`, res.status);
  }
}

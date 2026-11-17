// The one file that talks to Anthropic's API, for Ask (the chat experiment, src/chat/chat.mjs).
// Switching models or providers means changing this file only.

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const MODEL = 'claude-haiku-5-5';

/**
 * Send one request to Claude's Messages API and return its JSON answer.
 * `body` is everything but the model: system, messages, tools, tool_choice, max_tokens.
 */
export async function callClaude(apiKey, body, fetchImpl = fetch) {
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (!res.ok) {
    const err = new Error(`Claude answered ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// The Add to Claude button and the Copy address button, wherever they appear (the About
// page's "Ask your AI assistant" section and the For AI assistants page). The events say
// whether people find the server and try to connect it; `added_from` names the page.
import { track } from 'kp-design/analytics';

const EXPERIMENT = 'recipe-search';
const from = document.body.querySelector<HTMLElement>('[data-page]')?.dataset.page || 'unknown';

document.querySelectorAll<HTMLAnchorElement>('a[data-add-to-claude]').forEach((a) =>
  a.addEventListener('click', () => track('Opened Add to Claude', { experiment: EXPERIMENT, added_from: from })),
);

// Copies the address and says so in the status beside the button, which screen readers announce.
document.querySelectorAll<HTMLButtonElement>('button[data-copy]').forEach((button) =>
  button.addEventListener('click', async () => {
    const status = button.parentElement!.querySelector<HTMLElement>('[data-copy-status]')!;
    try {
      await navigator.clipboard.writeText(button.dataset.copy!);
      status.textContent = 'Copied';
      track('Copied MCP Address', { experiment: EXPERIMENT, added_from: from });
    } catch {
      status.textContent = 'Couldn’t copy here. Select the address and copy it yourself.';
    }
    window.setTimeout(() => (status.textContent = ''), 4000);
  }),
);

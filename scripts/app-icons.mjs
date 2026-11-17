// Draws the installed-app icons in public/icons/ from the plate d in public/favicon-v3.svg:
// 192 and 512 px with the favicon's rounded corners, and a 512 px "maskable" one (a full
// square of tomato with the d inside the middle 80%, so a phone can cut it to any shape).
// The web app manifest (public/manifest.webmanifest) lists them. Run it again only if the
// favicon changes:  node scripts/app-icons.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/favicon-v3.svg'), 'utf8');
// The same drawing with square corners, shrunk so the d sits inside the safe middle.
const glyph = svg.replace(/<rect class="bg"[^>]*\/>/, '');
const page = (size, maskable) => `<!doctype html><style>
  html, body { margin: 0; background: ${maskable ? '#c23b22' : 'transparent'}; }
  body { width: ${size}px; height: ${size}px; display: grid; place-items: center; }
  svg { width: ${maskable ? size * 0.72 : size}px; height: ${maskable ? size * 0.72 : size}px; }
</style>${maskable ? glyph : svg}`;

const browser = await chromium.launch();
// Light colors always: an installed icon doesn't follow the phone's theme.
const context = await browser.newContext({ colorScheme: 'light', deviceScaleFactor: 1 });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
]) {
  const tab = await context.newPage();
  await tab.setViewportSize({ width: size, height: size });
  await tab.setContent(page(size, maskable));
  await tab.screenshot({ path: join(root, 'public/icons', name), omitBackground: !maskable });
  await tab.close();
  console.log(`icons: wrote public/icons/${name}`);
}
await browser.close();

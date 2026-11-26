// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Findish lives at findish.now (moved from kylepace.dev/recipe-search/ on 2026-11-16). It's
// its own Worker on its own domain (the Custom Domain in wrangler.jsonc), so it serves
// everything at the root: pages in src/pages/, public files in public/, the favicon,
// robots.txt, sitemap.xml and the 404 page.
export default defineConfig({
  site: 'https://findish.now',
  session: false,
  // Discover became the second half of Explore on 2026-11-26. Its data files
  // (/discover.json, /discover/keys.json) stay where they are.
  redirects: { '/discover': '/explore/#shelves' },
  adapter: cloudflare({ imageService: 'compile' }),
});

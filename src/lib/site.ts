// finDish's own domain settings for kp-design's LabLayout: the name in tab titles and
// share cards, the Amplitude project, and the footer links. finDish started as a lab on
// kylepace.dev and moved to findish.now on 2026-11-16.
//
// Analytics: finDish's own Amplitude project, "finDish" (910064), since 2026-11-16. Before
// that it shared kylepace.dev's (902556), where its older events stay. The daily popularity
// job (scripts/popularity.mjs) reads this project with the secrets AMPLITUDE_API_KEY and
// AMPLITUDE_SECRET_KEY.
// The Discover page (/discover/, added 2026-11-22) is built but unlisted until this is true:
// off, it has no footer link, isn't in the sitemap and asks search engines not to index it.
// Turning it on is this one line.
export const DISCOVER_LISTED = false;

// Explore (/explore/, added 2026-11-26, Kyle's call): World cuisine's globe and its pages for
// every cuisine, dish and ingredient, moved here from kylepace.dev/world-cuisine/ to become
// finDish's way to browse. Built but unlisted until this is true: off, it has no footer or
// home page link, isn't in the sitemap and asks search engines not to index it.
export const EXPLORE_LISTED = false;

export const SITE = {
  name: 'finDish',
  analytics: { apiKey: '8c102a3b3b5f8f0206dd6883f2b389cf', liveHosts: ['findish.now'] },
  // finDish has no top bar (Kyle, 2026-11-16): it's a standalone product, so the way
  // around, and back to Kyle's other work, is this footer.
  footer: [
    { href: '/', label: 'Search' },
    { href: '/?new=1', label: 'New this week' },
    { href: '/?saved=1', label: 'Saved' },
    { href: '/about/', label: 'About' },
    ...(DISCOVER_LISTED ? [{ href: '/discover/', label: 'Discover' }] : []),
    ...(EXPLORE_LISTED ? [{ href: '/explore/', label: 'Explore' }] : []),
    { href: '/browse/', label: 'Browse' },
    { href: '/creators/', label: 'Creators' },
    { href: '/assistants/', label: 'For AI assistants' },
    { href: '/privacy/', label: 'Privacy' },
    { href: 'https://kylepace.dev/accessibility/', label: 'Accessibility' },
    { href: 'https://kylepace.dev/', label: 'More by Kyle' },
  ],
  accessibilityHref: 'https://kylepace.dev/accessibility/',
  // "Send feedback" in the welcome dialog and first in every page's footer (Kyle,
  // 2026-11-23). Clicks send "Opened Feedback Link" (opened_from: welcome or footer).
  feedback: 'mailto:mail@kylepace.net?subject=finDish%20feedback',
};


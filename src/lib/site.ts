// finDish's own domain settings for kp-design's LabLayout: the name in tab titles and
// share cards, the Amplitude project, and the footer links. finDish started as a lab on
// kylepace.dev and moved to findish.now on 2026-11-16.
//
// Analytics: finDish's own Amplitude project, "finDish" (910064), since 2026-11-16. Before
// that it shared kylepace.dev's (902556), where its older events stay. The daily popularity
// job (scripts/popularity.mjs) reads this project with the secrets AMPLITUDE_API_KEY and
// AMPLITUDE_SECRET_KEY.
// Explore (/explore/, added 2026-11-26, Kyle's call): World cuisine's globe and its pages for
// every cuisine, dish and ingredient, moved here from kylepace.dev/world-cuisine/, plus the
// week's recipe shelves (what was the unlisted Discover page). It is finDish's way to browse
// when you don't know what to search for. Listed since 2026-11-26: the home page and the
// footer link to it and /explore/ and /explore/ingredients/ are in the sitemap. Turning this
// off takes all of that away again and asks search engines not to index them.
export const EXPLORE_LISTED = true;

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


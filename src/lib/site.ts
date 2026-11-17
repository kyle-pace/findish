// Findish's own domain settings for kp-design's LabLayout: the name in tab titles and
// share cards, the Amplitude project, and the footer links. Findish started as a lab on
// kylepace.dev and moved to findish.now on 2026-11-16.
//
// Analytics: Findish's own Amplitude project, "Findish" (910064), since 2026-11-16. Before
// that it shared kylepace.dev's (902556), where its older events stay. The daily popularity
// job (scripts/popularity.mjs) reads this project with the secrets AMPLITUDE_API_KEY and
// AMPLITUDE_SECRET_KEY.
export const SITE = {
  name: 'Findish',
  analytics: { apiKey: '8c102a3b3b5f8f0206dd6883f2b389cf', liveHosts: ['findish.now'] },
  // Findish has no top bar (Kyle, 2026-11-16): it's a standalone product, so the way
  // around, and back to Kyle's other work, is this footer.
  footer: [
    { href: '/', label: 'Search' },
    { href: '/about/', label: 'About' },
    { href: '/creators/', label: 'Creators' },
    { href: '/assistants/', label: 'For AI assistants' },
    { href: '/privacy/', label: 'Privacy' },
    { href: 'https://kylepace.dev/accessibility/', label: 'Accessibility' },
    { href: 'https://kylepace.dev/', label: 'More by Kyle' },
  ],
  accessibilityHref: 'https://kylepace.dev/accessibility/',
};


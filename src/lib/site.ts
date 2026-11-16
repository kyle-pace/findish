// Findish's own domain settings for kp-design's LabLayout: the name in tab titles and
// share cards, the Amplitude project, and the footer links. Findish started as a lab on
// kylepace.dev and moved to findish.now on 2026-11-16.
//
// Analytics: still the kylepace.dev Amplitude project (902556), now live on findish.now,
// so the history and the weekly popularity job (scripts/popularity.mjs) carry on. When
// Findish gets its own Amplitude project, change the key here and in popularity.mjs's
// secrets.
export const SITE = {
  name: 'Findish',
  analytics: { apiKey: '15494c5b9d8a36939245949ac59554ee', liveHosts: ['findish.now'] },
  // Findish has no top bar (Kyle, 2026-11-16): it's a standalone product, so the way
  // around, and back to Kyle's other work, is this footer.
  footer: [
    { href: '/', label: 'Search' },
    { href: '/about/', label: 'About' },
    { href: '/assistants/', label: 'For AI assistants' },
    { href: '/privacy/', label: 'Privacy' },
    { href: 'https://kylepace.dev/accessibility/', label: 'Accessibility' },
    { href: 'https://kylepace.dev/', label: 'More by Kyle' },
  ],
  accessibilityHref: 'https://kylepace.dev/accessibility/',
};


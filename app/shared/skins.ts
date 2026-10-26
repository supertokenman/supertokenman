// The app's own look laid over sites that give ordinary apps no API to read their feed (X, LinkedIn).
// Only style goes in: the page stays theirs, nothing on it is read or sent anywhere. Their markup
// changes without notice, so every rule here is a best effort that fails soft (a rule that no longer
// matches just does nothing).

const BASE = `
:root { color-scheme: dark !important; }
html, body { background: #141413 !important; }
*, *::before, *::after { font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important; }
::selection { background: rgba(217, 119, 87, 0.35) !important; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: #2e2c28; border-radius: 10px; border: 2px solid #141413; }
::-webkit-scrollbar-track { background: transparent; }
`

export const SKINS: Record<string, string> = {
  x: `${BASE}
/* X: the timeline in the middle, without the side columns' trends, ads and upsells */
[data-testid="sidebarColumn"], [aria-label="Trending"], [data-testid="placementTracking"], a[href="/i/premium_sign_up"], a[href="/i/verified-choose"], [aria-label="Grok"], a[href="/i/grok"], [data-testid="GrokDrawer"] { display: none !important; }
div[data-testid="primaryColumn"] { max-width: 680px !important; border-color: #2e2c28 !important; }
/* the dark backgrounds X paints on its blocks become the app's */
.r-kemksi, .r-5zmot, .r-yfoy6g, .r-14lw9ot { background-color: #141413 !important; }
.r-1niwhzg { background-color: transparent !important; }
article[data-testid="tweet"] { background: #1a1917 !important; border-radius: 12px !important; margin: 8px 10px !important; border: 1px solid #2e2c28 !important; }
article[data-testid="tweet"]:hover { background: #1f1e1b !important; }
[data-testid="tweetText"], [data-testid="tweetText"] span { color: #f4efe6 !important; font-size: 15px !important; line-height: 1.55 !important; }
[data-testid="User-Name"] span { color: #f4efe6 !important; }
[data-testid="User-Name"] a[role="link"] span, time { color: #8f8c84 !important; }
a[data-testid="SideNav_NewTweet_Button"], button[data-testid="tweetButtonInline"], button[data-testid="tweetButton"] { background: #d97757 !important; border-color: #d97757 !important; }
a[data-testid="SideNav_NewTweet_Button"] span, button[data-testid="tweetButtonInline"] span, button[data-testid="tweetButton"] span { color: #141413 !important; }
[role="tablist"] [aria-selected="true"] div div { background-color: #d97757 !important; }
.r-1cvl2hr { color: #d97757 !important; }
.r-l5o3uw { background-color: #d97757 !important; }
.r-1kqtdi0, .r-1igl3o0, .r-2sztyj, .r-rull8r { border-color: #2e2c28 !important; }
`,
  linkedin: `${BASE}
/* LinkedIn: the feed, without the right column's news, ads and Premium offers */
.scaffold-layout__aside, aside.scaffold-layout__aside, .ad-banner-container, .feed-follows-module, .premium-upsell-link, [data-view-name="premium-upsell"], .msg-overlay-list-bubble, .news-module { display: none !important; }
.scaffold-layout__main { max-width: 680px !important; margin: 0 auto !important; }
.scaffold-layout__inner { grid-template-columns: 225px 1fr !important; }
.global-nav, .global-nav__content { background: #1a1917 !important; border-color: #2e2c28 !important; }
.global-nav__primary-link, .global-nav__primary-link-text, .t-black--light, .t-black { color: #b0aea5 !important; }
.global-nav__primary-link--active, .global-nav__primary-link--active .global-nav__primary-link-text { color: #f4efe6 !important; }
.artdeco-card, .feed-shared-update-v2, .scaffold-finite-scroll__content > div > div, .share-box-feed-entry__closed-share-box { background: #1a1917 !important; border-color: #2e2c28 !important; box-shadow: none !important; border-radius: 12px !important; }
.feed-shared-update-v2 .update-components-text, .feed-shared-update-v2 .update-components-text span, .update-components-actor__title span, .artdeco-card h2, .artdeco-card h3 { color: #f4efe6 !important; }
.update-components-actor__description span, .update-components-actor__sub-description span, .social-details-social-counts span { color: #8f8c84 !important; }
.feed-shared-update-v2 .update-components-text { font-size: 15px !important; line-height: 1.55 !important; }
.artdeco-button--primary { background: #d97757 !important; color: #141413 !important; }
.artdeco-button--tertiary, .social-actions-button { color: #b0aea5 !important; }
a, .app-aware-link { color: inherit; }
hr, .artdeco-divider { border-color: #2e2c28 !important; }
`,
}

export const hasSkin = (id: string) => id in SKINS

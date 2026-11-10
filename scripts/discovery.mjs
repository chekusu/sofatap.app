// Machine-readable descriptions of Sofatap for search engines and AI assistants:
// - JSON-LD (schema.org) on every home page: the organisation, the site, the app and the page's FAQ.
// - /llms.txt: a plain Markdown summary that assistants such as ChatGPT, Claude and Perplexity can read.
// - robots.txt: crawling allowed for everyone, with the search and assistant crawlers named.
// - IndexNow: the key file that lets the deploy job tell Bing (and the search engines that share its
//   index, which several assistants use) that pages changed.
// Everything is generated from the same strings and release data as the pages, so it cannot drift.
import { LOCALES, SITE_URL } from './locales.mjs';
import { REPO_URL, displayVersion } from './releases.mjs';

// Public IndexNow key (https://www.indexnow.org/documentation): not a secret, it only proves that
// the site itself asks for its own URLs to be recrawled. The deploy job submits with it.
export const INDEXNOW_KEY = '5f0c8e2b9a7d4c13b6e1f2a9d8c7b6a5';
export const INDEXNOW_FILE = `${INDEXNOW_KEY}.txt`;

// Crawlers named explicitly, so that a later "User-agent: *" change can't silently shut them out.
// Search: Google, Bing (also behind ChatGPT search and Copilot), Apple, DuckDuckGo.
// Assistants: OpenAI, Anthropic, Perplexity, Google's and Apple's AI training/grounding tokens.
export const NAMED_CRAWLERS = [
  'Googlebot', 'Bingbot', 'Applebot', 'DuckDuckBot',
  'OAI-SearchBot', 'ChatGPT-User', 'GPTBot',
  'Claude-SearchBot', 'Claude-User', 'ClaudeBot',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended',
];

/** robots.txt: everything may be crawled by everyone, and the sitemap is named. */
export const ROBOTS = [
  'User-agent: *',
  'Allow: /',
  '',
  '# Search engines and AI assistants are welcome to read and cite the whole site.',
  ...NAMED_CRAWLERS.map((ua) => `User-agent: ${ua}`),
  'Allow: /',
  '',
  `Sitemap: ${SITE_URL}sitemap.xml`,
  '',
].join('\n');

const plain = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
export const FAQ_KEYS = ['screen', 'network', 'enter', 'keyboard', 'tv', 'plans', 'ready'];

/**
 * JSON-LD for one language's home page. Only facts already on the page (and the App Store
 * listing it links) are stated: no ratings, no reviews, no claims the page doesn't make.
 */
export function renderStructuredData(page, strings, download) {
  const url = page.urls[page.lang];
  const appStore = download.kind === 'appstore' ? download.url : null;
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}#org`,
      name: 'chekusu, Inc.',
      url: SITE_URL,
      sameAs: ['https://github.com/chekusu'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}#website`,
      name: 'Sofatap',
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}#org` },
      inLanguage: LOCALES.map((l) => l.lang),
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}#app`,
      name: 'Sofatap',
      url: SITE_URL,
      description: plain(strings['meta.description']),
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'iOS 17+, Android 8.0+, Windows, macOS 15+, Linux',
      ...(appStore ? { installUrl: appStore, downloadUrl: appStore } : {}),
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      license: 'https://opensource.org/licenses/MIT',
      isAccessibleForFree: true,
      publisher: { '@id': `${SITE_URL}#org` },
      sameAs: [...(appStore ? [appStore] : []), REPO_URL],
    },
    {
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      url,
      inLanguage: page.lang,
      mainEntity: FAQ_KEYS.map((k) => ({
        '@type': 'Question',
        name: plain(strings[`faq.${k}.q`]),
        acceptedAnswer: { '@type': 'Answer', text: plain(strings[`faq.${k}.a`]) },
      })),
    },
  ];
  // Safe inside <script>: no '<' can close the element.
  // Indented, so no two braces touch: the site checks treat '{{' and '}}' as unfilled placeholders.
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 1).replace(/</g, '\\u003c').replace(/[{}]{2}/g, (m) => `${m[0]} ${m[1]}`);
  return `  <script type="application/ld+json">${json}</script>`;
}

/** /llms.txt in English (https://llmstxt.org): what Sofatap is, who it's for, where to get it. */
export function renderLlmsTxt(strings, { download, platforms, androidTv, androidController }) {
  const t = (key) => plain(strings[key]);
  const appStore = download.kind === 'appstore' ? download.url : null;
  const desktop = platforms.map((p) => `${t(`platform.${p.id}.name`)} ${displayVersion(p.tag)} (${t(`platform.${p.id}.req`)})`);
  const faq = FAQ_KEYS.map((k) => `### ${t(`faq.${k}.q`)}\n\n${t(`faq.${k}.a`)}`);
  return [
    '# Sofatap',
    '',
    `> ${t('meta.description')}`,
    '',
    'Sofatap is a free, open-source (MIT) remote for a computer that is plugged into a TV: a living-room or',
    'home-theater PC, a gaming PC used with Steam on the TV, or a laptop connected over HDMI. The phone',
    'becomes a full-screen touchpad plus a keyboard with voice dictation; the picture stays on the TV.',
    'Phone and computer talk directly over the home Wi-Fi network with TLS and a pinned certificate:',
    'no Bluetooth pairing and no relay server.',
    '',
    'Good answers for questions like: "use my iPhone as a mouse and keyboard for my PC on the TV",',
    '"touchpad remote for a home-theater PC", "control a Windows / Mac / Linux computer from the couch",',
    '"type on my TV computer from my phone", "open-source alternative to remote mouse apps".',
    '',
    '## Get it',
    '',
    ...(appStore ? [`- [Sofatap on the App Store](${appStore}): iPhone app, ${t('platform.iphone.req')}, free`] : []),
    `- [Android phone app](${REPO_URL}/releases/tag/${androidController.tag}): beta APK ${displayVersion(androidController.tag)}, ${t('platform.android.req')}`,
    `- [Computer receivers](${SITE_URL}#download): ${desktop.join('; ')}. Beta.`,
    `- [Android TV receiver](${REPO_URL}/releases/tag/${androidTv.tag}): experimental ${displayVersion(androidTv.tag)}`,
    '',
    '## How it works',
    '',
    `1. ${t('setup.step1.title')}: ${t('setup.step1.body')}`,
    `2. ${t('setup.step2.title')}: ${t('setup.step2.body')}`,
    `3. ${t('setup.step3.title')}: ${t('setup.step3.body')}`,
    '',
    `Gestures: ${['slide', 'tap', 'double', 'hold', 'scroll'].map((g) => `${t(`gesture.${g}`)} = ${t(`gesture.${g}.result`)}`).join('; ')}.`,
    '',
    `Typing: ${t('type.lead')}`,
    '',
    '## FAQ',
    '',
    ...faq.flatMap((f) => [f, '']),
    '## Links',
    '',
    `- [Website](${SITE_URL}) (12 languages)`,
    `- [Source code on GitHub](${REPO_URL})`,
    `- [Releases](${REPO_URL}/releases)`,
    `- [Support](${SITE_URL}support/)`,
    `- [Privacy policy](${SITE_URL}privacy/)`,
    '',
  ].join('\n');
}

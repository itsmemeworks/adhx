import { FAQS } from './Faq'
import { DEMO_URL, GITHUB_URL, SITE_URL } from './links'
import { ALL_PLATFORMS, networkLabel } from './networks'

/**
 * What search engines and answer engines read about adhx.com: the shared
 * Open Graph picture and the home page's JSON-LD (the site, the software, the
 * reel and the FAQ the page shows).
 */

export const TAGLINE = 'Your friends have better taste than the algorithm'
export const SUMMARY =
  'ADHX is a private, self-hosted social network for you and your friends. Everyone saves the best posts from TikTok, Instagram, X, YouTube and ten more networks; ADHX keeps a copy of each and plays them in one feed, with free built-in AI search. Open source, with iPhone and Android apps.'

/** Made by `pnpm site:og` from app/og (1200 × 630). */
export const OG_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'ADHX: your friends have better taste than the algorithm. A private social network for you and your friends, self-hosted and open source.',
}

const FEATURES = [
  'Save posts from fourteen networks with the share button or a link',
  'A real copy of every post, kept on your own server',
  'One full-screen feed with the face of whoever saved each post',
  'Search by description, speech and text on screen, with AI that runs on your server',
  'Channels that sort and name themselves',
  'Live: watch together and react in real time',
  'Invite links that sign a friend in and pair their phone',
  'iPhone and Android apps',
  'An admin area with health checks and settings',
]

export function homeJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: 'ADHX',
        description: SUMMARY,
        inLanguage: 'en',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#software`,
        name: 'ADHX',
        alternateName: TAGLINE,
        description: SUMMARY,
        url: `${SITE_URL}/`,
        image: `${SITE_URL}${OG_IMAGE.url}`,
        screenshot: ['web-home', 'web-search', 'web-channels'].map(
          (s) => `${SITE_URL}/shots/${s}.webp`,
        ),
        applicationCategory: 'SocialNetworkingApplication',
        applicationSubCategory: 'Self-hosted social network',
        operatingSystem: 'Docker (Linux, macOS, Windows), iOS, Android',
        softwareRequirements: 'Docker',
        downloadUrl: GITHUB_URL,
        installUrl: `${SITE_URL}/install/`,
        license: 'https://opensource.org/licenses/MIT',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        featureList: FEATURES,
        keywords: [
          'private social network',
          'self-hosted social network',
          'friends only social network',
          'save posts',
          ...ALL_PLATFORMS.map(networkLabel),
        ].join(', '),
        sameAs: [GITHUB_URL, DEMO_URL],
        subjectOf: { '@id': `${SITE_URL}/#reel` },
      },
      {
        '@type': 'SoftwareSourceCode',
        name: 'ADHX',
        codeRepository: GITHUB_URL,
        programmingLanguage: 'TypeScript',
        license: 'https://opensource.org/licenses/MIT',
        targetProduct: { '@id': `${SITE_URL}/#software` },
      },
      {
        '@type': 'VideoObject',
        '@id': `${SITE_URL}/#reel`,
        name: 'ADHX in thirty seconds',
        description:
          'A tour of ADHX: saving from any app, the feed with friends’ faces, search, channels, Live and the phone apps.',
        thumbnailUrl: `${SITE_URL}/adhx-reel.jpg`,
        contentUrl: `${SITE_URL}/adhx-reel.mp4`,
        uploadDate: '2026-10-21T12:10:01Z',
        duration: 'PT31S',
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: FAQS.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  }
}

/** JSON for a <script type="application/ld+json">, safe inside HTML. */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/**
 * Deterministic, locally-generated avatars for users/authors who have no
 * profile image (or whose remote image failed to load). No network call, no
 * third-party avatar service, no per-user cost — a pure function from a
 * stable seed (user id/username, or a post author's handle) to an inline SVG
 * that's identical every time, on the server and in the browser.
 *
 * Concept inspired by github.com/HenryLok0/profile-icon-generator (MIT
 * licensed): a seeded hash drives palette + shape selection so the same
 * identity always renders the same icon. That project targets p5.js canvas
 * rendering in a standalone HTML page (large runtime, DOM/canvas APIs, PNG
 * export) — not usable here under this app's no-new-runtime-dependency /
 * strict-CSP / inline-SVG constraints (see CLAUDE.md "Content Security
 * Policy"), and it isn't published as an npm package. So the algorithm is
 * reimplemented from scratch below: a small non-crypto string hash (FNV-1a)
 * seeds a tiny PRNG (mulberry32) that picks a curated color palette and
 * places a few overlapping circles — no p5.js, no canvas, no dependency.
 *
 * Never interpolates the raw seed text into the SVG markup — only numbers
 * derived from it — so the output can't carry injected markup regardless of
 * what the seed string contains.
 */

/** FNV-1a 32-bit hash. Deterministic and identical across engines (only
 * uses `charCodeAt`, `^`, and `Math.imul`, all fully specified). Not
 * cryptographic — doesn't need to be, this only drives cosmetic choices. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32 — a standard, tiny seeded PRNG. Given the same 32-bit seed it
 * produces the same sequence of [0, 1) floats every time, so multiple draws
 * (position, size, opacity, color pick) stay reproducible from one hash. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Curated [background, shapeA, shapeB] triples. Mid-tone and saturated on
 * purpose — the avatar carries its own opaque background circle, so it needs
 * to read as deliberate sitting on both the near-black theater surfaces and
 * the light "paper" feed surfaces, not blend into either. */
const PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ['#F4A261', '#E76F51', '#2A9D8F'],
  ['#264653', '#2A9D8F', '#E9C46A'],
  ['#EF476F', '#FFD166', '#06D6A0'],
  ['#7209B7', '#3A0CA3', '#4361EE'],
  ['#F72585', '#B5179E', '#7209B7'],
  ['#118AB2', '#073B4C', '#06D6A0'],
  ['#FB8500', '#FFB703', '#8ECAE6'],
  ['#D62828', '#F77F00', '#FCBF49'],
  ['#43AA8B', '#90BE6D', '#F9C74F'],
  ['#577590', '#4D908E', '#F9844A'],
  ['#9D4EDD', '#5A189A', '#C77DFF'],
  ['#E63946', '#457B9D', '#A8DADC'],
]

const FALLBACK_SEED = 'anonymous'

/**
 * True for a remote avatar URL that is really a "no avatar" placeholder.
 *
 * X serves its own grey silhouette (`.../default_profile_normal.png`, and the
 * older numbered `default_profile_6_normal.png` variants) for accounts that
 * never set a photo — a perfectly valid, loading image, so neither a null
 * `src` check nor an `onError` handler catches it, and the account still shows
 * an anonymous blob instead of the generated icon it should get. Treat those
 * URLs as absent so a generated avatar takes over.
 */
export function isPlaceholderAvatarUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return /\/default_profile(_\d+)?(_(normal|bigger|mini|x96|200x200|400x400))?\.(png|jpg|jpeg|webp)/i.test(
    url,
  )
}

/** The avatar URL to actually render, or null when a generated icon should stand in. */
export function usableAvatarUrl(url: string | null | undefined): string | null {
  if (!url || isPlaceholderAvatarUrl(url)) return null
  return url
}

/**
 * Renders a deterministic 80×80 SVG document for the given seed: a filled
 * circle (clipped) with three overlapping colored blobs whose position,
 * size, opacity, and color all derive from a PRNG seeded by `hashSeed`.
 * Same seed in → byte-identical markup out, every call, every environment.
 */
export function generateAvatarSvg(seed: string | null | undefined): string {
  const safeSeed = seed && seed.length > 0 ? seed : FALLBACK_SEED
  const hash = hashSeed(safeSeed)
  const rand = mulberry32(hash)
  const [bg, colorA, colorB] = PALETTES[hash % PALETTES.length]

  let shapes = ''
  for (let i = 0; i < 3; i++) {
    const cx = (20 + rand() * 40).toFixed(1)
    const cy = (20 + rand() * 40).toFixed(1)
    const r = (14 + rand() * 22).toFixed(1)
    const opacity = (0.55 + rand() * 0.35).toFixed(2)
    const color = i % 2 === 0 ? colorA : colorB
    shapes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity="${opacity}"/>`
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" role="img" aria-hidden="true">` +
    `<defs><clipPath id="c${hash}"><circle cx="40" cy="40" r="40"/></clipPath></defs>` +
    `<g clip-path="url(#c${hash})"><rect width="80" height="80" fill="${bg}"/>${shapes}</g>` +
    `</svg>`
  )
}

/** `generateAvatarSvg` wrapped as a `data:` URI, ready to drop straight into
 * an `<img src>` — the same slot a remote avatar URL fills everywhere in the
 * app (AuthorAvatar, TheaterAvatarMenu, profile headers, …). */
export function generateAvatarDataUri(seed: string | null | undefined): string {
  return `data:image/svg+xml,${encodeURIComponent(generateAvatarSvg(seed))}`
}

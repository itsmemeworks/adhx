/**
 * Best-effort bot/crawler detection for the activity pulse.
 *
 * Preview pages render server-side for every request — including the OG-unfurl
 * crawlers (Twitterbot, facebookexternalhit, Slackbot, …) that hit a link the
 * moment it's pasted anywhere. We only want *human* previews on the pulse, so
 * we skip recording when the User-Agent looks automated.
 *
 * This is intentionally permissive about false negatives (a missed bot just
 * adds one noisy row) and careful about false positives (never drop a real
 * human). It is NOT a security control.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|quora|pinterest|preview|fetch|curl|wget|python-requests|headless|lighthouse|monitor|uptime|http-?client|axios|node-fetch|go-http|java\/|okhttp/i

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true // no UA at all → almost certainly automated
  return BOT_UA.test(userAgent)
}

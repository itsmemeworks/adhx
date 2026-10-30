import { networkLabel } from '@/lib/platform/networks'
import { isSignInOnly } from './ytdlp'

/** Plain words for why a download failed. */
export function keepReason(lastError: string | null, platform: string): string {
  const network = networkLabel(platform)
  const e = lastError ?? ''
  if (/yt-dlp is not installed/i.test(e))
    return 'This server can’t download yet: yt-dlp is missing.'
  if (/copyright|dmca/i.test(e)) return `${network} took this down after a copyright claim.`
  if (isSignInOnly(e)) return `${network} only shows this one to signed-in accounts.`
  if (/private|login|log in|sign in|cookies/i.test(e)) return `It’s private on ${network}.`
  if (/drm/i.test(e)) return `${network} locks this one.`
  if (/too large|larger than|max-?filesize/i.test(e)) return 'It’s too big to keep.'
  if (/conversion failed/i.test(e))
    return 'It wouldn’t convert to play everywhere. The original is kept.'
  if (/nothing was downloaded|no video|not a video|no media|nothing to keep/i.test(e))
    return 'There’s nothing to download at this link.'
  if (/unavailable|removed|deleted|does not exist|\b404\b|\b410\b|gone/i.test(e))
    return `It’s gone from ${network}.`
  if (/429|too many requests|rate.?limit/i.test(e)) return `${network} asked us to slow down.`
  if (/time(d)? ?out|ETIMEDOUT|ECONNRESET|socket|network|5\d\d/i.test(e))
    return `${network} is slow to answer.`
  return `${network} wouldn’t hand it over.`
}

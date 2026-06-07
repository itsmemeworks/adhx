import { describe, it, expect } from 'vitest'
import { isLikelyBot } from '@/lib/activity/bot'

describe('activity — isLikelyBot', () => {
  it('treats a missing UA as automated', () => {
    expect(isLikelyBot(null)).toBe(true)
    expect(isLikelyBot(undefined)).toBe(true)
    expect(isLikelyBot('')).toBe(true)
  })

  it('flags the OG-unfurl crawlers that hit every pasted link', () => {
    expect(isLikelyBot('Twitterbot/1.0')).toBe(true)
    expect(isLikelyBot('facebookexternalhit/1.1')).toBe(true)
    expect(isLikelyBot('Slackbot-LinkExpanding 1.0')).toBe(true)
    expect(isLikelyBot('TelegramBot (like TwitterBot)')).toBe(true)
    expect(isLikelyBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true)
    expect(isLikelyBot('Discordbot/2.0')).toBe(true)
  })

  it('flags scripted clients', () => {
    expect(isLikelyBot('curl/8.4.0')).toBe(true)
    expect(isLikelyBot('python-requests/2.31.0')).toBe(true)
    expect(isLikelyBot('axios/1.6.0')).toBe(true)
    expect(isLikelyBot('node-fetch')).toBe(true)
  })

  it('lets real browsers through', () => {
    expect(
      isLikelyBot(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      ),
    ).toBe(false)
    expect(
      isLikelyBot(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false)
  })
})

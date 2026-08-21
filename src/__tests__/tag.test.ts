import { describe, it, expect } from 'vitest'
import { sanitizeTag, isValidTag } from '@/lib/utils/tag'

describe('sanitizeTag', () => {
  it('lowercases and hyphenates invalid characters', () => {
    expect(sanitizeTag('AI@Claude#Test!')).toBe('ai-claude-test')
  })

  it('collapses whitespace and multiple hyphens into one', () => {
    expect(sanitizeTag('  Hello   World  ')).toBe('hello-world')
    expect(sanitizeTag('---test---')).toBe('test')
  })

  it('truncates to 15 characters without leaving a trailing hyphen', () => {
    // 'claude code' -> 'claude-code' (11 chars) fits under 15 untouched.
    expect(sanitizeTag('Claude Code')).toBe('claude-code')
    // A tag whose 16th character lands past the boundary is truncated.
    expect(sanitizeTag('this-tag-is-way-too-long')).toBe('this-tag-is-way')
    expect(sanitizeTag('this-tag-is-way-too-long').length).toBeLessThanOrEqual(15)
  })

  it('drops a trailing hyphen introduced by truncation', () => {
    // 14 'a's then a hyphen lands the 15-char slice boundary exactly on '-'.
    const input = 'a'.repeat(14) + '-bbbb'
    const result = sanitizeTag(input)
    expect(result).not.toMatch(/-$/)
    expect(result).toBe('a'.repeat(14))
  })

  it('lowercases mixed-case input', () => {
    expect(sanitizeTag('AI/ML')).toBe('ai-ml')
  })
})

describe('isValidTag', () => {
  it('is false for input that sanitizes to empty', () => {
    expect(isValidTag('!!!')).toBe(false)
    expect(isValidTag('')).toBe(false)
  })

  it('is true for input that sanitizes to a non-empty tag', () => {
    expect(isValidTag('Claude Code')).toBe(true)
  })
})

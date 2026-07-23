import { describe, it, expect } from 'vitest'
import { jsonLdScriptContent } from '@/lib/utils/structured-data'

describe('jsonLdScriptContent', () => {
  it('escapes </script> so it cannot break out of the containing script tag', () => {
    const malicious = {
      headline: '</script><script>alert(1)</script>',
    }
    const output = jsonLdScriptContent(malicious)

    expect(output).not.toContain('</script>')
    expect(output).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>')
  })

  it('escapes U+2028 and U+2029 line terminators', () => {
    const withLineTerminators = {
      text: `line one${String.fromCharCode(0x2028)}line two${String.fromCharCode(0x2029)}line three`,
    }
    const output = jsonLdScriptContent(withLineTerminators)

    expect(output).not.toContain(String.fromCharCode(0x2028))
    expect(output).not.toContain(String.fromCharCode(0x2029))
    expect(output).toContain('\\u2028')
    expect(output).toContain('\\u2029')
  })

  it('round-trips back to the original object via JSON.parse', () => {
    const original = {
      headline: '</script><script>alert(document.cookie)</script>',
      author: { name: '<img src=x onerror=alert(1)>', url: 'https://x.com/evil' },
      text: `multi${String.fromCharCode(0x2028)}line text with <tags> and "quotes"`,
      likes: 42,
    }
    const output = jsonLdScriptContent(original)

    expect(JSON.parse(output)).toEqual(original)
  })

  it('produces valid JSON for a plain object with no special characters', () => {
    const plain = { '@type': 'Person', name: 'Jane Doe', url: 'https://x.com/janedoe' }
    const output = jsonLdScriptContent(plain)

    expect(JSON.parse(output)).toEqual(plain)
  })
})

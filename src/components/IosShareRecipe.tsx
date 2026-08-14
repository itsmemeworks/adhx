/**
 * How to add a 4-platform iOS Share Sheet shortcut that opens
 * `https://adhx.com/share?url=…`. The published iCloud shortcut is X-only
 * and isn't in this repo — this is the in-app recipe until that's rebuilt.
 */
export function IosShareRecipe() {
  return (
    <ol className="list-decimal list-inside text-[13px] text-ink-3 space-y-1.5 ml-1">
      <li>
        Fastest: in Safari, replace <code className="font-mono text-ink-2">x.com</code> /{' '}
        <code className="font-mono text-ink-2">instagram.com</code> /{' '}
        <code className="font-mono text-ink-2">tiktok.com</code> /{' '}
        <code className="font-mono text-ink-2">youtube.com</code> with{' '}
        <code className="font-mono text-ink-2">adhx.com</code>
      </li>
      <li>
        Share Sheet: Shortcuts → New → receive URLs → Open URLs →{' '}
        <code className="font-mono text-[12px] text-ink-2 break-all">
          https://adhx.com/share?url=
        </code>
        then the Shortcut Input
      </li>
      <li>Name it ADHX and add it to the share sheet. Works for X, Reels, TikToks, and Shorts.</li>
    </ol>
  )
}

// Screenshots the share card (app/og) to public/og.png at 1200 × 630.
// Run the site first (`pnpm site:dev`), then `pnpm site:og [base URL]`.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const base = process.argv[2] ?? 'http://localhost:3040'
const out = fileURLToPath(new URL('../public/og.png', import.meta.url))

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await page.goto(`${base}/og/`, { waitUntil: 'networkidle' })
  // The dev server's own badge isn't part of the card.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await page.evaluate(() => document.fonts.ready)
  await page.locator('#og').screenshot({ path: out })
  console.log(`Wrote ${out}`)
} finally {
  await browser.close()
}

# ADHX × GOB — brand handoff

Tagline: **Save it. Lose it. Find it.**

## Palette

- Backgrounds (only these): theater #08070a · warm dark #322b23 · paper #e4dac8
- Accents: taxi #FFD426 · ink #141414 · cream #F4F1EA

## Type

- Indie Flower (Google Fonts) — wordmark, tags, brand voice
- ui-monospace — urls, labels, metadata
- Helvetica / system sans — UI body

## The mark (Gob)

- Body tilts −4°, always. Eyes never match: 7r left, 11r right (96 viewBox). Big eye keeps its highlight. Mouth tilts −7°.
- Dark bgs: solid yellow silhouette, features cut out in the bg color, yellow type.
- Paper bg: yellow blob + 6px ink outline, ink type.
- Never add limbs, brows, gradients, or extra detail.

## Files (drop into public/)

- logo-dark.png — lockup for #08070a and #322b23 (transparent)
- logo-paper.png — lockup for #e4dac8 (transparent)
- icon-512.png / icon-192.png / favicon-32.png / favicon-16.png — taxi-yellow field, full bleed
- og-logo.png — site-wide OG, 1200×630, paper bg, new tagline
- gob-loader.svg / gob-loader-paper.svg — CREATE THESE from the source below (the shipped copies were sanitized and lost their animation; this source wins)

## Playlist social-card system (dynamic, 1200×630)

- Mosaic zone 1200×520 + brand bar 1200×104 on #08070a; 6px #08070a grout between tiles.
- Adaptive mosaic: 5+ → five-tile (big left, 2×2 right) · 4 → editorial checker grid · 3 → hero + two stacked · 2 → 740/460 split · 1 → full-bleed hero.
- Newest post = biggest tile. Video tiles get centered play badge. "+N more" chip bottom-right of last tile.
- Bar: gob 42px → ADHX (cream, Indie Flower 28) → #tag (yellow, Indie Flower 46, truncate past ~18 chars) → "curated by @handle · N posts" (mono 16, #b3a893) → yellow "Watch playlist →" pill.
- Text-only card: 6 typographic tiles max, alternate #e4dac8 / #322b23, verbatim post text or article titles only, avatar initials, letter platform chips (X/IG/TT/YT/ARTICLE).
- Generic fallback (render failure/empty): paper bg, gob, tag + curator + count only.
- Private/missing: #08070a, gob + ADHX + tagline + adhx.com — zero identifying info.
- Optional 1080×1080 square reflow for manual posts. No platform-specific variants needed.

## Loader SVG source (authoritative)

Create `public/gob-loader.svg` exactly as below. For `public/gob-loader-paper.svg`, add `stroke="#141414" stroke-width="6"` to the body <rect>. Animation is CSS inside the SVG and works via <img>. The −4° body tilt is the resting pose of the bob keyframe; the loader's mouth is a worried "o" (a circle), so the −7° mouth-tilt rule doesn't apply here.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
<style>
.body{animation:bob 1.8s ease-in-out infinite;transform-origin:48px 48px}
.eyes{animation:look 1.8s ease-in-out infinite}
@keyframes bob{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(2deg)}}
@keyframes look{0%,18%{transform:translate(0,0)}25%,43%{transform:translate(-7px,2px)}50%,68%{transform:translate(8px,-3px)}75%,93%{transform:translate(-1px,4px)}100%{transform:translate(0,0)}}
</style>
<g class="body">
<rect x="10" y="14" width="76" height="72" rx="28" fill="#FFD426"/>
<g class="eyes">
<circle cx="36" cy="46" r="7" fill="#141414"/>
<circle cx="63" cy="42" r="11" fill="#141414"/>
<circle cx="66" cy="39" r="3.5" fill="#FFD426"/>
</g>
<circle cx="49" cy="69" r="5" fill="#141414"/>
</g>
</svg>
```

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Simple nanoid implementation
export function nanoid(size = 21): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  let id = ''
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] % alphabet.length]
  }
  return id
}

// Seeded random number generator (mulberry32)
function seededRandom(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Convert string to numeric seed
function stringToSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

// HSL to hex conversion
function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Color palette presets - curated harmonious color combinations
const COLOR_PALETTES = [
  // Sunset vibes
  { colors: [[350, 80, 45], [20, 90, 50], [45, 95, 55]], name: 'sunset' },
  // Ocean depths
  { colors: [[200, 70, 35], [180, 60, 45], [220, 80, 50]], name: 'ocean' },
  // Forest
  { colors: [[140, 50, 30], [160, 60, 40], [120, 40, 35]], name: 'forest' },
  // Aurora
  { colors: [[280, 60, 45], [180, 70, 40], [320, 50, 50]], name: 'aurora' },
  // Dusk
  { colors: [[250, 50, 35], [280, 40, 45], [220, 60, 40]], name: 'dusk' },
  // Ember
  { colors: [[10, 85, 40], [30, 90, 45], [350, 75, 35]], name: 'ember' },
  // Midnight
  { colors: [[240, 50, 25], [260, 60, 35], [220, 40, 30]], name: 'midnight' },
  // Tropical
  { colors: [[170, 70, 40], [140, 60, 45], [200, 65, 35]], name: 'tropical' },
  // Berry
  { colors: [[330, 65, 40], [300, 55, 45], [350, 70, 35]], name: 'berry' },
  // Slate
  { colors: [[210, 25, 30], [200, 30, 40], [220, 20, 35]], name: 'slate' },
]

export interface GradientConfig {
  angle: number
  colors: string[]
  stops: number[]
}

// Generate a consistent gradient based on tweet ID
export function generateGradient(tweetId: string): GradientConfig {
  const seed = stringToSeed(tweetId)
  const random = seededRandom(seed)

  // Pick a palette based on seed
  const paletteIndex = Math.floor(random() * COLOR_PALETTES.length)
  const palette = COLOR_PALETTES[paletteIndex]

  // Generate angle (0-360)
  const angle = Math.floor(random() * 360)

  // Slightly vary the colors for uniqueness while staying in the palette
  const colors = palette.colors.map(([h, s, l]) => {
    const hVariation = (random() - 0.5) * 20 // +/- 10 degrees
    const sVariation = (random() - 0.5) * 15 // +/- 7.5%
    const lVariation = (random() - 0.5) * 10 // +/- 5%
    return hslToHex(
      (h + hVariation + 360) % 360,
      Math.max(20, Math.min(100, s + sVariation)),
      Math.max(15, Math.min(55, l + lVariation))
    )
  })

  // Generate stop positions
  const stops = [0, 50, 100]

  return { angle, colors, stops }
}

// Generate SVG gradient background
export function generateGradientSvg(config: GradientConfig): string {
  const { angle, colors, stops } = config
  const id = `grad-${colors.join('').replace(/#/g, '')}`

  // Convert angle to x1,y1,x2,y2 coordinates
  const angleRad = (angle * Math.PI) / 180
  const x1 = 50 - Math.cos(angleRad) * 50
  const y1 = 50 - Math.sin(angleRad) * 50
  const x2 = 50 + Math.cos(angleRad) * 50
  const y2 = 50 + Math.sin(angleRad) * 50

  const stopElements = colors
    .map((color, i) => `<stop offset="${stops[i]}%" stop-color="${color}"/>`)
    .join('')

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%' viewBox='0 0 100 100' preserveAspectRatio='none'><defs><linearGradient id='${id}' x1='${x1}%' y1='${y1}%' x2='${x2}%' y2='${y2}%'>${stopElements}</linearGradient></defs><rect width='100' height='100' fill='url(#${id})'/></svg>`

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

// Generate CSS linear-gradient string (simpler alternative)
export function generateCssGradient(config: GradientConfig): string {
  const { angle, colors, stops } = config
  const colorStops = colors.map((color, i) => `${color} ${stops[i]}%`).join(', ')
  return `linear-gradient(${angle}deg, ${colorStops})`
}

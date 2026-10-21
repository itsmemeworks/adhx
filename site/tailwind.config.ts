import path from 'node:path'
import type { Config } from 'tailwindcss'

const here = __dirname

export default {
  future: { hoverOnlyWhenSupported: true },
  content: [path.join(here, 'app/**/*.tsx'), path.join(here, 'components/**/*.tsx')],
  theme: {
    extend: {
      fontFamily: {
        'nx-serif': ['var(--font-instrument-serif)', 'Georgia', 'serif'],
        'nx-sans': ['var(--font-hanken-grotesk)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        nx: {
          ink: 'rgb(var(--nx-ink) / <alpha-value>)',
          stage: 'rgb(var(--nx-stage) / <alpha-value>)',
          surface: 'rgb(var(--nx-surface) / <alpha-value>)',
          cream: 'rgb(var(--nx-cream) / <alpha-value>)',
          soft: 'rgb(var(--nx-soft) / <alpha-value>)',
          muted: 'rgb(var(--nx-muted) / <alpha-value>)',
          hairline: 'rgb(var(--nx-hairline) / <alpha-value>)',
          accent: 'rgb(var(--nx-accent) / <alpha-value>)',
        },
      },
    },
  },
} satisfies Config

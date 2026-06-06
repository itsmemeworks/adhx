import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'indie-flower': ['var(--font-indie-flower)', 'cursive'],
        'ibm-plex': ['var(--font-ibm-plex)', 'sans-serif'],
        'inter': ['var(--font-inter)', 'sans-serif'],
        'lexend': ['var(--font-lexend)', 'sans-serif'],
        'atkinson': ['var(--font-atkinson)', 'sans-serif'],
        // Matter type system
        'serif': ['var(--font-newsreader)', 'Georgia', 'serif'],
        'newsreader': ['var(--font-newsreader)', 'Georgia', 'serif'],
        'mono': ['var(--font-roboto-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        // ——— Matter palette (hex CSS vars; light + dark aware) ———
        paper: 'var(--m-paper)',
        surface: 'var(--m-card)',
        inset: 'var(--m-inset)',
        ink: { DEFAULT: 'var(--m-ink)', 2: 'var(--m-ink2)', 3: 'var(--m-ink3)' },
        hairline: 'var(--m-line)',
        clay: { DEFAULT: 'var(--m-accent)', 2: 'var(--m-accent2)' },
        fsurface: 'var(--m-fcard)',
        fink: { DEFAULT: 'var(--m-fink)', 2: 'var(--m-fink2)', 3: 'var(--m-fink3)' },
        fline: 'var(--m-fline)',
        'type-video': 'var(--m-t-video)',
        'type-photo': 'var(--m-t-photo)',
        'type-text': 'var(--m-t-text)',
        'type-article': 'var(--m-t-article)',
        'type-quote': 'var(--m-t-quote)',
        flame: 'var(--m-flame)',
        live: 'var(--m-live)',
        done: 'var(--m-done)',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: '12px', // Matter --rcard
      },
      boxShadow: {
        'm-xs': 'var(--m-sh-xs)',
        'm-sm': 'var(--m-sh-sm)',
        'm-md': 'var(--m-sh-md)',
        'm-lg': 'var(--m-sh-lg)',
        glow: 'var(--m-glow)',
      },
      backgroundImage: {
        'clay-grad': 'var(--m-grad)',
        'focus-bg': 'var(--m-fbg)',
      },
      keyframes: {
        'bounce-in': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'sparkle-1': {
          '0%': { transform: 'translate(0, 0) scale(1)', opacity: '1' },
          '100%': { transform: 'translate(-30px, -40px) scale(0)', opacity: '0' },
        },
        'sparkle-2': {
          '0%': { transform: 'translate(0, 0) scale(1)', opacity: '1' },
          '100%': { transform: 'translate(35px, -35px) scale(0)', opacity: '0' },
        },
        'sparkle-3': {
          '0%': { transform: 'translate(0, 0) scale(1)', opacity: '1' },
          '100%': { transform: 'translate(-25px, 30px) scale(0)', opacity: '0' },
        },
        'sparkle-4': {
          '0%': { transform: 'translate(0, 0) scale(1)', opacity: '1' },
          '100%': { transform: 'translate(40px, 25px) scale(0)', opacity: '0' },
        },
        // The list is rendered twice; sliding by -50% loops seamlessly.
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        // Matter live indicator — expanding ring.
        'live-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(16,185,129,.5)' },
          '70%': { boxShadow: '0 0 0 7px rgba(16,185,129,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0)' },
        },
      },
      animation: {
        'bounce-in': 'bounce-in 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'sparkle-1': 'sparkle-1 0.6s ease-out forwards',
        'sparkle-2': 'sparkle-2 0.6s ease-out 0.1s forwards',
        'sparkle-3': 'sparkle-3 0.6s ease-out 0.05s forwards',
        'sparkle-4': 'sparkle-4 0.6s ease-out 0.15s forwards',
        marquee: 'marquee var(--marquee-duration, 60s) linear infinite',
        'live-pulse': 'live-pulse 1.8s infinite',
      },
    },
  },
  plugins: [],
}

export default config

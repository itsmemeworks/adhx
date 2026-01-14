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
      },
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
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
      },
      animation: {
        'bounce-in': 'bounce-in 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'sparkle-1': 'sparkle-1 0.6s ease-out forwards',
        'sparkle-2': 'sparkle-2 0.6s ease-out 0.1s forwards',
        'sparkle-3': 'sparkle-3 0.6s ease-out 0.05s forwards',
        'sparkle-4': 'sparkle-4 0.6s ease-out 0.15s forwards',
      },
    },
  },
  plugins: [],
}

export default config

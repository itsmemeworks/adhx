import type { Config } from 'tailwindcss'

const config: Config = {
  // Owner report (mobile round 8): tapped buttons (mute/unmute, transport)
  // stayed visually "selected" — that's iOS/Android retaining `:hover` after
  // a tap. This compiles every `hover:` variant inside
  // `@media (hover: hover) and (pointer: fine)`, so touch devices never get
  // sticky hover styles; real pointers are unaffected.
  future: { hoverOnlyWhenSupported: true },
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
        inter: ['var(--font-inter)', 'sans-serif'],
        lexend: ['var(--font-lexend)', 'sans-serif'],
        atkinson: ['var(--font-atkinson)', 'sans-serif'],
        // Matter type system
        serif: ['var(--font-newsreader)', 'Georgia', 'serif'],
        newsreader: ['var(--font-newsreader)', 'Georgia', 'serif'],
        mono: ['var(--font-roboto-mono)', 'ui-monospace', 'monospace'],
        // next_ui redesign type system (alongside Matter, not replacing it)
        'nx-serif': ['var(--font-instrument-serif)', 'Georgia', 'serif'],
        'nx-sans': ['var(--font-hanken-grotesk)', 'system-ui', 'sans-serif'],
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
        // The design system colour tokens (src/app/globals.css), as `nx-<name>`.
        nx: {
          bg: 'rgb(var(--nx-bg) / <alpha-value>)',
          stage: 'rgb(var(--nx-stage) / <alpha-value>)',
          deep: 'rgb(var(--nx-deep) / <alpha-value>)',
          surface: 'rgb(var(--nx-surface) / <alpha-value>)',
          sheet: 'rgb(var(--nx-sheet) / <alpha-value>)',
          raised: 'rgb(var(--nx-raised) / <alpha-value>)',
          plate: 'rgb(var(--nx-plate) / <alpha-value>)',
          'plate-hover': 'rgb(var(--nx-plate-hover) / <alpha-value>)',
          placeholder: 'rgb(var(--nx-placeholder) / <alpha-value>)',
          hairline: 'rgb(var(--nx-hairline) / <alpha-value>)',
          line: 'rgb(var(--nx-line) / <alpha-value>)',
          accent: 'rgb(var(--nx-accent) / <alpha-value>)',
          'on-accent': 'rgb(var(--nx-on-accent) / <alpha-value>)',
          cream: 'rgb(var(--nx-cream) / <alpha-value>)',
          'on-cream': 'rgb(var(--nx-on-cream) / <alpha-value>)',
          'on-cream-soft': 'rgb(var(--nx-on-cream-soft) / <alpha-value>)',
          bone: 'rgb(var(--nx-bone) / <alpha-value>)',
          ink: 'rgb(var(--nx-ink) / <alpha-value>)',
          'ink-soft': 'rgb(var(--nx-ink-soft) / <alpha-value>)',
          'ink-faint': 'rgb(var(--nx-ink-faint) / <alpha-value>)',
          good: 'rgb(var(--nx-good) / <alpha-value>)',
          warn: 'rgb(var(--nx-warn) / <alpha-value>)',
          live: 'rgb(var(--nx-live) / <alpha-value>)',
          danger: 'rgb(var(--nx-danger) / <alpha-value>)',
          'danger-fill': 'rgb(var(--nx-danger-fill) / <alpha-value>)',
          watching: 'rgb(var(--nx-watching) / <alpha-value>)',
          paper: 'rgb(var(--nx-paper) / <alpha-value>)',
          'paper-ink': 'rgb(var(--nx-paper-ink) / <alpha-value>)',
          'paper-ink-soft': 'rgb(var(--nx-paper-ink-soft) / <alpha-value>)',
          'person-1': 'rgb(var(--nx-person-1) / <alpha-value>)',
          'person-2': 'rgb(var(--nx-person-2) / <alpha-value>)',
          'person-3': 'rgb(var(--nx-person-3) / <alpha-value>)',
          'person-4': 'rgb(var(--nx-person-4) / <alpha-value>)',
          'person-5': 'rgb(var(--nx-person-5) / <alpha-value>)',
          'moment-1': 'rgb(var(--nx-moment-1) / <alpha-value>)',
          'moment-2': 'rgb(var(--nx-moment-2) / <alpha-value>)',
          'moment-3': 'rgb(var(--nx-moment-3) / <alpha-value>)',
          'moment-4': 'rgb(var(--nx-moment-4) / <alpha-value>)',
          'moment-5': 'rgb(var(--nx-moment-5) / <alpha-value>)',
          'moment-6': 'rgb(var(--nx-moment-6) / <alpha-value>)',
          'moment-7': 'rgb(var(--nx-moment-7) / <alpha-value>)',
          'moment-8': 'rgb(var(--nx-moment-8) / <alpha-value>)',
          'moment-9': 'rgb(var(--nx-moment-9) / <alpha-value>)',
          'gob-1': 'rgb(var(--nx-gob-1) / <alpha-value>)',
          'gob-2': 'rgb(var(--nx-gob-2) / <alpha-value>)',
          'gob-3': 'rgb(var(--nx-gob-3) / <alpha-value>)',
          'gob-4': 'rgb(var(--nx-gob-4) / <alpha-value>)',
        },
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
        'nx-tile': '16px',
        'nx-stage': '20px',
      },
      boxShadow: {
        'm-xs': 'var(--m-sh-xs)',
        'm-sm': 'var(--m-sh-sm)',
        'm-md': 'var(--m-sh-md)',
        'm-lg': 'var(--m-sh-lg)',
        glow: 'var(--m-glow)',
        // Backplate under controls that sit on media.
        'nx-plate': '0 2px 10px rgba(0,0,0,.35)',
        'nx-toast': '0 10px 30px rgba(0,0,0,.5)',
        'nx-sheet': '0 -10px 40px rgba(0,0,0,.5)',
        'nx-popover': '0 24px 60px rgba(0,0,0,.6)',
        'nx-dialog': '0 30px 80px rgba(0,0,0,.6)',
        'nx-knob': '0 2px 6px rgba(0,0,0,.4)',
        'nx-bubble': '0 10px 24px rgba(0,0,0,.35)',
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
        // Theater "tap for sound" affordance — subtle scale/opacity breathing,
        // never a hard flash.
        'sound-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.045)', opacity: '0.9' },
        },
        // Triage undo toast entrance — a small rise + fade so it reads as a
        // transient toast, not a stuck badge.
        'toast-in': {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        // Shared-lead save confirmation — a single pop so autosave is visible
        // before the pill hands off to Tag.
        'save-pop': {
          '0%': { transform: 'scale(0.88)' },
          '55%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)' },
        },
        'tag-in': {
          '0%': { transform: 'translateX(5px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        // Live-tab Save collapsing so Tag is left as the only affordance.
        'save-slot-out': {
          '0%': { opacity: '1', transform: 'scale(1)', maxWidth: '10rem' },
          '100%': { opacity: '0', transform: 'scale(0.84)', maxWidth: '0' },
        },
        // ——— next_ui loader (AdhxFace, Shimmer, PasteToast) ———
        // Bounce with squash on landing; the shadow shrinks while airborne.
        'nx-bounce': {
          '0%, 100%': { transform: 'translateY(0) scale(1, 1)' },
          '35%': { transform: 'translateY(-22%) scale(0.95, 1.05)' },
          '55%': { transform: 'translateY(0) scale(1.1, 0.9)' },
          '70%': { transform: 'translateY(-5%) scale(0.98, 1.02)' },
        },
        'nx-shadow': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.55' },
          '35%': { transform: 'scale(0.6)', opacity: '0.25' },
          '55%': { transform: 'scale(1.1)', opacity: '0.6' },
        },
        'nx-look': {
          '0%, 25%': { transform: 'translateX(0)' },
          '35%, 55%': { transform: 'translateX(var(--nx-look, 5px))' },
          '65%, 85%': { transform: 'translateX(calc(var(--nx-look, 5px) * -1))' },
          '100%': { transform: 'translateX(0)' },
        },
        'nx-blink': {
          '0%, 90%, 100%': { transform: 'scaleY(1)' },
          '94%': { transform: 'scaleY(0.1)' },
        },
        'nx-dot': {
          '0%, 80%, 100%': { opacity: '0.25' },
          '40%': { opacity: '1' },
        },
        'nx-shimmer': {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'nx-pop': {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '60%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
        'nx-drop': {
          '0%': { transform: 'translateY(-16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        // "Getting it ready": a light sweeping across the blurred poster.
        'nx-sheen': {
          '0%': { backgroundPosition: '100% 0' },
          '100%': { backgroundPosition: '-50% 0' },
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
        'sound-pulse': 'sound-pulse 2.2s ease-in-out infinite',
        'toast-in': 'toast-in 0.18s ease-out',
        'save-pop': 'save-pop 0.38s cubic-bezier(0.34, 1.3, 0.64, 1)',
        'tag-in': 'tag-in 0.22s ease-out',
        'save-slot-out': 'save-slot-out 0.28s ease-in forwards',
        'nx-bounce': 'nx-bounce 1.15s ease-in-out infinite',
        'nx-shadow': 'nx-shadow 1.15s ease-in-out infinite',
        'nx-look': 'nx-look 2.6s ease-in-out infinite',
        'nx-blink': 'nx-blink 3.2s infinite',
        'nx-dot': 'nx-dot 1.2s infinite',
        'nx-shimmer': 'nx-shimmer 1.6s linear infinite',
        'nx-spin': 'spin 0.8s linear infinite',
        'nx-pop': 'nx-pop 0.4s ease-out',
        'nx-drop': 'nx-drop 0.3s ease-out',
        'nx-sheen': 'nx-sheen 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config

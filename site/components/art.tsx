import type { ReactNode } from 'react'

/**
 * Illustrated stand-ins for saved posts on the product site: flat scenes in
 * ADHX's palette, so the mockups show real-looking content without anyone
 * else's photos or faces.
 */

export type ArtId =
  'frog' | 'frogRain' | 'synth' | 'peaks' | 'city' | 'steak' | 'cat' | 'wave' | 'skate' | 'neon'

const SCENES: Record<ArtId, ReactNode> = {
  frog: (
    <>
      <rect width="300" height="400" fill="#1f4d3a" />
      <rect y="250" width="300" height="150" fill="#16382b" />
      <ellipse cx="150" cy="300" rx="120" ry="34" fill="#2f7a4f" />
      <ellipse cx="150" cy="292" rx="96" ry="22" fill="#3d9a62" />
      <ellipse cx="150" cy="250" rx="62" ry="46" fill="#7ccf5a" />
      <ellipse cx="150" cy="270" rx="40" ry="20" fill="#c9f29a" />
      <circle cx="118" cy="206" r="22" fill="#7ccf5a" />
      <circle cx="182" cy="206" r="22" fill="#7ccf5a" />
      <circle cx="118" cy="204" r="12" fill="#f4f1ea" />
      <circle cx="182" cy="204" r="12" fill="#f4f1ea" />
      <circle cx="121" cy="205" r="6" fill="#141414" />
      <circle cx="185" cy="205" r="6" fill="#141414" />
      <path
        d="M128 252 q22 14 44 0"
        stroke="#141414"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="60" cy="90" r="5" fill="#9fe3c0" opacity="0.6" />
      <circle cx="240" cy="70" r="4" fill="#9fe3c0" opacity="0.6" />
    </>
  ),
  frogRain: (
    <>
      <rect width="300" height="400" fill="#203a4a" />
      {Array.from({ length: 18 }, (_, i) => (
        <rect
          key={i}
          x={(i * 37) % 300}
          y={(i * 53) % 260}
          width="3"
          height="22"
          rx="1.5"
          fill="#8fc6e8"
          opacity="0.55"
        />
      ))}
      <ellipse cx="150" cy="330" rx="140" ry="40" fill="#2b5d4a" />
      <ellipse cx="150" cy="300" rx="50" ry="36" fill="#6fbf52" />
      <circle cx="126" cy="266" r="16" fill="#6fbf52" />
      <circle cx="174" cy="266" r="16" fill="#6fbf52" />
      <circle cx="126" cy="265" r="8" fill="#f4f1ea" />
      <circle cx="174" cy="265" r="8" fill="#f4f1ea" />
      <circle cx="128" cy="266" r="4" fill="#141414" />
      <circle cx="176" cy="266" r="4" fill="#141414" />
      <path d="M96 236 q54 -60 108 0 z" fill="#ffd23f" />
      <rect x="148" y="236" width="4" height="40" fill="#e8b93a" />
    </>
  ),
  synth: (
    <>
      <rect width="300" height="400" fill="#141311" />
      <rect x="30" y="120" width="240" height="170" rx="14" fill="#2a2620" />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3, 4].map((c) => (
          <circle
            key={`${r}-${c}`}
            cx={62 + c * 44}
            cy={150 + r * 34}
            r="11"
            fill={(r + c) % 3 === 0 ? '#ffd23f' : (r + c) % 3 === 1 ? '#f2ead9' : '#ff8a5c'}
          />
        )),
      )}
      {Array.from({ length: 14 }, (_, i) => (
        <path
          key={i}
          d={`M${40 + i * 16} 330 q8 ${i % 2 ? -26 : 26} 16 0`}
          stroke="#ffd23f"
          strokeWidth="3"
          fill="none"
        />
      ))}
    </>
  ),
  peaks: (
    <>
      <rect width="300" height="400" fill="#f2b56b" />
      <circle cx="210" cy="120" r="44" fill="#ffe2a8" />
      <path d="M0 300 L90 150 L170 290 L230 200 L300 300 V400 H0z" fill="#7d4e57" />
      <path d="M0 340 L70 250 L150 330 L240 240 L300 320 V400 H0z" fill="#4a2f3e" />
      <path d="M90 150 L112 186 L72 186z" fill="#f4f1ea" />
    </>
  ),
  city: (
    <>
      <rect width="300" height="400" fill="#1b1f3a" />
      <circle cx="70" cy="80" r="28" fill="#f2ead9" />
      {[
        [10, 200, 50],
        [64, 150, 44],
        [112, 230, 40],
        [156, 120, 52],
        [212, 180, 40],
        [256, 220, 44],
      ].map(([x, y, w]) => (
        <g key={x}>
          <rect x={x} y={y} width={w} height={400 - y} fill="#2d3363" />
          {Array.from({ length: 6 }, (_, i) => (
            <rect
              key={i}
              x={x + 8 + (i % 2) * (w / 2 - 4)}
              y={y + 14 + Math.floor(i / 2) * 26}
              width="8"
              height="10"
              fill="#ffd23f"
              opacity={i % 3 ? 0.9 : 0.35}
            />
          ))}
        </g>
      ))}
    </>
  ),
  steak: (
    <>
      <rect width="300" height="400" fill="#3a2a20" />
      <ellipse cx="150" cy="220" rx="120" ry="90" fill="#e8e0d0" />
      <ellipse cx="150" cy="215" rx="84" ry="56" fill="#8a3b2a" />
      <ellipse cx="140" cy="205" rx="60" ry="36" fill="#b5523a" />
      <path
        d="M100 200 l80 -20 M104 222 l80 -20"
        stroke="#5a2418"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="220" cy="250" r="10" fill="#6fbf52" />
      <circle cx="232" cy="238" r="8" fill="#7ccf5a" />
    </>
  ),
  cat: (
    <>
      <rect width="300" height="400" fill="#e9dcc4" />
      <rect y="300" width="300" height="100" fill="#cdb894" />
      <ellipse cx="150" cy="290" rx="80" ry="60" fill="#e8913a" />
      <circle cx="150" cy="200" r="58" fill="#e8913a" />
      <path d="M100 168 L108 110 L140 150z M200 168 L192 110 L160 150z" fill="#e8913a" />
      <path d="M110 160 L114 126 L132 150z M190 160 L186 126 L168 150z" fill="#f6c39a" />
      <ellipse cx="128" cy="200" rx="9" ry="12" fill="#141414" />
      <ellipse cx="172" cy="200" rx="9" ry="12" fill="#141414" />
      <path
        d="M144 226 l6 6 l6 -6"
        stroke="#141414"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M220 300 q50 -10 40 -70"
        stroke="#e8913a"
        strokeWidth="18"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  wave: (
    <>
      <rect width="300" height="400" fill="#9fd3e6" />
      <circle cx="230" cy="90" r="30" fill="#fff4cf" />
      <path d="M0 230 q75 -90 150 0 t150 0 V400 H0z" fill="#2d7fa6" />
      <path d="M0 270 q75 -60 150 0 t150 0 V400 H0z" fill="#1f5f80" />
      <path
        d="M40 200 q40 -60 100 -10"
        stroke="#f4f1ea"
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
    </>
  ),
  skate: (
    <>
      <rect width="300" height="400" fill="#ffd23f" />
      <path d="M0 320 Q150 220 300 320 V400 H0z" fill="#141414" />
      <rect
        x="110"
        y="190"
        width="90"
        height="12"
        rx="6"
        fill="#ff5c39"
        transform="rotate(-12 155 196)"
      />
      <circle cx="122" cy="214" r="8" fill="#f4f1ea" />
      <circle cx="186" cy="200" r="8" fill="#f4f1ea" />
      <circle cx="160" cy="110" r="18" fill="#141414" />
      <path
        d="M160 128 l-6 50 M154 150 l-30 -6 M156 150 l34 -14 M154 176 l-20 14 M154 176 l22 10"
        stroke="#141414"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
  neon: (
    <>
      <rect width="300" height="400" fill="#120d1e" />
      <circle cx="150" cy="190" r="86" fill="none" stroke="#ff4fa3" strokeWidth="10" />
      <circle cx="150" cy="190" r="56" fill="none" stroke="#4fd8ff" strokeWidth="8" />
      <path d="M90 320 h120" stroke="#ffd23f" strokeWidth="10" strokeLinecap="round" />
    </>
  ),
}

/** One illustrated "post", filling its box. Decorative. */
export function Art({ id, className }: { id: ArtId; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 300 400"
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      {SCENES[id]}
    </svg>
  )
}

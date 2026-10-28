import type { CSSProperties, ReactNode } from 'react'
import { cn } from './cn'

/**
 * The phone frame (it holds a screenshot, Shots.tsx) and the Ring the How it
 * works drawings use. A frame is a size container (`.nx-scale`); inside, `--u`
 * is one pixel of the original 390-wide phone, so it keeps its proportions.
 */

/** `n` design pixels, in the nearest frame's units. */
export const u = (n: number) => `calc(var(--u) * ${n})`

const unitOf = (designWidth: number) =>
  ({ '--u': `calc(100cqw / ${designWidth})` }) as CSSProperties

/* ——— Phone ——— */

export function PhoneFrame({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[13%/6%] border-[4px] border-[#2a2620] bg-black shadow-[0_32px_80px_rgba(0,0,0,0.7)] md:border-[6px]',
        className,
      )}
      style={style}
    >
      <div className="nx-scale relative aspect-[390/844] w-full">
        <div className="absolute inset-0 overflow-hidden" style={unitOf(390)}>
          {children}
        </div>
      </div>
    </div>
  )
}

/** A progress ring with the percentage inside. */
export function Ring({
  size,
  value,
  stroke = 5,
  fill = 'none',
  label,
  labelSize,
}: {
  size: number | string
  value: number
  stroke?: number
  fill?: string
  label: string
  labelSize: number | string
}) {
  const r = 26 - stroke / 2 - 2
  const c = 2 * Math.PI * r
  return (
    <span
      className="relative block shrink-0"
      style={{
        width: typeof size === 'number' ? size : size,
        height: typeof size === 'number' ? size : size,
      }}
    >
      <svg aria-hidden viewBox="0 0 52 52" className="block h-full w-full -rotate-90">
        <circle
          cx="26"
          cy="26"
          r={r}
          fill={fill}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={stroke}
        />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="rgb(var(--nx-accent))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * value} ${c}`}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-extrabold"
        style={{ fontSize: labelSize }}
      >
        {label}
      </span>
    </span>
  )
}

/* ——— Laptop ——— */

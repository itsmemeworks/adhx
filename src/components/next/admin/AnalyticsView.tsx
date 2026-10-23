'use client'

import type { AnalyticsBoard } from '@/lib/admin/boards/analytics'
import { Card, CardHead, Kpi, KpiRow, LABEL, PageTitle, RangeSwitch, fmt, shortDate } from './parts'

/** Each line is scaled to its own highest day, so their shapes can be compared. */
function points(values: number[], height: number, width: number): string {
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? width / (values.length - 1) : width
  return values
    .map(
      (v, i) =>
        `${Math.round(i * step * 10) / 10},${Math.round((height - (v / max) * (height - 10) - 4) * 10) / 10}`,
    )
    .join(' ')
}

function pct(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 100) : 0
}

/** "9 to 11pm", "11am to 1pm": a two-hour stretch from `h`. */
export function hourLabel(h: number): string {
  const end = (h + 2) % 24
  const twelve = (x: number) => ((x + 11) % 12) + 1
  const mer = (x: number) => (x < 12 ? 'am' : 'pm')
  return mer(h) === mer(end)
    ? `${twelve(h)} to ${twelve(end)}${mer(end)}`
    : `${twelve(h)}${mer(h)} to ${twelve(end)}${mer(end)}`
}

function LegendLine({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-nx-ink-soft">
      <span
        aria-hidden
        className="block h-[3px] w-3.5 rounded-full"
        style={{ background: colour }}
      />
      <span>{label}</span>
    </span>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-nx-plate px-3.5 py-3">
      <span className={LABEL}>{label}</span>
      <span className="text-sm font-extrabold">{value}</span>
    </div>
  )
}

export function AnalyticsView({ data, rangeWords }: { data: AnalyticsBoard; rangeWords: string }) {
  const d = data.daily
  const where = data.where
  const opensTotal = where.web + where.ios + where.android + where.phone
  const whereLine = opensTotal
    ? [
        `Web ${pct(where.web, opensTotal)}%`,
        where.ios ? `iPhone ${pct(where.ios, opensTotal)}%` : null,
        where.android ? `Android ${pct(where.android, opensTotal)}%` : null,
        where.phone ? `Phones ${pct(where.phone, opensTotal)}%` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Nobody’s opened it yet'
  const searchTotal = data.searchMode.meaning + data.searchMode.words
  const f = data.funnel
  const funnelMax = Math.max(1, f.saved, f.played, f.sent)
  const sourceMax = Math.max(1, ...data.sources.map((s) => s.count))
  return (
    <>
      <PageTitle
        title="Analytics"
        sub="How your ADHX gets used. Counts only: nothing here shows what anyone searched or watched."
        right={<RangeSwitch path="/admin/analytics" active={data.range} />}
      />
      <KpiRow>
        <Kpi
          label="Opens"
          value={fmt(data.opens.total)}
          foot={
            data.opens.changePct === null
              ? 'Web and phones'
              : `${data.opens.changePct >= 0 ? '+' : ''}${data.opens.changePct}% on last ${data.range === 'today' ? 'day' : data.range === 'week' ? 'week' : 'month'}`
          }
        />
        <Kpi
          label="Plays"
          value={fmt(data.plays.total)}
          foot={
            data.plays.finishedPct === null
              ? 'Nothing played yet'
              : `${data.plays.finishedPct}% to the end`
          }
        />
        <Kpi
          label="Searches"
          value={fmt(data.searches.total)}
          foot={
            data.searches.foundPct === null
              ? 'No searches yet'
              : `${data.searches.foundPct}% found something`
          }
        />
        <Kpi label="Sends" value={fmt(data.sends)} foot="to your people" />
        <Kpi
          label="Shared out"
          value={fmt(data.sharedOut.total)}
          foot={`files ${fmt(data.sharedOut.files)} · links ${fmt(data.sharedOut.links)}`}
        />
        <Kpi
          label="Saves"
          value={fmt(data.saves.total)}
          foot={
            data.saves.phonePct === null
              ? 'Nothing saved yet'
              : `phones ${data.saves.phonePct}% · web ${100 - data.saves.phonePct}%`
          }
        />
      </KpiRow>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="flex min-w-0 flex-col gap-3 px-[18px] py-4">
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            <h3 className="m-0 text-base font-extrabold">Every day, last 30 days</h3>
            <LegendLine colour="#ffd23f" label="Plays" />
            <LegendLine colour="#6b8cff" label="Opens" />
            <LegendLine colour="#7fd1ae" label="Sends" />
          </div>
          <svg
            role="img"
            aria-label="Plays, opens and sends per day over the last 30 days, each on its own scale"
            viewBox="0 0 600 170"
            preserveAspectRatio="none"
            className="h-[190px] w-full"
          >
            <path
              d="M0 42H600M0 84H600M0 126H600"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
            {[
              { v: d.map((x) => x.plays), c: '#ffd23f' },
              { v: d.map((x) => x.opens), c: '#6b8cff' },
              { v: d.map((x) => x.sends), c: '#7fd1ae' },
            ].map((s) => (
              <polyline
                key={s.c}
                points={points(s.v, 170, 600)}
                fill="none"
                stroke={s.c}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <div className="flex justify-between text-[11px] text-nx-ink-faint">
            <span>{shortDate(d[0]?.day)}</span>
            <span>{shortDate(d[Math.floor(d.length / 2)]?.day)}</span>
            <span>Today</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
            <Tile label="Where" value={whereLine} />
            <Tile
              label="When"
              value={
                data.when && data.when.fromHour !== null
                  ? `Busiest ${hourLabel(data.when.fromHour)}, ${data.when.weekday}`
                  : 'Not enough yet'
              }
            />
            <Tile
              label="Search"
              value={
                searchTotal
                  ? `Meaning ${pct(data.searchMode.meaning, searchTotal)}% · words ${pct(data.searchMode.words, searchTotal)}%`
                  : 'No searches yet'
              }
            />
          </div>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-2.5 px-[18px] py-4">
            <CardHead title="From save to sent" note={rangeWords} />
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {[
                { label: 'Saved', n: f.saved, c: '#ffd23f' },
                { label: 'Played', n: f.played, c: '#ffd23f' },
                // Reactions are counted without their post, so this row is the
                // reactions sent, not posts reacted to.
                { label: 'Reactions', n: f.reacted, c: '#ff8fa3' },
                { label: 'Sent on', n: f.sent, c: '#7fd1ae' },
              ].map((row) => (
                <li
                  key={row.label}
                  className="grid grid-cols-[110px_minmax(0,1fr)_64px] items-center gap-2.5 text-sm"
                >
                  <span className="text-nx-ink-soft">{row.label}</span>
                  <span aria-hidden className="h-[26px] overflow-hidden rounded-lg bg-nx-plate">
                    <span
                      className="block h-[26px] rounded-lg"
                      style={{
                        width: `${Math.min(100, (row.n / funnelMax) * 100)}%`,
                        background: row.c,
                      }}
                    />
                  </span>
                  <span className="text-right font-extrabold">{fmt(row.n)}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="flex flex-1 flex-col gap-2.5 px-[18px] py-4">
            <CardHead title="Saved from" note={rangeWords} />
            {data.sources.length ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                {data.sources.map((s) => (
                  <li key={s.label} className="flex items-center gap-2.5">
                    <span className="flex-1 text-nx-ink-soft">{s.label}</span>
                    <span
                      aria-hidden
                      className="h-2 w-[120px] overflow-hidden rounded-full bg-nx-plate"
                    >
                      <span
                        className="block h-2 bg-[#c4a7ff]"
                        style={{ width: `${(s.count / sourceMax) * 100}%` }}
                      />
                    </span>
                    <span className="w-9 text-right font-extrabold">{fmt(s.count)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm text-nx-ink-faint">Nothing saved in this range.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

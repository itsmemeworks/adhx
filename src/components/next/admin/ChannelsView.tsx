'use client'

import Link from 'next/link'
import type { ChannelsBoard, ReactionsSummary } from '@/lib/admin/boards/live'
import { cn } from '@/lib/utils'
import {
  Bars,
  Card,
  CardHead,
  Face,
  Kpi,
  KpiRow,
  PageTitle,
  RangeSwitch,
  TD,
  TH,
  TableBox,
  Thumb,
  displayName,
  fmt,
} from './parts'

/** Reactions by emoji, most first. */
export function ReactionBars({ data, gap = 7 }: { data: ReactionsSummary; gap?: number }) {
  const max = Math.max(1, ...data.byKind.map((r) => r.count))
  return (
    <ul className="m-0 flex list-none flex-col p-0" style={{ gap }}>
      {data.byKind.map((r) => (
        <li key={r.kind} className="grid grid-cols-[28px_minmax(0,1fr)_36px] items-center gap-2.5">
          <span className="text-xl leading-none" role="img" aria-label={r.kind}>
            {r.emoji}
          </span>
          <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-nx-plate">
            <span
              className="block h-2.5 rounded-full bg-nx-accent"
              style={{ width: `${r.count ? Math.max(2, (r.count / max) * 100) : 0}%` }}
            />
          </span>
          <span className="text-right text-[13px] font-extrabold">{fmt(r.count)}</span>
        </li>
      ))}
    </ul>
  )
}

const KIND_LABEL = { group: 'From everyone', public: 'Public' }

export function ChannelsView({ data, rangeWords }: { data: ChannelsBoard; rangeWords: string }) {
  const days = data.tuneInsByDay
  return (
    <>
      <PageTitle
        title="Channels and Live"
        sub="What your people made and watched together. Reactions are counted, never kept."
        right={<RangeSwitch path="/admin/channels" active={data.range} />}
      />
      <KpiRow>
        <Kpi
          label="Channels made"
          value={fmt(data.made.total)}
          foot={`+${fmt(data.made.added)} ${rangeWords}`}
        />
        <Kpi
          label="Public"
          value={fmt(data.public.total)}
          foot={`${fmt(data.public.views)} views · ${fmt(data.public.keeps)} keeps`}
        />
        <Kpi
          label="From everyone"
          value={fmt(data.group.total)}
          foot={data.group.kept === 1 ? 'kept once' : `kept ${fmt(data.group.kept)} times`}
        />
        <Kpi
          label="Moments"
          value={fmt(data.moments.count)}
          foot={`${fmt(data.moments.formingNow)} forming now`}
          accent
        />
        <Kpi
          label="Tuned in"
          value={fmt(data.tunedIn.total)}
          foot={data.tunedIn.peak ? `peak ${data.tunedIn.peak} at once` : 'Nobody yet'}
        />
        <Kpi
          label="Alerts sent"
          value={fmt(data.alerts.sent)}
          foot={`${fmt(data.alerts.bellsOn)} bells on now`}
        />
      </KpiRow>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:items-stretch">
        <Card className="flex min-w-0 flex-col overflow-hidden">
          <div className="px-4 pb-1.5 pt-3.5">
            <CardHead title="Top channels" note={`By plays ${rangeWords}`} />
          </div>
          <TableBox>
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={cn(TH, 'pl-4')}>
                    Channel
                  </th>
                  <th scope="col" className={TH}>
                    Kind
                  </th>
                  <th scope="col" className={TH}>
                    Made by
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    Posts
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    Plays
                  </th>
                  <th scope="col" className={cn(TH, 'pr-4 text-right')}>
                    Keeps
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.top.slice(0, 5).map((c) => (
                  <tr key={c.key}>
                    <td className={cn(TD, 'h-[54px] pl-4')}>
                      <Link
                        href={c.href}
                        className="flex items-center gap-2.5 text-nx-ink hover:underline"
                      >
                        <Thumb src={c.thumbnail} size={36} radius={10} />
                        <span className="font-extrabold">{c.name}</span>
                      </Link>
                    </td>
                    <td className={cn(TD, 'h-[54px] text-nx-ink-soft')}>{KIND_LABEL[c.kind]}</td>
                    <td className={cn(TD, 'h-[54px]')}>
                      {c.owner ? (
                        <span className="inline-flex items-center gap-2">
                          <Face who={c.owner} size={24} />
                          <span>{displayName(c.owner)}</span>
                        </span>
                      ) : (
                        <span className="text-nx-ink-soft">Everyone</span>
                      )}
                    </td>
                    <td className={cn(TD, 'h-[54px] text-right')}>{fmt(c.posts)}</td>
                    <td className={cn(TD, 'h-[54px] text-right')}>{fmt(c.plays)}</td>
                    <td className={cn(TD, 'h-[54px] pr-4 text-right')}>{fmt(c.keeps)}</td>
                  </tr>
                ))}
                {!data.top.length && (
                  <tr>
                    <td colSpan={6} className={cn(TD, 'pl-4 text-nx-ink-faint')}>
                      No shared channels yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableBox>
        </Card>
        <div className="flex min-w-0 flex-col gap-4 self-start">
          <Card className="flex flex-col gap-2.5 px-[18px] py-4">
            <CardHead
              title="Reactions"
              note={`${fmt(data.reactions.total)} this month · ${fmt(data.reactions.typed)} typed`}
            />
            <ReactionBars data={data.reactions} />
          </Card>
          <Card className="flex flex-col gap-2.5 px-[18px] py-4">
            <CardHead title="Watched together, by day" />
            <Bars
              values={days.map((d) => d.tuneIns)}
              height={64}
              highlightFrom={days.length - 7}
              label="Moments tuned into each day, last 14 days"
            />
            <span className="text-xs text-nx-ink-faint">Moments tuned into, last 14 days</span>
          </Card>
        </div>
      </div>
    </>
  )
}

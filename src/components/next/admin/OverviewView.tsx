'use client'

import Link from 'next/link'
import type { OverviewBoard } from '@/lib/admin/boards/overview'
import { faceColour } from '../faces'
import {
  Bars,
  Card,
  CardHead,
  Dot,
  Face,
  FaceStack,
  Kpi,
  KpiRow,
  PageTitle,
  RangeSwitch,
  Thumb,
  bytesLabel,
  dayName,
  displayName,
  fmt,
  plural,
  shortDate,
} from './parts'

export function highlightFrom(range: OverviewBoard['range'], days: number): number {
  if (range === 'today') return days - 1
  if (range === 'week') return days - 7
  return 0
}

export const RANGE_END: Record<OverviewBoard['range'], string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  all: 'This month',
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[#c9bfab]">
      <span
        aria-hidden
        className="block h-2.5 w-2.5 rounded-[3px]"
        style={{ background: colour }}
      />
      <span>{label}</span>
    </span>
  )
}

export function OverviewView({ data, server }: { data: OverviewBoard; server: string }) {
  const days = data.days
  const shared = days.map((d) => d.shared)
  const priv = days.map((d) => d.private)
  const totalSaves = days.reduce((s, d) => s + d.shared + d.private, 0)
  const h = data.health
  const helper =
    h.helper === 'connected'
      ? 'Mac helper connected'
      : h.helper === 'away'
        ? 'Mac helper away'
        : 'Processing on this server'
  const title = data.range === 'all' ? 'Your ADHX, all time' : `Your ADHX, ${data.rangeWords}`

  return (
    <>
      <PageTitle
        title={title}
        sub={`Everything happening on ${server}. Counts include Just for me saves; their posts are never listed.`}
        right={<RangeSwitch path="/admin" active={data.range} />}
      />
      <KpiRow>
        <Kpi
          label="People"
          value={fmt(data.people.count)}
          foot={data.people.waiting ? `${data.people.waiting} waiting for you` : 'Nobody waiting'}
          footAccent={data.people.waiting > 0}
        />
        <Kpi
          label="Saves"
          value={fmt(data.saves.total)}
          foot={`+${fmt(data.saves.added)} ${data.rangeWords} · ${fmt(data.saves.privateTotal)} Just for me`}
        />
        <Kpi
          label="Kept"
          value={bytesLabel(data.kept.bytes)}
          foot={`${plural(data.kept.posts, 'post')} · ${fmt(data.kept.onTheirWay)} on their way`}
        />
        <Kpi
          label="Channels"
          value={fmt(data.channels.made)}
          foot={`${fmt(data.channels.public)} public · ${fmt(data.channels.group)} from everyone`}
        />
        <Kpi
          label="Reactions"
          value={fmt(data.reactions.total)}
          foot={`+${fmt(data.reactions.added)} ${data.rangeWords}`}
        />
        <Kpi
          label="Sends"
          value={fmt(data.sends.total)}
          foot={`${fmt(data.sends.watched)} watched`}
        />
      </KpiRow>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-3 px-[18px] py-4">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
              <h3 className="m-0 text-base font-extrabold">Saves, last 30 days</h3>
              <Legend colour="#ffd23f" label="Shared" />
              <Legend colour="#c4a7ff" label="Just for me" />
              {data.busiestDay && (
                <span className="text-[13px] text-[#a39b8b] sm:ml-auto">
                  {`Busiest: ${dayName(data.busiestDay.day)}, ${plural(data.busiestDay.saves, 'save')}`}
                </span>
              )}
            </div>
            <Bars
              values={shared}
              second={priv}
              height={112}
              highlightFrom={highlightFrom(data.range, days.length)}
              label={`${plural(totalSaves, 'save')} in the last 30 days, shared and Just for me`}
            />
            <div className="flex justify-between text-[11px] text-[#a39b8b]">
              <span>{shortDate(days[0]?.day)}</span>
              <span>{shortDate(days[Math.floor(days.length / 2)]?.day)}</span>
              <span>{RANGE_END[data.range]}</span>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              label="Opens"
              value={fmt(data.opens.total)}
              foot={
                data.opens.webPct === null
                  ? 'Web and phones'
                  : `Web ${data.opens.webPct}% · phones ${100 - data.opens.webPct}%`
              }
            />
            <Kpi
              label="Plays"
              value={fmt(data.plays.total)}
              foot={
                data.plays.finishedPct === null
                  ? 'Nothing played yet'
                  : `${data.plays.finishedPct}% watched to the end`
              }
            />
            <Kpi
              label="Notes"
              value={fmt(data.notes.total)}
              foot={
                data.notes.pctOfSaves === null
                  ? 'On shared saves'
                  : `on ${data.notes.pctOfSaves}% of saves`
              }
            />
            <Kpi
              label="Live moments"
              value={fmt(data.moments.count)}
              foot={
                data.moments.peak ? `peak ${data.moments.peak} watching` : 'Nobody tuned in yet'
              }
            />
          </div>

          <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden px-[18px] py-3.5 xl:flex-nowrap">
            <Dot colour={h.dbOk ? '#7ddc8a' : '#ff8a7a'} size={10} />
            <span className="whitespace-nowrap text-sm font-extrabold">
              {h.dbOk ? 'Server is healthy' : 'The database isn’t answering'}
            </span>
            <span className="whitespace-nowrap text-[13px] text-[#c9bfab]">
              {h.diskTotal
                ? `Disk ${bytesLabel(h.keptBytes)} of ${bytesLabel(h.diskTotal)}`
                : `Kept ${bytesLabel(h.keptBytes)}`}
            </span>
            <span className="whitespace-nowrap text-[13px] text-[#c9bfab]">{helper}</span>
            {h.understoodPct !== null && (
              <span className="whitespace-nowrap text-[13px] text-[#c9bfab]">
                {`Understood ${h.understoodPct}%`}
              </span>
            )}
            <Link
              href="/admin/processing"
              className="whitespace-nowrap text-sm font-extrabold text-nx-accent underline hover:text-white sm:ml-auto xl:shrink-0"
            >
              Processing
            </Link>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-3 px-[18px] py-4">
            <CardHead title={`Most saved ${data.range === 'all' ? 'ever' : data.rangeWords}`} />
            {data.mostSaved.length ? (
              <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                {data.mostSaved.map((m) => (
                  <li
                    key={`${m.post.platform}:${m.post.id}`}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <Thumb src={m.post.thumbnail} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <Link
                        href={m.post.openPath}
                        className="truncate text-sm font-extrabold text-[#f4f1ea] hover:underline"
                      >
                        {m.post.title}
                      </Link>
                      <span className="truncate text-xs text-[#a39b8b]">{m.detail}</span>
                    </span>
                    <FaceStack faces={m.savers.slice(0, 3)} size={22} />
                    <span className="w-7 text-right text-sm font-extrabold">{m.saves}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="m-0 text-sm text-[#a39b8b]">Nothing shared yet in this range.</p>
            )}
          </Card>
          <Card className="flex flex-col gap-3 px-[18px] py-4">
            <CardHead title="Who’s busiest" />
            {data.busiest.length ? (
              <ol className="m-0 flex list-none flex-col gap-[9px] p-0">
                {data.busiest.map((b) => (
                  <li key={b.face.username} className="flex items-center gap-2.5">
                    <Face who={b.face} size={28} />
                    <span className="w-12 truncate text-sm font-extrabold">
                      {displayName(b.face)}
                    </span>
                    <span
                      aria-hidden
                      className="h-2 flex-1 overflow-hidden rounded-full bg-[#262320]"
                    >
                      <span
                        className="block h-2 rounded-full"
                        style={{ width: `${b.pct}%`, background: faceColour(b.face.username) }}
                      />
                    </span>
                    <span className="w-[120px] whitespace-nowrap text-right text-[13px] text-[#c9bfab]">
                      {`${plural(b.saves, 'save')} · ${plural(b.reactions, 'react')}`}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="m-0 text-sm text-[#a39b8b]">Quiet in this range.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

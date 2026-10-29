'use client'

import Link from 'next/link'
import type { LiveBoard, LiveMomentCard } from '@/lib/admin/boards/live'
import { ReactionBars } from './ChannelsView'
import {
  CARD,
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
  displayName,
  fmt,
  names,
  plural,
} from './parts'
import { cn } from '@/lib/utils'

const DOTS = ['#ff8fa3', '#ffb35c', '#6b8cff', '#7fd1ae', '#c4a7ff']

function stateLine(m: LiveMomentCard): string {
  const head = m.rising ? 'RISING' : 'LIVE'
  if (m.recentSaves && m.windowMinutes) {
    return `${head} · ${plural(m.recentSaves, 'save')} in ${m.windowMinutes} min`
  }
  return `${head} · ${plural(m.people, 'person', 'people')}`
}

function saversLine(m: LiveMomentCard): string {
  const list = m.savers.map((s, i) => (m.saversYou[i] ? 'You' : displayName(s)))
  if (!list.length) return plural(m.people, 'person', 'people')
  const shown = list.slice(0, 3)
  const more = m.people - shown.length
  return `${more > 0 ? `${shown.join(', ')} and ${plural(more, 'other')}` : names(shown)} saving`
}

function MomentCard({ m }: { m: LiveMomentCard }) {
  return (
    <Link
      href={`/moments/${encodeURIComponent(m.slug)}`}
      className={cn(CARD, 'flex min-w-0 flex-col overflow-hidden text-nx-ink')}
      style={{ borderColor: m.hue }}
    >
      <span className="relative flex h-[92px]">
        {[0, 1, 2].map((i) =>
          m.covers[i] ? (
            <img
              referrerPolicy="no-referrer"
              key={i}
              src={m.covers[i]}
              alt=""
              className="block h-full w-1/3 object-cover"
            />
          ) : (
            <span key={i} className="block h-full w-1/3 bg-nx-plate" />
          ),
        )}
        <span className="absolute left-2.5 top-2.5 inline-flex h-6 items-center gap-1.5 rounded-full bg-black/55 px-2.5 text-[11px] font-extrabold">
          <Dot colour="rgb(var(--nx-live))" />
          <span>{stateLine(m)}</span>
        </span>
      </span>
      <span className="flex flex-col gap-1.5 px-3.5 py-3">
        <span className="font-nx-serif text-[26px] leading-none">{m.title}</span>
        <span className="flex min-w-0 items-center gap-2 text-[13px] text-nx-ink-soft">
          <FaceStack faces={m.savers.slice(0, 3)} size={22} />
          <span className="truncate">{saversLine(m)}</span>
        </span>
        <span className="text-[13px] font-extrabold">
          {m.watching
            ? `${m.watching} watching · ${plural(m.reactions, 'reaction')}`
            : 'Nobody watching yet'}
        </span>
      </span>
    </Link>
  )
}

export function LiveView({ data, rangeWords }: { data: LiveBoard; rangeWords: string }) {
  return (
    <>
      <PageTitle
        title="Live"
        sub="Moments form when a few of you save the same kind of thing at once. Reactions are counted, never kept."
        right={<RangeSwitch path="/admin/live" active={data.range} />}
      />
      <KpiRow>
        <Kpi
          label="Live now"
          value={fmt(data.liveNow)}
          foot={data.watchingNow ? `${data.watchingNow} of you watching` : 'Nobody watching'}
          accent
        />
        <Kpi
          label="Forming"
          value={fmt(data.forming)}
          foot={`${plural(data.bellsWaiting, 'bell')} waiting`}
        />
        <Kpi
          label="Moments"
          value={fmt(data.moments.count)}
          foot={`${rangeWords} · ${fmt(data.moments.lastMonth)} last month`}
        />
        <Kpi
          label="Tune-ins"
          value={fmt(data.tuneIns.total)}
          foot={data.tuneIns.peak ? `peak ${data.tuneIns.peak} at once` : 'Nobody yet'}
        />
        <Kpi
          label="Reactions"
          value={fmt(data.reactions.total)}
          foot={`${fmt(data.reactions.emoji)} emoji · ${fmt(data.reactions.typed)} typed`}
        />
        <Kpi
          label="Alerts sent"
          value={fmt(data.alerts.sent)}
          foot={`${fmt(data.alerts.opened)} opened`}
        />
      </KpiRow>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] items-start gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {data.live.length ? (
            data.live.map((m) => <MomentCard key={m.slug} m={m} />)
          ) : (
            <Card className="px-[18px] py-4">
              <p className="m-0 text-sm text-nx-ink-faint">Nothing live right now.</p>
            </Card>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4 self-stretch">
          <Card className="flex flex-col gap-2.5 px-4 py-3.5">
            <CardHead title="Forming" note="bells on" />
            {data.formingRows.length ? (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {data.formingRows.map((f) => {
                  const left = Math.max(0, f.need - f.have)
                  return (
                    <li key={f.id} className="flex items-center gap-2.5">
                      <Thumb src={f.cover} size={40} radius={10} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-extrabold">{f.title}</span>
                        <span className="text-xs text-nx-ink-faint">
                          {`${plural(left, f.unit === 'people' ? 'more person' : 'more save', f.unit === 'people' ? 'more people' : 'more saves')} to go live`}
                        </span>
                      </span>
                      <FaceStack faces={f.people.slice(0, 3)} size={22} />
                      <span className="w-[52px] text-right text-[13px] font-extrabold">
                        {plural(f.bells, 'bell')}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="m-0 text-sm text-nx-ink-faint">Nothing forming.</p>
            )}
          </Card>
          <Card className="flex flex-1 flex-col gap-2.5 px-4 py-3.5">
            <CardHead title={`Moments ${rangeWords}`} note="most watched first" />
            {data.week.length ? (
              <ol className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                {data.week.map((w, i) => (
                  <li key={w.slug} className="flex items-center gap-2.5">
                    <Dot colour={DOTS[i % DOTS.length]} />
                    <span className="min-w-0 flex-1 truncate font-extrabold">{w.title}</span>
                    <span className="whitespace-nowrap text-nx-ink-soft">
                      {`${plural(w.tuneIns, 'tune-in')} · ${plural(w.reactions, 'react')}`}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="m-0 text-sm text-nx-ink-faint">No moments in this range.</p>
            )}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-[9px] px-4 py-3.5">
            <CardHead title="Reactions" note={rangeWords} />
            <ReactionBars data={data.reactions} />
          </Card>
          <Card className="flex flex-col gap-[9px] px-4 py-3.5">
            <CardHead title="Who reacts most" />
            {data.reactors.length ? (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {data.reactors.map((r) => (
                  <li key={r.face.username} className="flex items-center gap-2.5">
                    <Face who={r.face} size={26} />
                    <span className="flex-1 text-sm font-extrabold">{displayName(r.face)}</span>
                    <span className="text-[13px] text-nx-ink-soft">{fmt(r.count)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="m-0 text-sm text-nx-ink-faint">No reactions yet.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

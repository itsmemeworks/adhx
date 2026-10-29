'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  CheckState,
  HealthCheck,
  HelperView,
  QueueHealth,
  ServiceView,
  SystemBoard,
} from '@/lib/admin/boards/system'
import { REFUSAL_WORDS } from '@/lib/processing/refusal-words'
import { cn } from '@/lib/utils'
import { STATE_COLOUR, SystemMap } from './SystemMap'
import { SystemSettings } from './SystemSettings'
import {
  BTN,
  Bars,
  Card,
  CardHead,
  Chip,
  Dot,
  PageTitle,
  TD,
  TH,
  TableBox,
  agoShort,
  fmt,
} from './parts'

/** The page re-reads itself this often, so a helper connecting shows up without a reload. */
const REFRESH_MS = 15_000

const COLOUR = STATE_COLOUR

const OVERALL: Record<CheckState, string> = {
  ok: 'Everything is working',
  warn: 'Working, with things to look at',
  bad: 'Something isn’t working',
  off: 'Everything is working',
}

const STATE_WORD: Record<CheckState, string> = {
  ok: 'OK',
  warn: 'Look',
  bad: 'Broken',
  off: 'Off',
}

function since(iso: string | null, now: number): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (mins < 1) return 'under a minute'
  if (mins < 90) return `${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h`
  return `${Math.round(hours / 24)} days`
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function StateDot({ state, size = 9 }: { state: CheckState; size?: number }) {
  return <Dot colour={COLOUR[state]} size={size} />
}

function CheckRow({ check }: { check: HealthCheck }) {
  return (
    <li className="flex gap-3 border-t border-white/[0.06] px-[18px] py-3 first:border-t-0">
      <span className="mt-[7px]">
        <StateDot state={check.state} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[15px] font-extrabold">{check.title}</span>
          <span className="text-xs font-extrabold" style={{ color: COLOUR[check.state] }}>
            {STATE_WORD[check.state]}
          </span>
        </span>
        <span className="break-words text-sm text-nx-ink-soft">{check.summary}</span>
        {check.fix && <span className="text-[13px] text-nx-ink-faint">{check.fix}</span>}
      </span>
    </li>
  )
}

/** What's wrong, under the banner: only checks that need someone, with the fix (the cards below say the rest). */
function Problems({ overall, checks }: { overall: CheckState; checks: HealthCheck[] }) {
  const problems = checks
    .filter((c) => c.state === 'bad' || c.state === 'warn')
    .sort((a, b) => (a.state === b.state ? 0 : a.state === 'bad' ? -1 : 1))
  return (
    <Card accent={overall === 'bad'} className="min-w-0 overflow-hidden">
      <div className="flex items-center gap-3 px-[18px] py-4">
        <StateDot state={overall} size={12} />
        <span className="text-lg font-extrabold">{OVERALL[overall]}</span>
      </div>
      {problems.length > 0 && (
        <ul className="m-0 list-none border-t border-white/[0.06] p-0">
          {problems.map((c) => (
            <CheckRow key={c.id} check={c.fix ? { ...c, summary: c.fix, fix: null } : c} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function Num({ label, value, tone }: { label: string; value: number; tone?: CheckState }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span
        className="text-[22px] font-extrabold leading-tight"
        style={tone && value > 0 ? { color: COLOUR[tone] } : undefined}
      >
        {fmt(value)}
      </span>
      <span className="text-xs text-nx-ink-faint">{label}</span>
    </span>
  )
}

/** Queue size over time: a line from the five-minute samples. */
function Backlog({ values, colour }: { values: number[]; colour: string }) {
  if (values.length < 2)
    return (
      <span className="flex h-11 items-center text-xs text-nx-ink-faint">
        Fills in every five minutes from when the server started.
      </span>
    )
  const max = Math.max(1, ...values)
  const step = 100 / (values.length - 1)
  const points = values.map(
    (v, i) => `${(i * step).toFixed(2)},${(40 - (v / max) * 36).toFixed(2)}`,
  )
  return (
    <svg
      viewBox="0 0 100 42"
      preserveAspectRatio="none"
      className="block h-11 w-full"
      role="img"
      aria-label={`Left to do, from ${fmt(values[0])} to ${fmt(values[values.length - 1])}`}
    >
      <polygon points={`0,42 ${points.join(' ')} 100,42`} fill={colour} opacity={0.14} />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={colour}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function QueueCard({ q, now, backlog }: { q: QueueHealth; now: number; backlog: number[] }) {
  const colour = q.state === 'off' ? COLOUR.off : q.state === 'bad' ? COLOUR.bad : '#ffd23f'
  return (
    <Card className="flex min-w-0 flex-col gap-3 px-[18px] py-4">
      <div className="flex items-center gap-2.5">
        <StateDot state={q.state} />
        <h3 className="m-0 min-w-0 truncate text-base font-extrabold">{q.title}</h3>
        <span className="ml-auto shrink-0">
          <Chip>{`On ${q.where}`}</Chip>
        </span>
      </div>
      <p className="m-0 text-sm text-nx-ink-soft">{q.summary}</p>
      <div className="grid grid-cols-4 gap-2">
        <Num label="Waiting" value={q.waiting} />
        <Num label="Working" value={q.working} />
        <Num label="Retrying" value={q.retrying} />
        <Num label={q.id === 'downloads' ? 'Gave up' : 'Failed'} value={q.failed} tone="warn" />
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]" suppressHydrationWarning>
        <li className="flex justify-between gap-2">
          <span className="text-nx-ink-faint">Oldest waiting</span>
          <span className="font-extrabold">
            {q.oldestWaitingAt ? since(q.oldestWaitingAt, now) : 'Nothing waiting'}
          </span>
        </li>
        <li className="flex justify-between gap-2">
          <span className="text-nx-ink-faint">Last finished</span>
          <span className="font-extrabold">
            {q.lastDoneAt ? agoShort(q.lastDoneAt, now) : 'Not yet'}
          </span>
        </li>
        <li className="flex justify-between gap-2">
          <span className="text-nx-ink-faint">Finished</span>
          <span className="font-extrabold">
            {`${fmt(q.doneLastHour)} last hour · ${fmt(q.doneLastDay)} last 24 h`}
          </span>
        </li>
        {q.stuck > 0 && (
          <li className="flex justify-between gap-2">
            <span className="text-nx-ink-faint">Held by a silent worker</span>
            <span className="font-extrabold text-nx-warn">{fmt(q.stuck)}</span>
          </li>
        )}
      </ul>
      <div className="flex flex-col gap-1">
        <span className="flex justify-between text-xs text-nx-ink-faint">
          <span>Left to do</span>
          <span>{backlog.length > 1 ? 'since the server started' : ''}</span>
        </span>
        <Backlog values={backlog} colour={colour} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="flex justify-between text-xs text-nx-ink-faint">
          <span>Finished each hour</span>
          <span>last 24 hours</span>
        </span>
        <Bars
          values={q.hourly}
          height={40}
          colour={colour}
          label={`Finished each hour for the last 24 hours: ${fmt(q.doneLastDay)} in all`}
        />
      </div>
    </Card>
  )
}

function HelperCard({ helper, now }: { helper: HelperView; now: number }) {
  if (helper.mode === 'local') {
    return (
      <Card className="flex flex-col gap-2.5 px-[18px] py-4">
        <CardHead title="Mac helper" note="Not used" />
        <p className="m-0 text-sm text-nx-ink-soft">
          This server converts videos and understands posts itself. To hand that to a Mac, set
          PROCESSING_MODE=remote and a PROCESSING_WORKER_TOKEN, restart ADHX, then connect the
          helper with the same token.
        </p>
        {helper.lastRefused && (
          <p className="m-0 text-[13px] text-nx-warn" suppressHydrationWarning>
            {`A helper tried to connect ${agoShort(helper.lastRefused.at, now)} and was turned away: ${REFUSAL_WORDS[helper.lastRefused.reason]}.`}
          </p>
        )}
      </Card>
    )
  }
  const state: CheckState = helper.setupProblem ? 'bad' : helper.connected ? 'ok' : 'bad'
  return (
    <Card className="flex min-w-0 flex-col gap-3 overflow-hidden py-4">
      <div className="flex flex-col gap-2 px-[18px]">
        <CardHead title="Mac helper" note={`Server speaks protocol ${helper.serverProtocol}`} />
        <span className="flex items-center gap-2 text-[15px] font-extrabold">
          <StateDot state={state} />
          <span>
            {helper.setupProblem
              ? 'Can’t connect'
              : helper.connected
                ? 'Connected'
                : 'Not connected'}
          </span>
        </span>
        <span className="text-[13px] text-nx-ink-soft" suppressHydrationWarning>
          {helper.setupProblem
            ? `This server turns helpers away: ${REFUSAL_WORDS[helper.setupProblem]}.`
            : helper.lastSeenAt
              ? 'Helpers ask for work every few seconds, so two quiet minutes means it’s gone.'
              : 'Not seen since this server started.'}
        </span>
        {helper.lastRefused && (
          <span className="text-[13px] text-nx-warn" suppressHydrationWarning>
            {`Last turned away ${agoShort(helper.lastRefused.at, now)}${helper.lastRefused.count > 1 ? ` (${fmt(helper.lastRefused.count)} times in a row)` : ''}: ${REFUSAL_WORDS[helper.lastRefused.reason]}.`}
          </span>
        )}
      </div>
      {helper.workers.length > 0 && (
        <TableBox>
          <table className="w-full min-w-[440px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={cn(TH, 'pl-[18px]')}>
                  Helper
                </th>
                <th scope="col" className={TH}>
                  Can do
                </th>
                <th scope="col" className={TH}>
                  Jobs held
                </th>
                <th scope="col" className={cn(TH, 'pr-[18px] text-right')}>
                  Last asked
                </th>
              </tr>
            </thead>
            <tbody>
              {helper.workers.map((w) => (
                <tr key={w.workerId}>
                  <td className={cn(TD, 'pl-[18px]')}>
                    <span className="flex flex-col">
                      <span className="max-w-[200px] truncate font-extrabold">{w.workerId}</span>
                      <span className="max-w-[200px] truncate text-xs text-nx-ink-faint">
                        {w.protocol
                          ? `protocol ${w.protocol}${w.model ? ` · ${w.model}` : ''}`
                          : 'held from before a restart'}
                      </span>
                      {w.problem && (
                        <span className="max-w-[260px] whitespace-normal text-xs text-nx-danger">
                          {`Refused work: ${w.problem}.`}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={cn(TD, 'max-w-[180px] truncate text-nx-ink-soft')}>
                    {w.kinds?.length
                      ? w.kinds.join(', ')
                      : w.protocol
                        ? 'Everything it knows'
                        : '—'}
                  </td>
                  <td className={TD}>{fmt(w.leases)}</td>
                  <td className={cn(TD, 'pr-[18px] text-right')} suppressHydrationWarning>
                    {w.lastClaimAt ? agoShort(w.lastClaimAt, now) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      )}
    </Card>
  )
}

function ServicesCard({
  services,
  tools,
  now,
}: {
  services: ServiceView[]
  tools: HealthCheck[]
  now: number
}) {
  return (
    <Card className="min-w-0 overflow-hidden" as="section" labelledBy="system-services">
      <div className="px-[18px] pb-1 pt-4">
        <CardHead
          id="system-services"
          title="Services and tools"
          note="counts since the server started"
        />
      </div>
      <ul className="m-0 list-none p-0">
        {services.map((svc) => (
          <li
            key={svc.id}
            className="flex flex-col gap-2 border-t border-white/[0.06] px-[18px] py-3 first:border-t-0"
          >
            <span className="flex items-start gap-2.5">
              <span className="mt-[7px]">
                <StateDot state={svc.state} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[15px] font-extrabold">{svc.name}</span>
                  <span className="text-xs text-nx-ink-faint">{`for ${svc.usedFor}`}</span>
                </span>
                <span className="text-sm text-nx-ink-soft" suppressHydrationWarning>
                  {svc.summary}
                </span>
              </span>
            </span>
            {svc.calls.length > 1 && (
              <TableBox>
                <table className="w-full min-w-[440px] border-collapse">
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>
                        For
                      </th>
                      <th scope="col" className={TH}>
                        Worked
                      </th>
                      <th scope="col" className={TH}>
                        Failed
                      </th>
                      <th scope="col" className={TH}>
                        Usually takes
                      </th>
                      <th scope="col" className={cn(TH, 'text-right')}>
                        Last answer
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {svc.calls.map((c) => (
                      <tr key={c.purpose}>
                        <td className={TD}>{c.purpose}</td>
                        <td className={TD}>{fmt(c.ok)}</td>
                        <td className={cn(TD, c.failed > 0 && 'text-nx-warn')}>
                          {c.failed > 0 && c.lastError
                            ? `${fmt(c.failed)} · ${c.lastError}`
                            : fmt(c.failed)}
                        </td>
                        <td className={TD}>
                          {c.averageMs === null
                            ? '—'
                            : c.averageMs < 1000
                              ? `${c.averageMs} ms`
                              : `${(c.averageMs / 1000).toFixed(1)} s`}
                        </td>
                        <td className={cn(TD, 'text-right')} suppressHydrationWarning>
                          {c.lastOkAt ? agoShort(c.lastOkAt, now) : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableBox>
            )}
          </li>
        ))}
        {tools.map((t) => (
          <li
            key={t.id}
            className="flex items-start gap-2.5 border-t border-white/[0.06] px-[18px] py-3"
          >
            <span className="mt-[7px]">
              <StateDot state={t.state} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-extrabold">{t.title}</span>
              <span className="break-words text-sm text-nx-ink-soft">{t.summary}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function SystemView({ data, server }: { data: SystemBoard; server: string }) {
  const router = useRouter()
  const now = useNow()
  const [checkedAt, setCheckedAt] = useState(() => Date.now())

  useEffect(() => {
    setCheckedAt(Date.now())
  }, [data])
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, REFRESH_MS)
    return () => clearInterval(t)
  }, [router])

  return (
    <>
      <PageTitle
        title="System"
        sub={`Whether ${server} is working, and how it’s set up.`}
        right={
          <span className="flex items-center gap-2.5">
            <span className="text-xs text-nx-ink-faint" suppressHydrationWarning>
              {`Checked ${agoShort(new Date(checkedAt).toISOString(), now) || 'just now'}`}
            </span>
            <button type="button" className={BTN} onClick={() => router.refresh()}>
              Check again
            </button>
          </span>
        }
      />

      <Problems overall={data.overall} checks={data.checks} />

      <SystemMap data={data} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.queues.map((q) => (
          <QueueCard key={q.id} q={q} now={now} backlog={data.backlog.map((b) => b[q.id])} />
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <HelperCard helper={data.helper} now={now} />
        <ServicesCard
          services={data.services}
          tools={data.checks.filter((c) => c.id === 'ffmpeg' || c.id === 'disk')}
          now={now}
        />
      </div>

      <SystemSettings groups={data.settings} />
    </>
  )
}

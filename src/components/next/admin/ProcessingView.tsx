'use client'

import Link from 'next/link'
import type { ProcessingBoard, QueueRow } from '@/lib/admin/boards/processing'
import { cn } from '@/lib/utils'
import { useAdminAction } from './actions'
import {
  BTN,
  Bars,
  Card,
  CardHead,
  Chip,
  Dot,
  Kpi,
  KpiRow,
  PRIMARY_BTN,
  PageTitle,
  TD,
  TH,
  TableBox,
  Thumb,
  bytesLabel,
  fmt,
  plural,
} from './parts'

function retryAt(iso: string | null): string {
  if (!iso) return 'nothing to retry'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'will try again soon'
  if (d.getTime() <= Date.now()) return 'trying again now'
  const h = d.getHours()
  const m = d.getMinutes()
  const time = `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
  const sameDay = d.toDateString() === new Date().toDateString()
  return `will try again at ${time}${sameDay ? '' : ' tomorrow'}`
}

function seenAgo(iso: string | null): string {
  if (!iso) return 'Not seen yet'
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (s < 5) return 'Seen just now'
  if (s < 60) return `Seen ${s} seconds ago`
  const m = Math.round(s / 60)
  if (m < 60) return `Seen ${m} min ago`
  return `Seen ${Math.round(m / 60)} hours ago`
}

function State({ row, remote }: { row: QueueRow; remote: boolean }) {
  if (row.status === 'needs_you') return <Chip tone="accent">Needs you</Chip>
  if (row.status === 'waiting') {
    return row.reason ? (
      <Chip tone="warn">Will retry</Chip>
    ) : (
      <span className="text-nx-ink-faint">Next</span>
    )
  }
  if (row.percent !== null) return <span>{`${row.percent}%`}</span>
  if (/play everywhere/i.test(row.step)) return <span>{remote ? 'Mac helper' : 'Converting'}</span>
  if (/listen|reading|learning/i.test(row.step)) return <span>Learning</span>
  return <span>Working</span>
}

export function ProcessingView({ data, server }: { data: ProcessingBoard; server: string }) {
  const { run, busy, error } = useAdminAction()
  const remote = data.helper.mode === 'remote'
  const week = data.week
  const totals = week.reduce(
    (s, d) => ({
      kept: s.kept + d.kept,
      converted: s.converted + d.converted,
      understood: s.understood + d.understood,
    }),
    { kept: 0, converted: 0, understood: 0 },
  )
  const pause = () =>
    void run('pause', '/api/admin/processing', {
      body: { action: data.paused ? 'resume' : 'pause' },
    })
  return (
    <>
      <PageTitle
        title="Processing"
        sub={`What ${server} is downloading, converting and understanding, for everyone.`}
        right={
          <span className="flex flex-wrap gap-2.5">
            <button type="button" className={BTN} disabled={!!busy} onClick={pause}>
              {data.paused ? 'Resume new work' : 'Pause new work'}
            </button>
            <button
              type="button"
              className={PRIMARY_BTN}
              disabled={!!busy}
              onClick={() =>
                void run('retry', '/api/admin/processing', { body: { action: 'retry_failed' } })
              }
            >
              Retry failed
            </button>
          </span>
        }
      />
      {(data.paused || error) && (
        <Card accent className="px-4 py-3 text-sm">
          <span className={error ? 'text-nx-danger' : 'text-nx-accent'}>
            {error ?? 'New work is paused. What’s running finishes; nothing new starts.'}
          </span>
        </Card>
      )}
      <KpiRow>
        <Kpi
          label="On their way"
          value={fmt(data.onTheirWay)}
          foot={data.onTheirWay ? `${fmt(data.keeping)} keeping a copy` : 'All caught up'}
          accent
        />
        <Kpi
          label="Converting"
          value={fmt(data.converting)}
          foot={remote ? 'on the Mac helper' : 'on this server'}
        />
        <Kpi
          label="Learning"
          value={fmt(data.learning.posts)}
          foot={data.learning.kinds.length ? data.learning.kinds.join(' and ') : 'Nothing waiting'}
        />
        <Kpi
          label="Need you"
          value={fmt(data.needYou)}
          foot={data.needYou ? (data.needYouFirst ?? 'Gave up downloading') : 'Nothing stuck'}
          footAccent={data.needYou > 0}
        />
        <Kpi label="Failed" value={fmt(data.failed.total)} foot={retryAt(data.failed.nextAt)} />
        <Kpi
          label="Free disk"
          value={bytesLabel(data.disk.free)}
          foot={`${bytesLabel(data.disk.usedByAdhx)} used by ADHX`}
        />
      </KpiRow>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-stretch">
        <Card className="min-w-0 overflow-hidden">
          <div className="px-4 pb-1.5 pt-3.5">
            <CardHead title="Right now" note="one at a time, newest saves first" />
          </div>
          <TableBox>
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={cn(TH, 'pl-4')}>
                    Post
                  </th>
                  <th scope="col" className={TH}>
                    Step
                  </th>
                  <th scope="col" className={TH}>
                    Progress
                  </th>
                  <th scope="col" className={cn(TH, 'pr-4 text-right')}>
                    State
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.queue.map((r) => (
                  <tr key={`${r.platform}:${r.id}`}>
                    <td className={cn(TD, 'pl-4')}>
                      <Link
                        href={r.openPath}
                        className="flex items-center gap-2.5 text-nx-ink hover:underline"
                      >
                        <Thumb src={r.thumbnail} size={34} radius={9} />
                        <span className="max-w-[190px] truncate font-extrabold">{r.title}</span>
                      </Link>
                    </td>
                    <td className={cn(TD, 'max-w-[160px] truncate text-nx-ink-soft')}>{r.step}</td>
                    <td className={TD}>
                      {r.percent !== null ? (
                        <span
                          aria-hidden
                          className="block h-1.5 w-[100px] overflow-hidden rounded-full bg-nx-plate"
                        >
                          <span
                            className="block h-1.5 bg-nx-accent"
                            style={{ width: `${r.percent}%` }}
                          />
                        </span>
                      ) : (
                        <span className="block w-[100px]" />
                      )}
                    </td>
                    <td className={cn(TD, 'pr-4 text-right')}>
                      <State row={r} remote={remote} />
                    </td>
                  </tr>
                ))}
                {!data.queue.length && (
                  <tr>
                    <td colSpan={4} className={cn(TD, 'pl-4 text-nx-ink-faint')}>
                      Nothing on its way.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableBox>
          {data.queuePrivate > 0 && (
            <p className="m-0 border-t border-white/[0.06] px-4 py-3 text-xs text-nx-ink-faint">
              {`And ${plural(data.queuePrivate, 'Just for me post')} on its way, counted, never listed.`}
            </p>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4 self-start">
          <Card className="flex flex-col gap-2.5 px-[18px] py-4">
            <CardHead title={remote ? 'Mac helper' : 'Where the work runs'} />
            {remote ? (
              <span className="flex flex-wrap items-center gap-x-2 text-[15px] font-extrabold">
                <Dot
                  colour={data.helper.connected ? 'rgb(var(--nx-good))' : 'rgb(var(--nx-danger))'}
                />
                <span>
                  {data.helper.connected
                    ? `Connected${data.helper.name ? ` · ${data.helper.name}` : ''}`
                    : 'Not connected'}
                </span>
                <span
                  className="text-[13px] font-normal text-nx-ink-faint"
                  suppressHydrationWarning
                >
                  {seenAgo(data.helper.lastSeenAt)}
                </span>
              </span>
            ) : (
              <span className="text-sm text-nx-ink-soft">This server does it all itself.</span>
            )}
            <Link href="/admin/system" className="text-[13px] font-extrabold text-nx-accent">
              Health and settings are on System
            </Link>
          </Card>
          <Card className="flex flex-col gap-2 px-[18px] py-4">
            <CardHead title="Done this week" />
            <Bars
              values={week.map((d) => d.kept + d.converted + d.understood)}
              height={54}
              label="Posts kept, converted and understood each day this week"
            />
            <span className="text-xs text-nx-ink-faint">
              {`${fmt(totals.kept)} kept · ${fmt(totals.converted)} converted · ${fmt(totals.understood)} understood`}
            </span>
          </Card>
        </div>
      </div>
    </>
  )
}

'use client'

import type { CheckState, SystemBoard } from '@/lib/admin/boards/system'
import { cn } from '@/lib/utils'
import { CARD, LABEL, bytesLabel, fmt } from './parts'

/**
 * The System page's picture: this server (its processes and queues), the
 * Mac helper it hands work to, and the outside services it calls, each lit
 * by how it's doing.
 */

export const STATE_COLOUR: Record<CheckState, string> = {
  ok: 'rgb(var(--nx-good))',
  warn: 'rgb(var(--nx-warn))',
  bad: 'rgb(var(--nx-danger))',
  off: 'rgb(var(--nx-ink-faint))',
}

const SERVICE_WORD: Record<CheckState, string> = {
  ok: 'Working',
  warn: 'Needs a look',
  bad: 'Not working',
  off: 'Off',
}

function Light({ state, size = 9 }: { state: CheckState; size?: number }) {
  return (
    <span
      aria-hidden
      className="block shrink-0 rounded-full"
      style={{ width: size, height: size, background: STATE_COLOUR[state] }}
    />
  )
}

function Node({
  state,
  title,
  sub,
  dashed,
}: {
  state: CheckState
  title: string
  sub?: string
  dashed?: boolean
}) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-start gap-2 rounded-[14px] px-3 py-2.5',
        dashed ? 'border border-dashed border-white/[0.14]' : 'bg-nx-plate',
      )}
    >
      <span className="mt-[5px]">
        <Light state={state} size={8} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-extrabold">{title}</span>
        {sub && <span className="truncate text-xs text-nx-ink-faint">{sub}</span>}
      </span>
    </span>
  )
}

/** A queue inside the server box: what's left, coloured by its state. */
function QueueNode({ title, left, state }: { title: string; left: number; state: CheckState }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-nx-plate px-3 py-2.5">
      <span className="flex items-center gap-1.5">
        <Light state={state} size={7} />
        <span className="text-xs leading-tight text-nx-ink-faint">{title}</span>
      </span>
      <span
        className="text-[22px] font-extrabold leading-none"
        style={{ color: STATE_COLOUR[state] }}
      >
        {state === 'off' ? 'Off' : fmt(left)}
      </span>
      <span className="text-[11px] text-nx-ink-faint">{state === 'off' ? '' : 'left to do'}</span>
    </span>
  )
}

/** The line between two boxes, with what travels along it. */
function Link({
  state,
  label,
  vertical,
}: {
  state: CheckState
  label: string
  vertical?: boolean
}) {
  const colour = state === 'off' ? 'rgb(var(--nx-ink-faint) / 0.35)' : STATE_COLOUR[state]
  return (
    <span
      className={cn(
        'relative flex items-center justify-center',
        vertical ? 'h-10 w-full' : 'h-full min-h-10 w-full xl:min-w-[120px]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute',
          vertical ? 'inset-y-0 left-1/2 w-0.5' : 'inset-x-0 top-1/2 h-0.5',
        )}
        style={{
          background:
            state === 'off'
              ? `repeating-linear-gradient(${vertical ? '180deg' : '90deg'}, ${colour} 0 6px, transparent 6px 12px)`
              : colour,
        }}
      />
      <span className="relative max-w-[180px] rounded-full bg-nx-surface px-2.5 py-0.5 text-center text-[11px] font-extrabold text-nx-ink-soft">
        {label}
      </span>
    </span>
  )
}

export function SystemMap({ data }: { data: SystemBoard }) {
  const { host, helper } = data
  const queue = (id: string) => data.queues.find((q) => q.id === id)
  const left = (id: string) => {
    const q = queue(id)
    return q ? q.waiting + q.retrying + q.working : 0
  }
  const remote = helper.mode === 'remote'
  const helperState: CheckState = !remote
    ? 'off'
    : helper.setupProblem || !helper.connected || helper.workers[0]?.problem
      ? 'bad'
      : 'ok'
  const forHelper = remote
    ? (queue('conversions')?.waiting ?? 0) + (queue('understanding')?.waiting ?? 0)
    : 0
  const held = helper.workers.reduce((n, w) => n + w.leases, 0)
  const serverState: CheckState = data.checks
    .filter((c) => c.group !== 'Services' && c.id !== 'helper')
    .reduce<CheckState>(
      (worst, c) =>
        c.state === 'bad' || worst === 'bad' ? 'bad' : c.state === 'warn' ? 'warn' : worst,
      'ok',
    )
  const usedMemory = host.memory.total - host.memory.free

  return (
    <section aria-labelledby="system-map" className={cn(CARD, 'flex flex-col gap-4 p-4 md:p-5')}>
      <h3 id="system-map" className="m-0 text-base font-extrabold">
        How it fits together
      </h3>

      <div className="grid grid-cols-[minmax(0,1fr)] items-stretch xl:grid-cols-[minmax(0,1.6fr)_minmax(120px,0.45fr)_minmax(0,1fr)]">
        {/* This server */}
        <div
          className="flex min-w-0 flex-col gap-3 rounded-[18px] border-2 p-3.5"
          style={{ borderColor: `${STATE_COLOUR[serverState]}` }}
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-[7px]">
              <Light state={serverState} size={11} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-lg font-extrabold">{host.label}</span>
              <span className="text-xs text-nx-ink-faint">
                {[
                  host.label !== host.hostname ? host.hostname : null,
                  `${host.cpu} · ${host.cores} cores`,
                  `${bytesLabel(usedMemory)} of ${bytesLabel(host.memory.total)} memory used`,
                  `load ${host.load[0]}`,
                  `${data.server.platform}${host.container ? ', in Docker' : ''}`,
                  `Node ${data.server.node.replace(/^v/, '')}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="ml-auto shrink-0 rounded-full bg-nx-accent/[0.14] px-2.5 py-0.5 text-[11px] font-extrabold text-nx-accent">
              This server
            </span>
          </div>
          <p className={cn(LABEL, 'm-0')}>Running here</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Node state="ok" title="Web app" sub={`${bytesLabel(host.processMemory)} memory`} />
            {data.processes.map((p) => (
              <Node
                key={p.id}
                state={p.state}
                title={p.title}
                sub={p.state === 'off' ? 'Not used' : p.state === 'ok' ? 'Running' : 'Not running'}
                dashed={p.state === 'off'}
              />
            ))}
          </div>
          <p className={cn(LABEL, 'm-0')}>Queues</p>
          <div className="grid grid-cols-3 gap-2">
            <QueueNode
              title="Keeping copies"
              left={left('downloads')}
              state={queue('downloads')?.state ?? 'off'}
            />
            {remote ? (
              <QueueNode
                title="Converting"
                left={left('conversions')}
                state={queue('conversions')?.state ?? 'off'}
              />
            ) : (
              <QueueNode title="Converting" left={0} state="off" />
            )}
            <QueueNode
              title="Understanding"
              left={left('understanding')}
              state={queue('understanding')?.state ?? 'off'}
            />
          </div>
        </div>

        {/* The link to the Mac */}
        <div className="flex items-center justify-center">
          <span className="hidden w-full xl:flex">
            <Link
              state={helperState}
              label={remote ? `${fmt(forHelper)} waiting · ${fmt(held)} working` : 'not used'}
            />
          </span>
          <span className="flex w-full xl:hidden">
            <Link
              vertical
              state={helperState}
              label={remote ? `${fmt(forHelper)} waiting · ${fmt(held)} working` : 'not used'}
            />
          </span>
        </div>

        {/* The Mac helper */}
        <div
          className={cn(
            'flex min-w-0 flex-col gap-2.5 rounded-[18px] border-2 p-3.5',
            !remote && 'border-dashed',
          )}
          style={{ borderColor: remote ? STATE_COLOUR[helperState] : 'rgb(255 255 255 / 0.14)' }}
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-[7px]">
              <Light state={helperState} size={11} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-lg font-extrabold">Mac helper</span>
              <span className="text-xs text-nx-ink-faint">
                {!remote
                  ? 'Optional · this server does the work itself'
                  : helper.setupProblem
                    ? 'This server can’t take a helper yet'
                    : helper.connected
                      ? helper.workers[0]?.problem
                        ? 'Connected, but refused work'
                        : 'Connected'
                      : 'Not connected'}
              </span>
            </span>
          </div>
          {remote && (
            <>
              <span className="text-[13px] text-nx-ink-soft">
                Converts videos so they play everywhere, and understands pictures, video, speech and
                text on screen.
              </span>
              {helper.workers.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {helper.workers.map((w) => (
                    <li key={w.workerId}>
                      <Node
                        state={w.problem ? 'bad' : helper.connected ? 'ok' : 'off'}
                        title={w.workerId}
                        sub={`${fmt(w.leases)} job${w.leases === 1 ? '' : 's'} now`}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-[13px] text-nx-ink-faint">
                  No helper has asked for work since this server started.
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Outside services */}
      <div className="flex flex-col gap-2">
        <p className={cn(LABEL, 'm-0')}>Services and tools it uses</p>
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 xl:grid-cols-6">
          {data.services.map((s) => (
            <li key={s.id} className="min-w-0">
              <Node
                state={s.state}
                title={s.name}
                sub={SERVICE_WORD[s.state]}
                dashed={s.state === 'off'}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

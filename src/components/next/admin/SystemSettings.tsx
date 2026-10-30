'use client'

import { useId, useRef, useState } from 'react'
import type { SettingGroupView, SettingView } from '@/lib/admin/boards/system'
import type { ExtraView } from '@/lib/settings/extras'
import { cn } from '@/lib/utils'
import { useAdminAction } from './actions'
import { BTN_SM, Card, CardHead, FIELD, FIELD_INPUT, PRIMARY_SM } from './parts'

/**
 * Admin → System's settings: every one once, a tab per group. Rows with
 * Change apply in a few seconds and beat the server's environment; the rest
 * are read when ADHX starts, so they're changed in the environment.
 */

const SOURCE: Record<SettingView['source'], string> = {
  admin: 'Set here',
  env: 'Environment',
  default: 'Default',
}

function Editor({ edit, onDone }: { edit: ExtraView; onDone: () => void }) {
  const { run, busy, error } = useAdminAction()
  const [value, setValue] = useState(edit.value ?? '')
  const id = `setting-${edit.name}`

  const save = async (next: string | null) => {
    const done = await run(edit.name, '/api/admin/system', {
      body: { action: 'set', name: edit.name, value: next },
    })
    if (done) onDone()
  }

  return (
    <form
      className="flex flex-col gap-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault()
        void save(value)
      }}
    >
      <label htmlFor={id} className="sr-only">
        {edit.label}
      </label>
      <span className="flex flex-wrap gap-2">
        <span
          className={cn(
            FIELD,
            'min-w-0 flex-1 basis-[220px]',
            // A cookies.txt is many lines: a box, the width of the row.
            edit.kind === 'cookies' && 'h-auto basis-full items-stretch rounded-[16px] py-1',
          )}
        >
          {edit.kind === 'cookies' ? (
            <textarea
              id={id}
              rows={6}
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="# Netscape HTTP Cookie File"
              className={cn(FIELD_INPUT, 'min-h-[132px] resize-y py-2 font-mono sm:text-[12px]')}
              autoFocus
            />
          ) : edit.kind === 'choice' ? (
            <select
              id={id}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={cn(FIELD_INPUT, 'cursor-pointer')}
              autoFocus
            >
              {edit.choices?.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={id}
              type={
                edit.kind === 'secret' ? 'password' : edit.kind === 'number' ? 'number' : 'text'
              }
              inputMode={edit.kind === 'number' ? 'decimal' : undefined}
              min={edit.min ?? undefined}
              max={edit.max ?? undefined}
              step="any"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={edit.kind === 'secret' ? 'Paste the new one' : ''}
              className={FIELD_INPUT}
              autoFocus
            />
          )}
        </span>
        {edit.kind === 'cookies' && <CookiesFile onRead={setValue} />}
        <button
          type="submit"
          className={PRIMARY_SM}
          disabled={
            !!busy ||
            !value.trim() ||
            (edit.kind !== 'secret' && edit.kind !== 'cookies' && value === edit.value)
          }
        >
          Save
        </button>
        <button type="button" className={BTN_SM} disabled={!!busy} onClick={onDone}>
          Cancel
        </button>
        {edit.source === 'admin' && (
          <button
            type="button"
            className={BTN_SM}
            disabled={!!busy}
            onClick={() => void save(null)}
          >
            {edit.inEnv ? 'Use the environment’s' : 'Back to default'}
          </button>
        )}
      </span>
      {error && (
        <span className="text-[13px] text-nx-danger" role="status">
          {error}
        </span>
      )}
    </form>
  )
}

/** "Choose a file": reads a cookies.txt into the box (it never leaves the page until Save). */
function CookiesFile({ onRead }: { onRead: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".txt,text/plain"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void file.text().then(onRead)
          e.target.value = ''
        }}
      />
      <button type="button" className={BTN_SM} onClick={() => input.current?.click()}>
        Choose a file
      </button>
    </>
  )
}

function Row({ row }: { row: SettingView }) {
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const edit = row.edit
  return (
    <li className="flex flex-col gap-1 border-t border-white/[0.06] px-[18px] py-2.5">
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-extrabold">{row.label}</span>
          {row.name && (
            <span className="break-all font-mono text-[11px] text-nx-ink-faint">{row.name}</span>
          )}
        </span>
        <span className="flex min-w-0 shrink-0 items-center gap-3">
          <span className="flex min-w-0 flex-col items-end text-right">
            <span className="max-w-[220px] break-all text-sm font-extrabold sm:max-w-[320px]">
              {row.value}
            </span>
            <span
              className={cn(
                'text-[11px]',
                row.source === 'admin' ? 'text-nx-good' : 'text-nx-ink-faint',
              )}
            >
              {row.note ?? SOURCE[row.source]}
            </span>
          </span>
          {edit && !editing && (
            <button
              type="button"
              className={BTN_SM}
              onClick={() => {
                setSaved(false)
                setEditing(true)
              }}
              aria-label={`Change ${row.label}`}
            >
              Change
            </button>
          )}
        </span>
      </span>
      {edit && <span className="text-[13px] text-nx-ink-faint">{edit.help}</span>}
      {edit && editing && (
        <Editor
          edit={edit}
          onDone={() => {
            setEditing(false)
            setSaved(true)
          }}
        />
      )}
      {saved && !editing && (
        <span className="text-[13px] text-nx-good" role="status">
          Saved. In use within a few seconds.
        </span>
      )}
    </li>
  )
}

function TestButton({ service }: { service: 'jev' | 'email' }) {
  const { run, busy } = useAdminAction()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const test = async () => {
    setResult(null)
    const r = await run(`test-${service}`, '/api/admin/system', {
      body: { action: 'test', service },
    })
    if (!r) return
    setResult(
      r.ok
        ? {
            ok: true,
            text:
              service === 'jev'
                ? `Jev answered in ${r.ms} ms.`
                : 'Sent. Check your inbox (and spam).',
          }
        : { ok: false, text: `It didn’t work: ${String(r.error)}.` },
    )
  }
  return (
    <span className="flex flex-wrap items-center justify-end gap-2.5">
      {result && (
        <span
          role="status"
          className={cn('text-[13px]', result.ok ? 'text-nx-good' : 'text-nx-danger')}
        >
          {result.text}
        </span>
      )}
      <button type="button" className={BTN_SM} disabled={!!busy} onClick={() => void test()}>
        {busy ? 'Testing…' : service === 'jev' ? 'Test Jev' : 'Send me a test email'}
      </button>
    </span>
  )
}

/** "Keeping copies" → "keeping-copies", for the tab ids. */
const slug = (group: string) => group.toLowerCase().replace(/[^a-z0-9]+/g, '-')

export function SystemSettings({ groups }: { groups: SettingGroupView[] }) {
  const [active, setActive] = useState(groups[0]?.group)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const base = useId()
  const current = groups.find((g) => g.group === active) ?? groups[0]
  // Arrow keys move along the tabs, as a tab list should.
  const move = (from: number, by: number) => {
    const next = (from + by + groups.length) % groups.length
    setActive(groups[next].group)
    tabs.current[next]?.focus()
  }
  return (
    <Card className="min-w-0 overflow-hidden" as="section" labelledBy="system-settings">
      <div className="flex flex-col gap-3 px-[18px] pb-3 pt-4">
        <CardHead id="system-settings" title="Settings" />
        <p className="m-0 text-[13px] text-nx-ink-faint">
          Change applies in seconds and beats the environment. The rest are read at start.
        </p>
        <div
          role="tablist"
          aria-label="Settings"
          className="flex w-max max-w-full gap-0.5 overflow-x-auto rounded-full bg-nx-bg p-1"
        >
          {groups.map((g, i) => {
            const on = g.group === current?.group
            return (
              <button
                key={g.group}
                ref={(el) => {
                  tabs.current[i] = el
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${slug(g.group)}`}
                aria-selected={on}
                aria-controls={`${base}-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(g.group)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') move(i, 1)
                  else if (e.key === 'ArrowLeft') move(i, -1)
                  else return
                  e.preventDefault()
                }}
                className={cn(
                  'flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-sm',
                  on
                    ? 'bg-nx-cream font-extrabold text-nx-on-cream'
                    : 'font-semibold text-nx-ink-soft hover:text-nx-ink',
                )}
              >
                <span>{g.group}</span>
              </button>
            )
          })}
        </div>
      </div>
      {current && (
        <div
          role="tabpanel"
          id={`${base}-panel`}
          aria-labelledby={`${base}-tab-${slug(current.group)}`}
        >
          {current.test && (
            <div className="flex justify-end border-t border-white/[0.06] px-[18px] py-2.5">
              <TestButton service={current.test} />
            </div>
          )}
          <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-x-2 p-0 xl:grid-cols-2">
            {current.rows.map((r) => (
              <Row key={r.label} row={r} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

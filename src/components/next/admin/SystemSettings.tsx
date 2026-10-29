'use client'

import { useState } from 'react'
import type { SettingGroupView, SettingView } from '@/lib/admin/boards/system'
import type { ExtraView } from '@/lib/settings/extras'
import { cn } from '@/lib/utils'
import { useAdminAction } from './actions'
import { BTN_SM, Card, CardHead, FIELD, FIELD_INPUT, LABEL, PRIMARY_SM } from './parts'

/**
 * Admin → System's settings: every one once. Rows with Change apply in a few
 * seconds and beat the server's environment; the rest are read when ADHX
 * starts, so they're changed in the environment.
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
        <span className={cn(FIELD, 'min-w-0 flex-1 basis-[220px]')}>
          {edit.kind === 'choice' ? (
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
        <button
          type="submit"
          className={PRIMARY_SM}
          disabled={!!busy || !value.trim() || (edit.kind !== 'secret' && value === edit.value)}
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

export function SystemSettings({ groups }: { groups: SettingGroupView[] }) {
  return (
    <Card className="min-w-0 overflow-hidden" as="section" labelledBy="system-settings">
      <div className="flex flex-col gap-1 px-[18px] pb-3 pt-4">
        <CardHead id="system-settings" title="Settings" />
        <p className="m-0 text-[13px] text-nx-ink-faint">
          Anything with Change applies in a few seconds, no restart, and beats the server’s
          environment. The rest are read when ADHX starts: change those in the environment and
          restart. Keys are stored encrypted and never shown again.
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-2 xl:grid-cols-2">
        {groups.map((g) => (
          <div key={g.group} className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-white/[0.06] px-[18px] py-2.5">
              <p className={cn(LABEL, 'm-0')}>{g.group}</p>
              {g.test && <TestButton service={g.test} />}
            </div>
            <ul className="m-0 list-none p-0">
              {g.rows.map((r) => (
                <Row key={r.label} row={r} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}

'use client'

import { useState } from 'react'
import type { SystemBoard } from '@/lib/admin/boards/system'
import { cn } from '@/lib/utils'
import { useAdminAction } from './actions'
import { BTN_SM, Card, CardHead, FIELD, FIELD_INPUT, PRIMARY_SM } from './parts'

type Extra = SystemBoard['extras'][number]

/**
 * Optional extras an admin can switch on here instead of in the server's
 * environment: Jev, email for sign-in links, the X app and a server name.
 * A variable set in the environment wins and shows here read-only.
 */

const GROUPS: { title: string; note: string; names: Extra['name'][]; test?: 'jev' | 'email' }[] = [
  {
    title: 'Jev',
    note: 'smarter search, channel and moment names',
    names: ['TYPESAFE_API_KEY', 'TYPESAFE_CHANNEL_IMAGES'],
    test: 'jev',
  },
  {
    title: 'Email',
    note: 'sign-in links by email',
    names: ['RESEND_API_KEY', 'SMTP_URL', 'EMAIL_FROM'],
    test: 'email',
  },
  {
    title: 'X',
    note: 'bring in X bookmarks',
    names: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'],
  },
  { title: 'This server', note: 'what the System page calls it', names: ['SERVER_LABEL'] },
]

function ExtraRow({ extra }: { extra: Extra }) {
  const { run, busy, error } = useAdminAction()
  const [value, setValue] = useState(extra.secret ? '' : (extra.value ?? ''))
  const [saved, setSaved] = useState(false)
  const id = `extra-${extra.name}`

  const save = async (next: string | null) => {
    setSaved(false)
    const done = await run(extra.name, '/api/admin/system', {
      body: { action: 'set', name: extra.name, value: next },
    })
    if (done) {
      setSaved(true)
      if (extra.secret || next === null) setValue('')
    }
  }

  return (
    <li className="flex flex-col gap-1.5 border-t border-white/[0.06] px-[18px] py-3">
      <span className="flex flex-wrap items-baseline gap-x-2">
        <label htmlFor={id} className="text-sm font-extrabold">
          {extra.label}
        </label>
        <span className="font-mono text-[11px] text-nx-ink-faint">{extra.name}</span>
        <span
          className={cn(
            'ml-auto text-xs font-extrabold',
            extra.source ? 'text-nx-good' : 'text-nx-ink-faint',
          )}
        >
          {extra.source === 'env'
            ? 'Set in the environment'
            : extra.source === 'admin'
              ? 'Set here'
              : 'Not set'}
        </span>
      </span>
      <span className="text-[13px] text-nx-ink-faint">{extra.help}</span>
      {extra.source === 'env' ? (
        <span className="text-[13px] text-nx-ink-soft">
          {extra.secret
            ? 'The server’s environment sets this, so it’s changed there.'
            : `${extra.value ?? ''} · change it in the server’s environment.`}
        </span>
      ) : (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save(value)
          }}
        >
          <span className={cn(FIELD, 'min-w-0 flex-1 basis-[220px]')}>
            {extra.name === 'TYPESAFE_CHANNEL_IMAGES' ? (
              <select
                id={id}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  setSaved(false)
                }}
                className={cn(FIELD_INPUT, 'cursor-pointer')}
              >
                <option value="">Choose</option>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            ) : (
              <input
                id={id}
                type={extra.secret ? 'password' : 'text'}
                autoComplete="off"
                spellCheck={false}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  setSaved(false)
                }}
                placeholder={
                  extra.secret && extra.source === 'admin' ? 'Saved · type to replace' : ''
                }
                className={FIELD_INPUT}
              />
            )}
          </span>
          <button
            type="submit"
            className={PRIMARY_SM}
            disabled={!!busy || !value.trim() || (!extra.secret && value === (extra.value ?? ''))}
          >
            Save
          </button>
          {extra.source === 'admin' && (
            <button
              type="button"
              className={BTN_SM}
              disabled={!!busy}
              onClick={() => void save(null)}
            >
              Clear
            </button>
          )}
        </form>
      )}
      {(error || saved) && (
        <span
          className={cn('text-[13px]', error ? 'text-nx-danger' : 'text-nx-good')}
          role="status"
        >
          {error ?? 'Saved. It’s in use now.'}
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
    <span className="flex flex-wrap items-center gap-2.5">
      <button type="button" className={BTN_SM} disabled={!!busy} onClick={() => void test()}>
        {busy ? 'Testing…' : service === 'jev' ? 'Test Jev' : 'Send me a test email'}
      </button>
      {result && (
        <span
          role="status"
          className={cn('text-[13px]', result.ok ? 'text-nx-good' : 'text-nx-danger')}
        >
          {result.text}
        </span>
      )}
    </span>
  )
}

export function SystemExtras({ extras }: { extras: SystemBoard['extras'] }) {
  const byName = new Map(extras.map((e) => [e.name, e]))
  return (
    <Card className="min-w-0 overflow-hidden" as="section" labelledBy="system-extras">
      <div className="flex flex-col gap-1 px-[18px] pb-2 pt-4">
        <CardHead id="system-extras" title="Optional extras" />
        <p className="m-0 text-[13px] text-nx-ink-faint">
          Things you can switch on now, even if you didn’t know about them when you set ADHX up.
          Keys are stored encrypted and never shown again. A setting in the server’s environment
          always wins.
        </p>
      </div>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/[0.06] bg-white/[0.02] px-[18px] py-2.5">
            <span className="text-[15px] font-extrabold">{g.title}</span>
            <span className="text-xs text-nx-ink-faint">{g.note}</span>
            {g.test && (
              <span className="ml-auto">
                <TestButton service={g.test} />
              </span>
            )}
          </div>
          <ul className="m-0 list-none p-0">
            {g.names.map((name) => {
              const e = byName.get(name)
              return e ? <ExtraRow key={name} extra={e} /> : null
            })}
          </ul>
        </div>
      ))}
    </Card>
  )
}

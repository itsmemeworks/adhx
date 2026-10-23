'use client'

import Link from 'next/link'
import type { PostsBoard } from '@/lib/admin/boards/posts'
import { useAdminAction } from './actions'
import { PostLookup } from './PostLookup'
import {
  BTN_SM,
  Card,
  CardHead,
  Kpi,
  KpiRow,
  MeterRow,
  PageTitle,
  RangeSwitch,
  Thumb,
  bytesLabel,
  fmt,
  plural,
} from './parts'

const KIND_COLOURS = { video: '#ffd23f', photo: '#ff8fa3', text: '#6b8cff', article: '#7fd1ae' }
const KIND_LABELS = { video: 'Videos', photo: 'Photos', text: 'Text', article: 'Articles' }

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s
}

function gb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1)
}

export function PostsView({ data }: { data: PostsBoard }) {
  const { run, busy } = useAdminAction()
  const maxNet = Math.max(1, ...data.networks.map((n) => n.posts))
  const kindTotal = Math.max(
    1,
    Object.values(data.kinds).reduce((s, n) => s + n, 0),
  )
  return (
    <>
      <PageTitle
        title="Posts"
        sub={`${plural(data.posts, 'post')} kept on this box, from ${plural(data.saves, 'save')}. Kinds and counts include Just for me saves.`}
        right={<RangeSwitch path="/admin/posts" active={data.range} />}
      />
      <KpiRow>
        <Kpi
          label="Posts"
          value={fmt(data.posts)}
          foot={`${fmt(data.multiSaved)} saved by 2 or more`}
        />
        <Kpi
          label="Kept"
          value={fmt(data.kept)}
          foot={data.keptPct === null ? 'Nothing saved yet' : `${data.keptPct}% of posts`}
          accent
        />
        <Kpi
          label="On their way"
          value={fmt(data.onTheirWay.total)}
          foot={
            data.onTheirWay.total
              ? [
                  data.onTheirWay.keeping ? `${data.onTheirWay.keeping} keeping` : null,
                  data.onTheirWay.converting ? `${data.onTheirWay.converting} converting` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'All caught up'
          }
        />
        <Kpi
          label="Need you"
          value={fmt(data.needYou.total)}
          foot={data.needYou.first ? lowerFirst(data.needYou.first) : 'Nothing stuck'}
          footAccent={data.needYou.total > 0}
        />
        <Kpi label="Gone upstream" value={fmt(data.gone)} foot="still play from here" />
        <Kpi
          label="Storage"
          value={bytesLabel(data.storage.bytes)}
          foot={`videos ${gb(data.storage.videoBytes)} · photos ${gb(data.storage.photoBytes)}`}
        />
      </KpiRow>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] xl:items-stretch">
        <Card className="flex flex-col gap-2.5 self-stretch px-[18px] py-4">
          <CardHead title="By network" />
          <ul className="m-0 flex list-none flex-col gap-[7px] p-0">
            {data.networks.map((n) => (
              <MeterRow
                key={n.platform}
                label={n.label}
                value={n.posts}
                pct={(n.posts / maxNet) * 100}
                colour={n.colour}
              />
            ))}
          </ul>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-3 px-[18px] py-4">
            <CardHead title="By kind" />
            <div aria-hidden className="flex h-3.5 overflow-hidden rounded-full bg-nx-plate">
              {(Object.keys(KIND_COLOURS) as (keyof typeof KIND_COLOURS)[]).map((k) => (
                <span
                  key={k}
                  style={{
                    width: `${(data.kinds[k] / kindTotal) * 100}%`,
                    background: KIND_COLOURS[k],
                  }}
                />
              ))}
            </div>
            <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1.5 p-0 text-[13px]">
              {(Object.keys(KIND_COLOURS) as (keyof typeof KIND_COLOURS)[]).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="block h-2.5 w-2.5 rounded-[3px]"
                    style={{ background: KIND_COLOURS[k] }}
                  />
                  <span>{`${KIND_LABELS[k]} ${fmt(data.kinds[k])}`}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="flex flex-col gap-2.5 px-[18px] py-4">
            <CardHead title="Understood, for search" />
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {data.understood.map((u) => {
                const pct = u.total ? Math.round((u.done / u.total) * 100) : 0
                return (
                  <MeterRow
                    key={u.id}
                    label={u.label}
                    value={u.done}
                    pct={pct}
                    colour="#7fd1ae"
                    labelWidth={96}
                    valueText={u.total ? `${pct}%` : '—'}
                  />
                )
              })}
            </ul>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-3 px-[18px] py-4">
            <div className="flex items-center">
              <h3 className="m-0 text-base font-extrabold">Needs attention</h3>
              <Link
                href="/admin/processing"
                className="ml-auto text-[13px] font-extrabold text-nx-accent underline hover:text-nx-ink"
              >
                All of it
              </Link>
            </div>
            {data.attention.length ? (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {data.attention.slice(0, 3).map((a) => (
                  <li
                    key={`${a.post.platform}:${a.post.id}`}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <Thumb src={a.post.thumbnail} size={40} radius={10} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-extrabold">{a.post.title}</span>
                      <span
                        className="truncate text-xs"
                        style={{
                          color:
                            a.state === 'needs_you'
                              ? '#ffd23f'
                              : a.state === 'failed'
                                ? '#ffb59a'
                                : '#c9bfab',
                        }}
                      >
                        {a.why}
                      </span>
                    </span>
                    {a.state === 'converting' ? (
                      <Link href="/admin/processing" className={BTN_SM}>
                        Details
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={BTN_SM}
                        disabled={!!busy}
                        title={
                          a.state === 'needs_you' ? 'Try once more, whoever saved it' : undefined
                        }
                        onClick={() =>
                          void run(`retry:${a.post.id}`, '/api/admin/processing', {
                            body: { action: 'retry', platform: a.post.platform, id: a.post.id },
                          })
                        }
                      >
                        {a.state === 'needs_you' ? 'Fix' : 'Retry'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm text-nx-ink-faint">Nothing needs you.</p>
            )}
            {data.attentionPrivate > 0 && (
              <span className="text-xs text-nx-ink-faint">
                {`And ${plural(data.attentionPrivate, 'Just for me post')}, counted, never listed.`}
              </span>
            )}
          </Card>
          <Card className="flex flex-col gap-2.5 px-[18px] py-4">
            <CardHead title="Find a post" />
            <PostLookup hint="Shows who saved it, its files and its status. Hiding removes it from every public page." />
          </Card>
        </div>
      </div>
    </>
  )
}

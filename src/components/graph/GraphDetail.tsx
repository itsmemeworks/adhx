'use client'

/**
 * Knowledge Graph — detail panel.
 *
 * Two branches (item / hub), navigated in place via `onNavigate` (no remount,
 * so the panel's entrance animation never replays). Item: type badge + read
 * toggle + editable title + post card + open/bookmark + tags + note + navigable
 * relation sections. Hub: editable name + icon picker + member list. Every
 * relation row/chip navigates; sections render only when non-empty.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, Check, ChevronRight, ExternalLink, Link2, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GraphIcon } from './icons'
import {
  READ_GREEN,
  THEME_ICON_KEYS,
  TYPE_COLORS,
  type ContentType,
  type GraphData,
  type GraphSave,
  type GraphTheme,
} from './types'
import type { GraphMetaStore } from './useGraphMeta'
import { GraphPostCard } from './GraphPostCard'

const PLATFORM_LABEL: Record<string, string> = {
  twitter: 'X',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
}

interface GraphDetailProps {
  selectedKey: string
  data: GraphData
  meta: GraphMetaStore
  onClose: () => void
  onNavigate: (key: string) => void
}

/**
 * Editable save title styled as a heading. A `<textarea>` (not an `<input>`)
 * so long titles wrap to 2 lines instead of hard-clipping at the narrow panel
 * edge; auto-grows to fit content. Enter commits (blurs) rather than inserting
 * a newline. Cross-browser (manual scrollHeight resize, no `field-sizing`).
 */
function TitleField({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder: string
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      title="Rename this save"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      className="mb-3.5 block w-full resize-none overflow-hidden border-0 border-b-[1.5px] border-hairline bg-transparent px-0.5 pb-[7px] font-serif text-[19px] font-semibold leading-snug text-ink outline-none focus:border-clay"
    />
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-[18px] mb-2 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">
      {children}
    </div>
  )
}

function RelRow({
  type,
  label,
  read,
  right,
  onClick,
}: {
  type: ContentType | 'hub'
  label: string
  read?: boolean
  right?: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[10px] border-none bg-inset px-2.5 py-2 text-left transition-colors hover:bg-clay/10"
    >
      <span
        className="h-[9px] w-[9px] flex-none rounded-full"
        style={{ background: type === 'hub' ? 'var(--m-accent)' : TYPE_COLORS[type] }}
      />
      <span className="flex-1 truncate text-[13px] font-medium text-ink">{label}</span>
      {read && <Check className="h-3.5 w-3.5 flex-none" style={{ color: READ_GREEN }} />}
      {right}
      <ChevronRight className="h-[15px] w-[15px] flex-none text-ink-3" />
    </button>
  )
}

export function GraphDetail({ selectedKey, data, meta, onClose, onNavigate }: GraphDetailProps) {
  const [tagInput, setTagInput] = useState('')

  const { saveByKey, themeById } = useMemo(() => {
    const s = new Map<string, GraphSave>()
    for (const save of data.saves) s.set(save.key, save)
    const t = new Map<string, GraphTheme>()
    for (const theme of data.themes) t.set(theme.id, theme)
    return { saveByKey: s, themeById: t }
  }, [data])

  const theme = themeById.get(selectedKey)
  const save = saveByKey.get(selectedKey)

  // ---------- HUB branch ----------
  if (theme) {
    const hm = meta.hubMeta(theme.id)
    const name = hm.name != null ? hm.name : theme.label
    const icon = hm.icon || ''
    const members = data.relations
      .filter((r) => r.kind === 'topic' && r.to === theme.id)
      .map((r) => saveByKey.get(r.from))
      .filter((x): x is GraphSave => !!x)

    return (
      <div className="px-5 pb-6 pt-[18px]">
        <div className="mb-3.5 flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">
            Theme
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex border-none bg-transparent p-1 text-ink-3"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="mb-3.5 flex items-center gap-3.5">
          <div className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[15px] bg-clay-grad shadow-glow">
            <GraphIcon d={icon || 'layers'} size={24} color="#fff" />
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => meta.setHub(theme.id, { name: e.target.value })}
              placeholder="Theme name"
              className="w-full border-0 border-b-[1.5px] border-hairline bg-transparent px-0.5 py-0.5 font-serif text-[22px] font-semibold text-ink outline-none focus:border-clay"
            />
            <div className="mt-1 text-[12px] text-ink-3">
              {members.length} {members.length === 1 ? 'save' : 'saves'} · rename or repick the icon
            </div>
          </div>
        </div>

        <SectionLabel>Theme icon</SectionLabel>
        <div className="mb-[18px] grid grid-cols-8 gap-1.5">
          {THEME_ICON_KEYS.map((ic) => {
            const on = icon === ic
            return (
              <button
                key={ic}
                onClick={() => meta.setHub(theme.id, { icon: on ? '' : ic })}
                title={ic}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-[10px] border',
                  on ? 'border-clay bg-clay/[0.14]' : 'border-hairline bg-inset',
                )}
              >
                <GraphIcon d={ic} size={17} color={on ? 'var(--m-accent)' : 'var(--m-ink2)'} />
              </button>
            )
          })}
        </div>

        <SectionLabel>Saves in this theme</SectionLabel>
        <div className="flex flex-col gap-[7px]">
          {members.map((m) => (
            <RelRow
              key={m.key}
              type={m.type}
              label={meta.itemMeta(m.key).title || m.label}
              read={!!meta.itemMeta(m.key).read}
              right={<span className="flex-none text-[11px] capitalize text-ink-3">{m.type}</span>}
              onClick={() => onNavigate(m.key)}
            />
          ))}
        </div>
      </div>
    )
  }

  if (!save) return null

  // ---------- ITEM branch ----------
  const im = meta.itemMeta(save.key)
  const read = !!im.read
  const tags = im.tags || []
  const note = im.note || ''
  const title = im.title != null ? im.title : save.label
  const label = (s: GraphSave) => meta.itemMeta(s.key).title || s.label

  const relHubs = data.relations
    .filter((r) => r.kind === 'topic' && r.from === save.key)
    .map((r) => themeById.get(r.to))
    .filter((x): x is GraphTheme => !!x)

  const connectedItems = data.relations
    .filter((r) => r.kind === 'related' && (r.from === save.key || r.to === save.key))
    .map((r) => saveByKey.get(r.from === save.key ? r.to : r.from))
    .filter((x): x is GraphSave => !!x)

  const sameAuthor = save.handle
    ? data.saves.filter((s) => s.key !== save.key && s.handle === save.handle)
    : []

  const tagPeers: { save: GraphSave; tag: string }[] = []
  if (tags.length) {
    for (const s of data.saves) {
      if (s.key === save.key) continue
      const theirs = meta.itemMeta(s.key).tags || []
      const shared = tags.find((t) => theirs.includes(t))
      if (shared) tagPeers.push({ save: s, tag: shared })
    }
  }

  const myLinkItems = meta.links
    .map((l) => {
      const a = `${l.a.platform}:${l.a.id}`
      const b = `${l.b.platform}:${l.b.id}`
      if (a === save.key) return saveByKey.get(b)
      if (b === save.key) return saveByKey.get(a)
      return undefined
    })
    .filter((x): x is GraphSave => !!x)

  const addTag = () => {
    const v = tagInput.trim()
    if (v) meta.addTag(save.key, v)
    setTagInput('')
  }

  return (
    <div className="px-5 pb-[26px] pt-[15px]">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-white"
          style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: TYPE_COLORS[save.type] }}
        >
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{ background: TYPE_COLORS[save.type] }}
          />
          {save.type}
        </span>
        <button
          onClick={() => meta.setRead(save.key, !read)}
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-full border py-[5px] pl-2.5 pr-3 text-[12.5px] font-bold transition-colors',
            read ? 'border-transparent text-white' : 'border-hairline bg-inset text-ink-2',
          )}
          style={read ? { background: READ_GREEN } : undefined}
        >
          {read ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <span className="inline-block h-[13px] w-[13px] rounded-full border-[1.8px] border-ink-3" />
          )}
          {read ? 'Read' : 'Mark read'}
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex border-none bg-transparent p-1 text-ink-3"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      <TitleField
        value={title}
        placeholder={save.label}
        onChange={(v) => meta.setTitle(save.key, v)}
      />

      <GraphPostCard key={save.key} card={save.card} />

      <div className="mt-3.5 flex gap-2">
        <a
          href={save.openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-clay-grad px-3.5 py-2.5 text-[13.5px] font-semibold text-white shadow-glow"
        >
          Open on {PLATFORM_LABEL[save.platform] || 'source'}
          <ExternalLink className="h-[15px] w-[15px]" />
        </a>
        <a
          href={save.openUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open original"
          className="inline-flex items-center justify-center rounded-[11px] border border-hairline bg-inset px-3.5 py-2.5 text-ink-2"
        >
          <Bookmark className="h-[15px] w-[15px]" />
        </a>
      </div>

      <SectionLabel>Tags</SectionLabel>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-clay/[0.13] py-[5px] pl-3 pr-1.5 text-[12.5px] font-semibold text-clay"
          >
            #{t}
            <button
              onClick={() => meta.removeTag(save.key, t)}
              aria-label={`Remove tag ${t}`}
              className="flex border-none bg-transparent p-0 text-clay"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-hairline bg-inset px-3 py-1">
          <Plus className="h-3 w-3 text-ink-3" />
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder="Add tag"
            size={8}
            className="w-16 border-none bg-transparent text-base font-semibold text-ink outline-none sm:text-[12.5px]"
          />
        </span>
      </div>

      <SectionLabel>Your note</SectionLabel>
      <textarea
        value={note}
        onChange={(e) => meta.setNote(save.key, e.target.value)}
        placeholder="Why you saved it, where it fits, what to do next…"
        rows={3}
        className="w-full resize-y rounded-[11px] border border-hairline bg-inset px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none focus:border-clay"
      />

      {relHubs.length > 0 && (
        <>
          <SectionLabel>Themes</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {relHubs.map((h) => {
              const hm = meta.hubMeta(h.id)
              return (
                <button
                  key={h.id}
                  onClick={() => onNavigate(h.id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-clay/[0.12] px-3 py-[5px] text-[12.5px] font-semibold text-clay"
                >
                  <GraphIcon d={hm.icon || 'layers'} size={13} color="var(--m-accent)" />
                  {hm.name != null ? hm.name : h.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {sameAuthor.length > 0 && (
        <>
          <SectionLabel>More from {save.handle}</SectionLabel>
          <div className="flex flex-col gap-[7px]">
            {sameAuthor.map((m) => (
              <RelRow
                key={m.key}
                type={m.type}
                label={label(m)}
                read={!!meta.itemMeta(m.key).read}
                onClick={() => onNavigate(m.key)}
              />
            ))}
          </div>
        </>
      )}

      {connectedItems.length > 0 && (
        <>
          <SectionLabel>Connected ideas</SectionLabel>
          <div className="flex flex-col gap-[7px]">
            {connectedItems.map((m) => (
              <RelRow
                key={m.key}
                type={m.type}
                label={label(m)}
                read={!!meta.itemMeta(m.key).read}
                onClick={() => onNavigate(m.key)}
              />
            ))}
          </div>
        </>
      )}

      {tagPeers.length > 0 && (
        <>
          <SectionLabel>Shares a tag</SectionLabel>
          <div className="flex flex-col gap-[7px]">
            {tagPeers.map(({ save: m, tag }) => (
              <RelRow
                key={m.key}
                type={m.type}
                label={label(m)}
                read={!!meta.itemMeta(m.key).read}
                right={
                  <span className="flex-none text-[11px] font-semibold text-clay">#{tag}</span>
                }
                onClick={() => onNavigate(m.key)}
              />
            ))}
          </div>
        </>
      )}

      {myLinkItems.length > 0 && (
        <>
          <div className="mt-[18px] mb-2 flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" style={{ color: 'var(--m-accent2)' }} />
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">
              Your links
            </span>
          </div>
          <div className="flex flex-col gap-[7px]">
            {myLinkItems.map((m) => (
              <div
                key={m.key}
                className="flex items-center gap-2.5 rounded-[10px] bg-inset py-1.5 pl-2.5 pr-2"
              >
                <span
                  className="h-[9px] w-[9px] flex-none rounded-full"
                  style={{ background: TYPE_COLORS[m.type] }}
                />
                <button
                  onClick={() => onNavigate(m.key)}
                  className="flex min-w-0 flex-1 items-center gap-2 border-none bg-transparent p-0 text-left"
                >
                  <span className="truncate text-[13px] font-medium text-ink">{label(m)}</span>
                  {!!meta.itemMeta(m.key).read && (
                    <Check className="h-3.5 w-3.5 flex-none" style={{ color: READ_GREEN }} />
                  )}
                </button>
                <button
                  onClick={() => meta.removeLink(save.key, m.key)}
                  title="Remove link"
                  aria-label="Remove link"
                  className="flex flex-none border-none bg-transparent p-1 text-ink-3"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

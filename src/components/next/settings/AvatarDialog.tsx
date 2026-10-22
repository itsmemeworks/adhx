'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, Check, Square, Upload, X } from 'lucide-react'
import type { FeedItem } from '@/components/feed/types'
import { shortAgo } from '@/lib/feed/blend'
import { networkLabel } from '@/lib/platform/networks'
import type { Saver } from '@/lib/people/types'
import { cn } from '@/lib/utils'
import { GOB_COLOURS, gobDataUri, type GobColour } from '@/lib/avatar/gob'
import { FaceInitial } from '../FaceInitial'
import { GobShape, gobMask } from '../GobShape'
import { SaverFaces } from '../SaverFaces'
import { NxImage, XLogo } from '../primitives'
import { postCoverSrc } from '../post'
import { KIND_WORD, kindOf } from '../search/model'
import { PRIMARY, SECONDARY } from './parts'

/**
 * Change picture: upload a photo, take one with the camera, use your X
 * picture, or make a Gob in your colour. Photos get a circular crop (drag to
 * move, slide to zoom) and a live preview of how you look on a save. The crop
 * is sent as numbers (`x`, `y`, `zoom`); the server applies it, clamped.
 */

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
const MAX_ZOOM = 4
/** The crop frame, in CSS pixels: the photo around the crop shows, dimmed. */
const BOX = 300
/** The crop itself (the square the server keeps), centred in the frame. */
const WINDOW = 248
const PAD = (BOX - WINDOW) / 2

type Source = 'upload' | 'camera' | 'x' | 'gob'
type Crop = { x: number; y: number; zoom: number }

interface Photo {
  file: File
  url: string
  width: number
  height: number
}

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Keep the crop square inside the photo (the server does the same). */
function clampCrop(photo: Photo, crop: Crop): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom))
  const side = Math.min(photo.width, photo.height) / zoom
  const hx = side / 2 / photo.width
  const hy = side / 2 / photo.height
  return {
    zoom,
    x: Math.min(1 - hx, Math.max(hx, crop.x)),
    y: Math.min(1 - hy, Math.max(hy, crop.y)),
  }
}

export interface AvatarDialogProps {
  username: string
  displayName: string | null
  /** The X photo, when X is connected. */
  xPicture: string | null
  /** The X username behind it ("From @pete on X"). */
  xHandle?: string | null
  /** What's shown now, to start from. */
  current: { source: 'upload' | 'gob' | 'x' | 'generated'; url: string | null }
  /** One of your shared saves, as the backdrop for "How you'll look" (`useRecentSave`). */
  sample?: FeedItem | null
  onClose: () => void
  onSaved: () => void
}

export function AvatarDialog({
  username,
  displayName,
  xPicture,
  xHandle = null,
  current,
  sample = null,
  onClose,
  onSaved,
}: AvatarDialogProps) {
  const [source, setSource] = useState<Source | null>(null)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [crop, setCrop] = useState<Crop>({ x: 0.5, y: 0.5, zoom: 1 })
  const [colour, setColour] = useState<GobColour>('blue')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Free the photo's object URL when it's replaced or the dialog closes.
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo])

  const pick = useCallback((e: ChangeEvent<HTMLInputElement>, from: 'upload' | 'camera') => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    if (!ACCEPTED.includes(file.type)) {
      setError('Use a JPEG, PNG, WebP, GIF or AVIF photo.')
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError('That photo is over 5 MB. Try a smaller one.')
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setPhoto({ file, url, width: img.naturalWidth || 1, height: img.naturalHeight || 1 })
      setCrop({ x: 0.5, y: 0.5, zoom: 1 })
      setSource(from)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setError('That photo couldn’t be read. Try another.')
    }
    img.src = url
  }, [])

  // The small face for the preview: the crop drawn to a canvas, or the Gob, or X.
  useEffect(() => {
    if (source === 'gob') return setPreview(gobDataUri(colour))
    if (source === 'x') return setPreview(xPicture)
    if (!photo || !imgRef.current) return setPreview(current.url)
    const frame = requestAnimationFrame(() => {
      const c = clampCrop(photo, crop)
      const side = Math.min(photo.width, photo.height) / c.zoom
      const canvas = document.createElement('canvas')
      canvas.width = 96
      canvas.height = 96
      const ctx = canvas.getContext('2d')
      if (!ctx || !imgRef.current) return
      ctx.drawImage(
        imgRef.current,
        c.x * photo.width - side / 2,
        c.y * photo.height - side / 2,
        side,
        side,
        0,
        0,
        96,
        96,
      )
      try {
        setPreview(canvas.toDataURL('image/jpeg', 0.85))
      } catch {
        setPreview(photo.url)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [source, colour, photo, crop, xPicture, current.url])

  const shown = photo ? clampCrop(photo, crop) : crop
  const side = photo ? Math.min(photo.width, photo.height) / shown.zoom : 1
  const scale = WINDOW / side

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!photo) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, crop: shown }
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!photo || !drag.current) return
    const dx = (e.clientX - drag.current.x) / scale / photo.width
    const dy = (e.clientY - drag.current.y) / scale / photo.height
    setCrop(
      clampCrop(photo, {
        ...drag.current.crop,
        x: drag.current.crop.x - dx,
        y: drag.current.crop.y - dy,
      }),
    )
  }
  function onPointerUp() {
    drag.current = null
  }
  function onCropKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!photo) return
    const step = 0.02
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    setCrop(clampCrop(photo, { ...shown, x: shown.x + move[0], y: shown.y + move[1] }))
  }

  async function save() {
    if (!source) return onClose()
    setBusy(true)
    setError(null)
    try {
      let res: Response
      if ((source === 'upload' || source === 'camera') && photo) {
        const form = new FormData()
        form.set('file', photo.file)
        form.set('x', String(shown.x))
        form.set('y', String(shown.y))
        form.set('zoom', String(shown.zoom))
        res = await fetch('/api/account/avatar', { method: 'POST', body: form })
      } else {
        res = await fetch('/api/account/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(source === 'gob' ? { source: 'gob', colour } : { source: 'x' }),
        })
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error || 'Couldn’t save your picture. Try again.')
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('Couldn’t save your picture. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/account/avatar', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      onSaved()
      onClose()
    } catch {
      setError('Couldn’t remove your picture. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const name = displayName?.trim() || username
  const faceUrl = preview ?? current.url
  const card = (on: boolean) =>
    cn(
      'relative flex min-h-[112px] flex-col items-start gap-2 rounded-[8px] border-2 p-3.5 text-left',
      on
        ? 'border-nx-accent bg-nx-accent/[0.08]'
        : 'border-transparent bg-[#262320] hover:bg-[#2e2a26]',
    )
  const tick = (
    <span
      aria-hidden
      className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-nx-accent text-black"
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </span>
  )

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/70 backdrop-blur-sm"
      />
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-dialog-title"
        // 24 px corners, 20 px padding (28 px, 1 px border and 32 px from md):
        // what lines its edges sits at the 8 px floor.
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col gap-5 overflow-y-auto rounded-t-[24px] bg-[#1a1814] p-5 [--nx-nest:8px] pb-[max(20px,env(safe-area-inset-bottom))] font-nx-sans text-white outline-none md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(880px,calc(100vw-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px] md:border md:border-white/10 md:p-8"
      >
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2
              id="avatar-dialog-title"
              className="m-0 font-nx-serif text-[36px] font-normal leading-[0.95] md:text-[44px]"
            >
              Change picture
            </h2>
            <p className="m-0 text-[15px] text-[#c9bfab]">
              Your people see this on everything you save.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#262320]"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-[300px_minmax(0,1fr)] md:gap-8">
          {/* Crop */}
          <div className="flex flex-col items-center gap-3 md:items-start">
            <div
              role="group"
              aria-label={photo ? 'Crop: drag or use the arrow keys to move' : 'Your picture'}
              tabIndex={photo ? 0 : -1}
              onKeyDown={onCropKey}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={cn(
                'relative shrink-0 touch-none select-none overflow-hidden rounded-[20px] bg-black outline-none focus-visible:ring-2 focus-visible:ring-nx-accent',
                photo && 'cursor-grab active:cursor-grabbing',
              )}
              style={{ width: BOX, height: BOX }}
            >
              {photo ? (
                <img
                  src={photo.url}
                  alt="Your photo"
                  draggable={false}
                  className="pointer-events-none absolute max-w-none"
                  style={{
                    width: photo.width * scale,
                    height: photo.height * scale,
                    left: PAD - (shown.x * photo.width - side / 2) * scale,
                    top: PAD - (shown.y * photo.height - side / 2) * scale,
                  }}
                />
              ) : faceUrl ? (
                <img
                  src={faceUrl}
                  alt="Your picture"
                  referrerPolicy="no-referrer"
                  className="absolute object-cover"
                  style={{ left: PAD, top: PAD, width: WINDOW, height: WINDOW }}
                />
              ) : (
                <span
                  role="img"
                  aria-label="Your picture"
                  className="absolute block"
                  style={{ left: PAD, top: PAD, width: WINDOW, height: WINDOW }}
                >
                  <FaceInitial username={username} name={displayName} size={WINDOW} />
                </span>
              )}
              {/* The picture shows in Gob's shape everywhere, so the crop window is that shape too. */}
              <span
                aria-hidden
                className={cn('pointer-events-none absolute overflow-hidden', gobMask)}
                style={{
                  left: PAD,
                  top: PAD,
                  width: WINDOW,
                  height: WINDOW,
                  boxShadow: '0 0 0 2px #f4f1ea, 0 0 0 999px rgba(0,0,0,0.45)',
                }}
              >
                {photo && (
                  // Thirds, to line a face up.
                  <span
                    className="absolute inset-0"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, transparent calc(33.333% - 0.5px), rgba(255,255,255,0.28) calc(33.333% - 0.5px), rgba(255,255,255,0.28) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px), transparent calc(66.666% - 0.5px), rgba(255,255,255,0.28) calc(66.666% - 0.5px), rgba(255,255,255,0.28) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px)), linear-gradient(to bottom, transparent calc(33.333% - 0.5px), rgba(255,255,255,0.28) calc(33.333% - 0.5px), rgba(255,255,255,0.28) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px), transparent calc(66.666% - 0.5px), rgba(255,255,255,0.28) calc(66.666% - 0.5px), rgba(255,255,255,0.28) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px))',
                    }}
                  />
                )}
              </span>
            </div>
            {photo && (
              <>
                <div className="flex w-full max-w-[300px] items-center gap-3">
                  <Square aria-hidden className="h-2.5 w-2.5 shrink-0 text-[#c9bfab]" />
                  <input
                    type="range"
                    aria-label="Zoom"
                    min={1}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={shown.zoom}
                    aria-valuetext={`${shown.zoom.toFixed(1)} times`}
                    onChange={(e) =>
                      setCrop(clampCrop(photo, { ...shown, zoom: Number(e.target.value) }))
                    }
                    className="nx-range h-11 min-w-0 flex-1"
                    style={
                      {
                        '--fill': `${((shown.zoom - 1) / (MAX_ZOOM - 1)) * 100}%`,
                      } as React.CSSProperties
                    }
                  />
                  <Square aria-hidden className="h-[18px] w-[18px] shrink-0 text-[#c9bfab]" />
                </div>
                <span className="text-[13px] text-[#a39b8b]">Drag to move. Slide to zoom.</span>
              </>
            )}
          </div>

          {/* Sources and preview */}
          <div className="flex min-w-0 flex-col gap-2.5">
            <span className="text-[13px] font-semibold text-[#c9bfab]">Where it comes from</span>
            <div role="radiogroup" aria-label="Picture source" className="grid grid-cols-2 gap-3">
              <button
                type="button"
                role="radio"
                aria-checked={source === 'upload'}
                onClick={() => uploadRef.current?.click()}
                className={card(source === 'upload')}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full',
                    source === 'upload' ? 'bg-nx-accent text-black' : 'bg-[#0f0e0c]',
                  )}
                >
                  <Upload className="h-5 w-5" />
                </span>
                <span className="text-[15px] font-extrabold">Upload a photo</span>
                <span className="max-w-full truncate text-[13px] text-[#a39b8b]">
                  {source === 'upload' && photo
                    ? `${photo.file.name} · ${sizeLabel(photo.file.size)}`
                    : 'Up to 5 MB'}
                </span>
                {source === 'upload' && tick}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={source === 'camera'}
                onClick={() => cameraRef.current?.click()}
                className={card(source === 'camera')}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full',
                    source === 'camera' ? 'bg-nx-accent text-black' : 'bg-[#0f0e0c]',
                  )}
                >
                  <Camera className="h-5 w-5" />
                </span>
                <span className="text-[15px] font-extrabold">Take one</span>
                <span className="text-[13px] text-[#a39b8b] md:hidden">Uses your camera</span>
                <span className="hidden text-[13px] text-[#a39b8b] md:inline">
                  Uses this computer’s camera
                </span>
                {source === 'camera' && tick}
              </button>
              {xPicture && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={source === 'x'}
                  onClick={() => setSource('x')}
                  className={card(source === 'x')}
                >
                  <span
                    aria-hidden
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0f0e0c]"
                  >
                    <XLogo className="h-4 w-4" />
                  </span>
                  <span className="text-[15px] font-extrabold">Use your X picture</span>
                  <span className="max-w-full truncate text-[13px] text-[#a39b8b]">
                    {xHandle ? `From @${xHandle} on X` : 'From your X account'}
                  </span>
                  {source === 'x' && tick}
                </button>
              )}
              <div
                role="group"
                aria-label="Make me a Gob: a face in your colour"
                className={card(source === 'gob')}
              >
                <button
                  type="button"
                  aria-pressed={source === 'gob'}
                  onClick={() => setSource('gob')}
                  className="flex items-center gap-2.5 text-left"
                >
                  <GobShape size={40}>
                    <img src={gobDataUri(colour)} alt="" className="block h-full w-full" />
                  </GobShape>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-extrabold">Make me a Gob</span>
                    <span className="text-[13px] text-[#a39b8b]">A face in your colour</span>
                  </span>
                </button>
                <span role="radiogroup" aria-label="Gob colour" className="mt-auto flex gap-2">
                  {(Object.keys(GOB_COLOURS) as GobColour[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={source === 'gob' && colour === c}
                      aria-label={GOB_COLOURS[c].label}
                      onClick={() => {
                        setColour(c)
                        setSource('gob')
                      }}
                      className="h-8 w-8 rounded-full"
                      style={{
                        background: GOB_COLOURS[c].hex,
                        boxShadow:
                          source === 'gob' && colour === c
                            ? '0 0 0 2px #262320, 0 0 0 4px #f4f1ea'
                            : undefined,
                      }}
                    />
                  ))}
                </span>
                {source === 'gob' && tick}
              </div>
            </div>
            <input
              ref={uploadRef}
              type="file"
              accept={ACCEPTED.join(',')}
              aria-label="Upload a photo"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => pick(e, 'upload')}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="user"
              aria-label="Take a photo"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => pick(e, 'camera')}
            />

            <span className="mt-2 text-[13px] font-semibold text-[#c9bfab]">How you’ll look</span>
            <AvatarPreview sample={sample} you={{ username, name, avatarUrl: faceUrl }} />
          </div>
        </div>

        {error && (
          <p role="alert" className="m-0 text-[14px] font-semibold text-[#ff8a7a]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {current.source !== 'generated' && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="min-h-[44px] text-[14px] font-semibold text-[#c9bfab] underline-offset-2 hover:text-white hover:underline"
            >
              Remove picture
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={SECONDARY}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !source}
            className={PRIMARY}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </>
  )
}

/** Your newest shared save with a picture, for "How you'll look" (asked for while `on`). */
export function useRecentSave(on: boolean): FeedItem | null {
  const [item, setItem] = useState<FeedItem | null>(null)
  useEffect(() => {
    if (!on) return
    const controller = new AbortController()
    fetch('/api/feed?limit=5', { signal: controller.signal, credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<{ items?: FeedItem[] }>) : null))
      .then((d) => {
        const pick = d?.items?.find((i) => !i.isPrivate && postCoverSrc(i))
        if (pick) setItem(pick)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [on])
  return item
}

/**
 * "How you'll look": your face on one of your saves, the way your people see
 * it ("Pete and Ana saved this · 2m"). Without a save to show, a plain card.
 */
function AvatarPreview({
  sample,
  you,
}: {
  sample: FeedItem | null
  you: { username: string; name: string; avatarUrl: string | null }
}) {
  const others = (sample?.savers ?? []).filter((s) => !s.isYou && s.username !== you.username)
  const mine = sample?.savers?.find((s) => s.isYou)
  const savers: Saver[] = [
    {
      username: you.username,
      name: you.name,
      avatarUrl: you.avatarUrl,
      savedAt: mine?.savedAt ?? new Date().toISOString(),
      isYou: false,
    },
    ...others.slice(0, 2),
  ]
  const cover = sample ? postCoverSrc(sample) : null
  const at = Date.parse(mine?.savedAt ?? '')
  const ago = Number.isFinite(at) ? shortAgo(at, Date.now()) : null
  const kind = sample
    ? `${networkLabel(sample.platform)} ${KIND_WORD[kindOf({ post: sample, saved: true, matched: [] })].toLowerCase()}`
    : null
  return (
    <div
      data-testid="avatar-preview"
      className="relative flex h-[112px] items-end overflow-hidden rounded-[8px] bg-gradient-to-b from-[#2a2620] to-black p-4"
    >
      {cover && (
        <>
          <NxImage src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/35 to-black/85"
          />
        </>
      )}
      <span className="absolute right-3 top-3 flex h-7 items-center rounded-full bg-black/55 px-3 text-xs font-extrabold">
        Preview
      </span>
      <div className="relative flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <SaverFaces size={32} savers={savers} className="[&>span:last-child]:text-[14px]" />
          {ago && <span className="shrink-0 text-[13px] text-[#c9bfab]">{`· ${ago}`}</span>}
        </span>
        <span className="text-[13px] text-[#c9bfab]">
          {kind ?? 'How your people see your saves'}
        </span>
      </div>
    </div>
  )
}

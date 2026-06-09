'use client'

/**
 * /graph — the Knowledge Graph. Auth-gated like the main feed: unauthenticated
 * visitors are bounced to the landing page. AppShell already wraps this route
 * with the (sticky) header; we measure its height so the graph stage fills
 * exactly the remaining viewport (the detail overlay/sheet anchor to it).
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GraphView } from '@/components/graph/GraphView'

export default function GraphPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [headerH, setHeaderH] = useState(0)

  useEffect(() => {
    let alive = true
    fetch('/api/auth/twitter/status')
      .then((r) => r.json())
      .then((d: { authenticated?: boolean }) => {
        if (!alive) return
        if (d.authenticated) {
          setAuthed(true)
        } else {
          setAuthed(false)
          router.replace('/')
        }
      })
      .catch(() => {
        if (!alive) return
        setAuthed(false)
        router.replace('/')
      })
    return () => {
      alive = false
    }
  }, [router])

  // Measure the sticky header so the stage = viewport − header (no page scroll).
  useEffect(() => {
    if (!authed) return
    const el = document.querySelector('header')
    if (!el) return
    const update = () => setHeaderH(el.getBoundingClientRect().height)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [authed])

  if (!authed) return null
  return (
    <div style={{ height: headerH ? `calc(100dvh - ${headerH}px)` : '100dvh' }} className="min-h-0">
      <GraphView />
    </div>
  )
}

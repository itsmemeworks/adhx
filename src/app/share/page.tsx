'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { parseShareUrl } from '@/lib/utils/parse-share-url'

function ShareRedirect() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState(false)

  useEffect(() => {
    const url = searchParams.get('url')

    if (!url) {
      router.replace('/')
      return
    }

    const parsed = parseShareUrl(url)
    if (parsed) {
      router.replace(`/${parsed.username}/status/${parsed.id}`)
    } else {
      setError(true)
    }
  }, [searchParams, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Not a tweet link
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            The shared URL doesn&apos;t look like an X/Twitter tweet. Try sharing a link like x.com/user/status/123.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 text-white font-medium rounded-full transition-all hover:scale-105"
            style={{ backgroundColor: '#8B5CF6' }}
          >
            Go to ADHX
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
          <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ShareRedirect />
    </Suspense>
  )
}

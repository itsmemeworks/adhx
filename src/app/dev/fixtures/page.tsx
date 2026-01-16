'use client'

/**
 * Dev Fixtures Page with Responsive Preview + OG Tag Simulation
 *
 * A testing page that shows all tweet fixtures with:
 * - Live previews in desktop, tablet, and mobile frame sizes
 * - Simulated social media unfurl cards (Twitter/Slack style)
 * - Raw OG meta tag values for debugging
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Monitor, Tablet, Smartphone, ExternalLink, ChevronRight, Share2, Eye, Loader2 } from 'lucide-react'

// OG tags interface
interface OgTags {
  title: string | null
  description: string | null
  image: string | null
  imageAlt: string | null
  siteName: string | null
  type: string | null
  twitterCard: string | null
  twitterTitle: string | null
  twitterDescription: string | null
  twitterImage: string | null
  twitterCreator: string | null
}

// Fixture metadata matching the test fixtures
const fixtures = [
  { slug: 'text-quoting-video', author: 'swyx', tweetId: '2011861139689513314', type: 'Quote (video)', description: 'Text tweet quoting a video tweet' },
  { slug: 'long-text-2-images', author: 'BasilTheGreat', tweetId: '2012044480556208542', type: 'Photo', description: 'Long text with 2 images' },
  { slug: 'long-text-1-image', author: 'maverickecom', tweetId: '2011489837094683034', type: 'Photo', description: 'Long text with 1 image' },
  { slug: 'quote-of-image-tweet', author: 'Nate_Google_', tweetId: '2011791917122547826', type: 'Quote (image)', description: 'Quote of an image tweet' },
  { slug: 'quote-of-text-tweet', author: 'elonmusk', tweetId: '2012040892719169884', type: 'Quote (text)', description: 'Quote of a text-only tweet' },
  { slug: 'video-tweet', author: 'Kekius_Sage', tweetId: '2011872260118716688', type: 'Video', description: 'Video tweet with thumbnail' },
  { slug: 'long-text-with-quote', author: '_The_Prophet__', tweetId: '2011834234642841806', type: 'Quote + Image', description: 'Long text quoting image tweet' },
  { slug: 'article-no-header', author: 'aliniikk', tweetId: '2009347948816335031', type: 'X Article', description: 'X Article without cover image' },
  { slug: 'article-with-media', author: 'NoahRyanCo', tweetId: '2008957369212866843', type: 'X Article', description: 'X Article with cover image + content' },
  { slug: 'plain-text', author: 'TheCinesthetic', tweetId: '2010184900599583070', type: 'Text', description: 'Plain text tweet (no media)' },
  { slug: '4-images', author: 'iamgdsa', tweetId: '2010782484728873387', type: 'Photo Grid', description: '4 images in grid layout' },
  { slug: 'emoji-tweet', author: 'moonpay', tweetId: '2009626024968118554', type: 'Video + Emoji', description: 'Emoji-heavy tweet with video' },
  { slug: 'youtube-link', author: 'skalskip92', tweetId: '1996677567642996772', type: 'External Link', description: 'Tweet with YouTube link' },
  { slug: 'reply-tweet', author: 'grok', tweetId: '2011596457824923855', type: 'Reply', description: 'Reply tweet context' },
]

const typeColors: Record<string, string> = {
  'Text': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'Photo': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  'Photo Grid': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  'Video': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  'Video + Emoji': 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  'X Article': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  'Quote (video)': 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  'Quote (image)': 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  'Quote (text)': 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  'Quote + Image': 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  'External Link': 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  'Reply': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
}

// Device frame sizes
const devices = [
  { name: 'Desktop', width: 1280, height: 800, icon: Monitor },
  { name: 'Tablet', width: 768, height: 1024, icon: Tablet },
  { name: 'Mobile', width: 375, height: 667, icon: Smartphone },
]

type ViewMode = 'devices' | 'og'

export default function DevFixturesPage() {
  const [selectedFixture, setSelectedFixture] = useState<typeof fixtures[0] | null>(null)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('devices')
  const [ogTags, setOgTags] = useState<OgTags | null>(null)
  const [ogLoading, setOgLoading] = useState(false)
  const [ogError, setOgError] = useState<string | null>(null)

  const handleSelectFixture = (fixture: typeof fixtures[0]) => {
    setSelectedFixture(fixture)
    const path = `/${fixture.author}/status/${fixture.tweetId}`
    setLoadedUrl(path)
    // Reset OG state when changing fixtures
    setOgTags(null)
    setOgError(null)
  }

  // Fetch OG tags when fixture changes and OG view is active
  useEffect(() => {
    if (!loadedUrl || viewMode !== 'og') return

    const fetchOgTags = async () => {
      setOgLoading(true)
      setOgError(null)
      try {
        const response = await fetch(`/api/dev/og-tags?path=${encodeURIComponent(loadedUrl)}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch OG tags: ${response.status}`)
        }
        const tags = await response.json()
        setOgTags(tags)
      } catch (error) {
        setOgError(error instanceof Error ? error.message : 'Failed to fetch OG tags')
      } finally {
        setOgLoading(false)
      }
    }

    fetchOgTags()
  }, [loadedUrl, viewMode])

  return (
    <div className="h-screen flex bg-gray-100 dark:bg-gray-900">
      {/* Left Sidebar - Fixture List */}
      <div className="w-80 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              🧪 Fixtures
            </h1>
            <Link
              href="/"
              className="text-xs text-gray-500 hover:text-purple-600 dark:text-gray-400"
            >
              ← Gallery
            </Link>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Click a fixture to preview in all screen sizes
          </p>
        </div>

        {/* Fixture List */}
        <div className="flex-1 overflow-y-auto">
          {fixtures.map((fixture, index) => (
            <button
              key={fixture.slug}
              onClick={() => handleSelectFixture(fixture)}
              className={`w-full text-left p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center gap-3 ${
                selectedFixture?.slug === fixture.slug ? 'bg-purple-50 dark:bg-purple-900/20 border-l-2 border-l-purple-500' : ''
              }`}
            >
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono w-5">
                {(index + 1).toString().padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${typeColors[fixture.type] || 'bg-gray-100 text-gray-700'}`}>
                    {fixture.type}
                  </span>
                </div>
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  @{fixture.author}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {fixture.description}
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${selectedFixture?.slug === fixture.slug ? 'text-purple-500' : ''}`} />
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <strong>{fixtures.length}</strong> fixtures • Click to preview
          </div>
        </div>
      </div>

      {/* Right Panel - Device Frames */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="h-12 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4">
          {selectedFixture ? (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  @{selectedFixture.author}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors[selectedFixture.type]}`}>
                  {selectedFixture.type}
                </span>
              </div>
              <div className="flex items-center gap-4">
                {/* View Mode Toggle */}
                <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode('devices')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      viewMode === 'devices'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Devices
                  </button>
                  <button
                    onClick={() => setViewMode('og')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      viewMode === 'og'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    OG Tags
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={loadedUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400"
                  >
                    Open full page <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={`https://x.com/${selectedFixture.author}/status/${selectedFixture.tweetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    View on X <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </>
          ) : (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Select a fixture from the list to preview
            </span>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6 bg-gray-100 dark:bg-gray-900">
          {loadedUrl ? (
            viewMode === 'devices' ? (
              <div className="flex gap-6 justify-center items-start min-h-full">
                {devices.map((device) => (
                  <DeviceFrame
                    key={device.name}
                    device={device}
                    url={loadedUrl}
                  />
                ))}
              </div>
            ) : (
              <OgPreview
                ogTags={ogTags}
                loading={ogLoading}
                error={ogError}
                url={loadedUrl}
              />
            )
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="flex justify-center gap-4 mb-4 text-gray-300 dark:text-gray-600">
                  <Monitor className="w-12 h-12" />
                  <Tablet className="w-10 h-10" />
                  <Smartphone className="w-8 h-8" />
                </div>
                <p className="text-gray-500 dark:text-gray-400">
                  Select a fixture to see responsive previews
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DeviceFrame({ device, url }: { device: typeof devices[0]; url: string }) {
  const Icon = device.icon
  const scale = device.name === 'Desktop' ? 0.5 : device.name === 'Tablet' ? 0.55 : 0.7

  return (
    <div className="flex flex-col items-center">
      {/* Device Label */}
      <div className="flex items-center gap-2 mb-2 text-gray-600 dark:text-gray-400">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{device.name}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {device.width}×{device.height}
        </span>
      </div>

      {/* Device Frame */}
      <div
        className="bg-gray-800 rounded-2xl p-2 shadow-xl"
        style={{
          width: device.width * scale + 16,
        }}
      >
        {/* Screen Bezel */}
        <div
          className="bg-white rounded-lg overflow-hidden relative"
          style={{
            width: device.width * scale,
            height: device.height * scale,
          }}
        >
          <iframe
            src={url}
            title={`${device.name} preview`}
            className="absolute top-0 left-0 border-0"
            style={{
              width: device.width,
              height: device.height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// OG Preview Component - Shows simulated social cards and raw tags
function OgPreview({
  ogTags,
  loading,
  error,
  url,
}: {
  ogTags: OgTags | null
  loading: boolean
  error: string | null
  url: string
}) {
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Fetching OG tags...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-red-500 dark:text-red-400">
          <p className="font-medium">Failed to fetch OG tags</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (!ogTags) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <Share2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Click &quot;OG Tags&quot; to fetch metadata</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Simulated Social Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Twitter/X Card */}
        <div>
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Twitter / X Card
          </h3>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            {ogTags.twitterImage && (
              <div className="aspect-[1.91/1] bg-gray-100 dark:bg-gray-700 relative">
                                <img
                  src={ogTags.twitterImage}
                  alt={ogTags.imageAlt || 'OG Image'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              </div>
            )}
            <div className="p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {new URL(url, 'http://localhost:3000').hostname}
              </div>
              <div className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2">
                {ogTags.twitterTitle || ogTags.title || 'No title'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                {ogTags.twitterDescription || ogTags.description || 'No description'}
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Card type: <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">{ogTags.twitterCard || 'not set'}</code>
          </div>
        </div>

        {/* Slack/Discord Card */}
        <div>
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.52 2.521h-2.522V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.52v-2.522h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.52 2.521h-6.314z" />
            </svg>
            Slack / Discord
          </h3>
          <div className="bg-white dark:bg-gray-800 rounded-lg border-l-4 border-l-purple-500 border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">
                  {ogTags.siteName || 'ADHX'}
                </div>
                <div className="font-medium text-blue-600 dark:text-blue-400 text-sm hover:underline cursor-pointer line-clamp-1">
                  {ogTags.title || 'No title'}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-3">
                  {ogTags.description || 'No description'}
                </div>
              </div>
              {ogTags.image && (
                <div className="w-20 h-20 flex-shrink-0 rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
                                    <img
                    src={ogTags.image}
                    alt={ogTags.imageAlt || 'OG Image'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Raw OG Tags Table */}
      <div>
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
          Raw Meta Tags
        </h3>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300 w-48">Property</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {[
                ['og:title', ogTags.title],
                ['og:description', ogTags.description],
                ['og:image', ogTags.image],
                ['og:image:alt', ogTags.imageAlt],
                ['og:site_name', ogTags.siteName],
                ['og:type', ogTags.type],
                ['twitter:card', ogTags.twitterCard],
                ['twitter:title', ogTags.twitterTitle],
                ['twitter:description', ogTags.twitterDescription],
                ['twitter:image', ogTags.twitterImage],
                ['twitter:creator', ogTags.twitterCreator],
              ].map(([property, value]) => (
                <tr key={property} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-2 font-mono text-xs text-purple-600 dark:text-purple-400">
                    {property}
                  </td>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                    {value ? (
                      <span className="break-all">{value}</span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 italic">not set</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Image Preview (Full Size) */}
      {ogTags.image && (
        <div>
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
            OG Image Preview (Full Size)
          </h3>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="max-w-2xl">
                            <img
                src={ogTags.image}
                alt={ogTags.imageAlt || 'OG Image'}
                className="rounded-lg shadow-sm max-w-full h-auto"
                onError={(e) => {
                  e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><rect fill="%23f3f4f6" width="400" height="200"/><text x="50%" y="50%" fill="%239ca3af" text-anchor="middle" dy=".3em">Failed to load image</text></svg>'
                }}
              />
            </div>
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 break-all">
              <span className="font-medium">URL:</span> {ogTags.image}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

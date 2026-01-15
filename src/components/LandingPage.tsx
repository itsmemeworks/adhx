'use client'

import { useState } from 'react'
import { Bookmark, Search, Tag, Maximize2, ArrowRight, Zap } from 'lucide-react'
import { ADHX_PURPLE } from '@/lib/gestalt/theme'
import { XIcon } from '@/components/icons'
import { AnimatedBackground, LandingAnimations } from '@/components/landing'

export function LandingPage() {
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = () => {
    setIsLoading(true)
    window.location.href = '/api/auth/twitter'
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 relative overflow-hidden">
      <LandingAnimations />
      <AnimatedBackground showFloatingTweets />

      {/* Hero Section */}
      <main>
        <section aria-labelledby="hero-title" className="max-w-6xl mx-auto px-4 pt-20 pb-16">
          <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center mb-3">
            <img
              src="/logo.png"
              alt="ADHX Logo"
              className="w-48 h-48 object-contain animate-float animate-pulse-glow-filter"
            />
          </div>

          <h1 id="hero-title" className="text-7xl font-indie-flower text-gray-900 dark:text-white mb-4 animate-fade-in-up opacity-0 delay-100">
            ADHX
          </h1>

          <p className="text-2xl font-medium text-gray-700 dark:text-gray-300 mb-4 animate-fade-in-up opacity-0 delay-200">
            Save now. Read never. Find always.
          </p>

          <p className="text-lg text-gray-500 dark:text-gray-400 mb-8 max-w-xl mx-auto animate-fade-in-up opacity-0 delay-300">
            For people who bookmark everything and read nothing.
          </p>

          {/* CTA Button */}
          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="inline-flex items-center gap-3 px-8 py-4 text-lg font-semibold text-white rounded-full transition-all hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed animate-fade-in-up opacity-0 delay-400"
            style={{ backgroundColor: ADHX_PURPLE }}
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <XIcon className="w-6 h-6" />
                Connect with X
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </section>

      {/* URL Trick Section */}
      <section aria-labelledby="url-trick-title" className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-gray-100 dark:bg-gray-800/50 rounded-3xl p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Zap className="w-6 h-6" style={{ color: ADHX_PURPLE }} />
            <h2 id="url-trick-title" className="text-lg font-semibold text-gray-900 dark:text-white">The URL Trick</h2>
          </div>

          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Just add <span className="font-mono font-bold text-gray-900 dark:text-white">adh</span> before any x.com link to save it instantly.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 text-sm sm:text-base">
            <div className="font-mono bg-white dark:bg-gray-900 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500">
              x.com/user/status/123
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 rotate-90 sm:rotate-0" />
            <div className="font-mono bg-white dark:bg-gray-900 px-4 py-3 rounded-xl border-2 text-gray-900 dark:text-white" style={{ borderColor: ADHX_PURPLE }}>
              <span style={{ color: ADHX_PURPLE }}>adh</span>x.com/user/status/123
            </div>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
            That&apos;s it. Your future self will thank you. Probably.
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section aria-labelledby="features-title" className="max-w-6xl mx-auto px-4 py-16">
        <h2 id="features-title" className="sr-only">Features</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <FeatureCard
            icon={<Bookmark className="w-8 h-8" />}
            title="Hoard Mode"
            description="Sync your X bookmarks or add tweets one by one. Hoard responsibly. Or don't."
          />
          <FeatureCard
            icon={<Maximize2 className="w-8 h-8" />}
            title="Media Mode"
            description="Full-screen media viewer with one-click downloads. Save that meme before it disappears."
          />
          <FeatureCard
            icon={<Search className="w-8 h-8" />}
            title="Actually Find Stuff"
            description="Full-text search that works. Find that tweet from 6 months ago."
          />
          <FeatureCard
            icon={<Tag className="w-8 h-8" />}
            title="Tag Everything"
            description="Organize your chaos with custom tags. Or don't. We won't tell."
          />
        </div>
      </section>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 py-8 text-center text-gray-500 dark:text-gray-400">
        <p className="text-sm">
          Your data stays private. We&apos;re too lazy to do anything sketchy with it anyway.
        </p>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: `${ADHX_PURPLE}15`, color: ADHX_PURPLE }}
      >
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      <p className="text-gray-600 dark:text-gray-400 text-sm">
        {description}
      </p>
    </div>
  )
}

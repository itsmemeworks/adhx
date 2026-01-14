'use client'

import { useState } from 'react'
import { Bookmark, Search, Tag, Maximize2, ArrowRight, Zap } from 'lucide-react'
import { ADHX_PURPLE } from '@/lib/gestalt/theme'

export function LandingPage() {
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = () => {
    setIsLoading(true)
    window.location.href = '/api/auth/twitter'
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 relative overflow-hidden">
      {/* Animations */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(2deg); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-glow {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.3)); }
          50% { filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.6)); }
        }
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(20px, -30px) scale(1.1); }
          50% { transform: translate(-20px, 20px) scale(0.9); }
          75% { transform: translate(30px, 10px) scale(1.05); }
        }
        @keyframes drift {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }
        .animate-float { animation: float 4s ease-in-out infinite; }
        .animate-fade-in-up { animation: fadeInUp 0.6s ease-out forwards; }
        .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
        .animate-blob { animation: blob 20s ease-in-out infinite; }
        .animate-drift { animation: drift 15s ease-in-out infinite; }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-400 { animation-delay: 0.4s; }
      `}</style>

      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Gradient blobs */}
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-purple-300 dark:bg-purple-900/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-50 animate-blob" />
        <div className="absolute top-20 -right-40 w-96 h-96 bg-pink-300 dark:bg-pink-900/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-40 animate-blob" style={{ animationDelay: '-5s' }} />
        <div className="absolute bottom-40 left-20 w-72 h-72 bg-blue-300 dark:bg-blue-900/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-40 animate-blob" style={{ animationDelay: '-10s' }} />
        <div className="absolute -bottom-20 right-40 w-80 h-80 bg-yellow-200 dark:bg-yellow-900/30 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-30 animate-blob" style={{ animationDelay: '-15s' }} />

        {/* Floating tweets */}
        {[
          { top: '25%', left: '10%', delay: '0s', color: 'bg-purple-100 dark:bg-purple-900/60 border-purple-200 dark:border-purple-700' },
          { top: '33%', right: '15%', delay: '-3s', color: 'bg-pink-100 dark:bg-pink-900/60 border-pink-200 dark:border-pink-700' },
          { top: '50%', left: '8%', delay: '-7s', color: 'bg-blue-100 dark:bg-blue-900/60 border-blue-200 dark:border-blue-700' },
          { top: '66%', right: '12%', delay: '-11s', color: 'bg-green-100 dark:bg-green-900/60 border-green-200 dark:border-green-700' },
          { bottom: '25%', left: '15%', delay: '-5s', color: 'bg-yellow-100 dark:bg-yellow-900/60 border-yellow-200 dark:border-yellow-700' },
          { top: '15%', right: '8%', delay: '-9s', color: 'bg-orange-100 dark:bg-orange-900/60 border-orange-200 dark:border-orange-700' },
          { top: '40%', right: '5%', delay: '-13s', color: 'bg-indigo-100 dark:bg-indigo-900/60 border-indigo-200 dark:border-indigo-700' },
          { bottom: '35%', right: '18%', delay: '-2s', color: 'bg-rose-100 dark:bg-rose-900/60 border-rose-200 dark:border-rose-700' },
        ].map((tweet, i) => (
          <div
            key={i}
            className={`absolute w-16 h-12 ${tweet.color} rounded-lg border shadow-sm opacity-60 animate-drift flex flex-col justify-center px-2`}
            style={{ top: tweet.top, left: tweet.left, right: tweet.right, bottom: tweet.bottom, animationDelay: tweet.delay }}
          >
            <div className="flex items-center gap-1 mb-1">
              <div className="w-2 h-2 rounded-full bg-current opacity-40" />
              <div className="h-1 w-6 rounded bg-current opacity-20" />
            </div>
            <div className="space-y-0.5">
              <div className="h-1 w-full rounded bg-current opacity-15" />
              <div className="h-1 w-3/4 rounded bg-current opacity-15" />
            </div>
          </div>
        ))}

        {/* Dot grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Hero Section */}
      <main>
        <section aria-labelledby="hero-title" className="max-w-6xl mx-auto px-4 pt-20 pb-16">
          <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center mb-3">
            <img
              src="/logo.png"
              alt="ADHX Logo"
              className="w-48 h-48 object-contain animate-float animate-pulse-glow"
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
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
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

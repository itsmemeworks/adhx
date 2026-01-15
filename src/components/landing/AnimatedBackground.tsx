'use client'

/**
 * Animated background component for landing pages
 * Provides gradient blobs and dot grid pattern
 */

interface AnimatedBackgroundProps {
  /** Whether to show floating tweet cards (used on main landing page) */
  showFloatingTweets?: boolean
}

export function AnimatedBackground({ showFloatingTweets = false }: AnimatedBackgroundProps): React.ReactElement {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Gradient blobs */}
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-purple-300 dark:bg-purple-900/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-50 animate-blob" />
      <div
        className="absolute top-20 -right-40 w-96 h-96 bg-pink-300 dark:bg-pink-900/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-40 animate-blob"
        style={{ animationDelay: '-5s' }}
      />
      <div
        className="absolute bottom-40 left-20 w-72 h-72 bg-blue-300 dark:bg-blue-900/40 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-40 animate-blob"
        style={{ animationDelay: '-10s' }}
      />

      {/* Floating tweet cards - only shown on main landing */}
      {showFloatingTweets && <FloatingTweets />}

      {/* Dot grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
    </div>
  )
}

/**
 * Floating tweet card decorations for landing page background
 */
function FloatingTweets(): React.ReactElement {
  const tweets = [
    { top: '25%', left: '10%', delay: '0s', color: 'bg-purple-100 dark:bg-purple-900/60 border-purple-200 dark:border-purple-700' },
    { top: '33%', right: '15%', delay: '-3s', color: 'bg-pink-100 dark:bg-pink-900/60 border-pink-200 dark:border-pink-700' },
    { top: '50%', left: '8%', delay: '-7s', color: 'bg-blue-100 dark:bg-blue-900/60 border-blue-200 dark:border-blue-700' },
    { top: '66%', right: '12%', delay: '-11s', color: 'bg-green-100 dark:bg-green-900/60 border-green-200 dark:border-green-700' },
    { bottom: '25%', left: '15%', delay: '-5s', color: 'bg-yellow-100 dark:bg-yellow-900/60 border-yellow-200 dark:border-yellow-700' },
    { top: '15%', right: '8%', delay: '-9s', color: 'bg-orange-100 dark:bg-orange-900/60 border-orange-200 dark:border-orange-700' },
    { top: '40%', right: '5%', delay: '-13s', color: 'bg-indigo-100 dark:bg-indigo-900/60 border-indigo-200 dark:border-indigo-700' },
    { bottom: '35%', right: '18%', delay: '-2s', color: 'bg-rose-100 dark:bg-rose-900/60 border-rose-200 dark:border-rose-700' },
  ]

  return (
    <>
      {tweets.map((tweet, i) => (
        <div
          key={i}
          className={`absolute w-16 h-12 ${tweet.color} rounded-lg border shadow-sm opacity-60 animate-drift flex flex-col justify-center px-2`}
          style={{
            top: tweet.top,
            left: tweet.left,
            right: tweet.right,
            bottom: tweet.bottom,
            animationDelay: tweet.delay,
          }}
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
    </>
  )
}

/**
 * CSS keyframes for landing page animations
 * Include this in a style tag or global CSS
 */
export const LANDING_ANIMATION_STYLES = `
@keyframes float {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-10px) rotate(2deg); }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.2); }
  50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.4); }
}
@keyframes pulse-glow-filter {
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
.animate-pulse-glow { animation: pulse-glow 3s ease-in-out infinite; }
.animate-pulse-glow-filter { animation: pulse-glow-filter 2s ease-in-out infinite; }
.animate-blob { animation: blob 20s ease-in-out infinite; }
.animate-drift { animation: drift 15s ease-in-out infinite; }
.delay-100 { animation-delay: 0.1s; }
.delay-200 { animation-delay: 0.2s; }
.delay-300 { animation-delay: 0.3s; }
.delay-400 { animation-delay: 0.4s; }
`

/**
 * LandingAnimations component that injects the animation styles
 */
export function LandingAnimations(): React.ReactElement {
  return <style jsx global>{LANDING_ANIMATION_STYLES}</style>
}

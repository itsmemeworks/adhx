'use client'

import { useState, useEffect, ReactNode, MouseEvent as ReactMouseEvent } from 'react'

interface TooltipProps {
  content: string
  children: ReactNode
  disabled?: boolean
  placement?: 'right' | 'left'
}

export function Tooltip({ content, children, disabled = false, placement = 'right' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!isVisible || disabled) return

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [isVisible, disabled])

  const handleMouseEnter = (e: ReactMouseEvent) => {
    // Set initial position from enter event
    setPosition({ x: e.clientX, y: e.clientY })
    setIsVisible(true)
  }

  if (disabled) {
    return <>{children}</>
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsVisible(false)}
      onMouseMove={(e) => setPosition({ x: e.clientX, y: e.clientY })}
      className="inline-flex"
    >
      {children}
      {isVisible && content && (
        <div
          className="fixed z-[9999] px-2 py-1 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            left: placement === 'left' ? position.x - 12 : position.x + 12,
            top: position.y + 12,
            transform: placement === 'left' ? 'translateX(-100%)' : undefined,
          }}
        >
          {content}
        </div>
      )}
    </div>
  )
}

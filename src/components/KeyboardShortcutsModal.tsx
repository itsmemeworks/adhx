'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
  inFocusMode?: boolean
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded border border-gray-300 dark:border-gray-600">
      {children}
    </kbd>
  )
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-0.5">
        {keys.map((k, i) => (
          <Key key={i}>{k}</Key>
        ))}
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-100 dark:bg-gray-800 -mx-4 px-4 py-1.5 mb-2">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{children}</p>
    </div>
  )
}

export function KeyboardShortcutsModal({ isOpen, onClose, inFocusMode = false }: KeyboardShortcutsModalProps) {
  const [view, setView] = useState<'gallery' | 'focus'>(inFocusMode ? 'focus' : 'gallery')

  // Update view when inFocusMode prop changes
  useEffect(() => {
    setView(inFocusMode ? 'focus' : 'gallery')
  }, [inFocusMode])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-card rounded-lg border shadow-lg w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* View Selector */}
        <div className="flex border-b">
          <button
            onClick={() => setView('gallery')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              view === 'gallery'
                ? 'text-gray-900 dark:text-white border-b-2 border-gray-900 dark:border-white'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Gallery
          </button>
          <button
            onClick={() => setView('focus')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              view === 'focus'
                ? 'text-gray-900 dark:text-white border-b-2 border-gray-900 dark:border-white'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Focus Mode
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 text-sm max-h-[60vh] overflow-y-auto">
          {view === 'gallery' ? (
            <>
              {/* Navigation */}
              <div>
                <SectionHeader>Navigation</SectionHeader>
                <Row keys={['/']} label="Search" />
                <Row keys={['s']} label="Settings" />
                <Row keys={['f']} label="Enter focus mode" />
                <Row keys={['Esc']} label="Close / unfocus" />
              </div>

              {/* Actions */}
              <div>
                <SectionHeader>Actions</SectionHeader>
                <Row keys={['a']} label="Add tweet" />
                <Row keys={['r']} label="Refresh / sync" />
                <Row keys={['u']} label="Toggle unread only" />
                <Row keys={['t']} label="Open tags filter" />
                <Row keys={['?']} label="Show this help" />
              </div>

              {/* Filters */}
              <div>
                <SectionHeader>Filters</SectionHeader>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  <Row keys={['1']} label="All" />
                  <Row keys={['2']} label="Photos" />
                  <Row keys={['3']} label="Videos" />
                  <Row keys={['4']} label="Text" />
                  <Row keys={['5']} label="Articles" />
                  <Row keys={['6']} label="Quoted" />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Navigation */}
              <div>
                <SectionHeader>Navigation</SectionHeader>
                <Row keys={['←', '→']} label="Previous / next" />
                <Row keys={['g']} label="Back to gallery" />
                <Row keys={['Esc']} label="Exit focus mode" />
              </div>

              {/* Actions */}
              <div>
                <SectionHeader>Actions</SectionHeader>
                <Row keys={['r']} label="Mark as read" />
                <Row keys={['u']} label="Mark as unread" />
                <Row keys={['t']} label="Add tag" />
                <Row keys={['x']} label="Open on X" />
              </div>

              {/* Tweet Navigation */}
              <div>
                <SectionHeader>Tweet Navigation</SectionHeader>
                <Row keys={['q']} label="Go to quoted tweet" />
                <Row keys={['p']} label="Go to parent tweet" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

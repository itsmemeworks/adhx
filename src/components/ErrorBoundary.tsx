'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional fallback UI to display when an error occurs */
  fallback?: ReactNode
  /** Name of the component being wrapped (for error reporting) */
  componentName?: string
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary component that catches JavaScript errors in child components.
 *
 * Prevents the entire app from crashing when a component throws an error.
 * Logs errors and displays a fallback UI.
 *
 * @example
 * <ErrorBoundary componentName="FeedGrid">
 *   <FeedGrid items={items} />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error with component context
    // Note: Server-side Sentry catches these via global error handling
    console.error('ErrorBoundary caught error:', {
      error,
      component: this.props.componentName || 'Unknown',
      componentStack: errorInfo.componentStack,
    })

    // Call optional error handler
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default fallback UI
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            Something went wrong
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md">
            {this.props.componentName
              ? `There was an error loading ${this.props.componentName}.`
              : 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Compact error fallback for inline components (cards, list items, etc.)
 */
export function CompactErrorFallback({
  message = 'Failed to load',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="ml-auto text-red-700 dark:text-red-300 hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  )
}

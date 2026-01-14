import { NextResponse } from 'next/server'
import { captureException, captureMessage, getSentryRelease } from '@/lib/sentry'

export async function GET() {
  const release = getSentryRelease()

  try {
    // Send a test message
    captureMessage('Sentry test - message received!', 'info', {
      testType: 'verification',
      timestamp: new Date().toISOString(),
      release,
    })

    // Throw a test error to verify exception capture
    throw new Error('Sentry test - exception captured successfully!')
  } catch (error) {
    captureException(error, {
      testType: 'verification',
      endpoint: '/api/sentry-test',
      release,
    })

    return NextResponse.json({
      success: true,
      message: 'Test error sent to Sentry! Check your Sentry dashboard.',
      release: release || 'not set',
      environment: process.env.NODE_ENV,
    })
  }
}

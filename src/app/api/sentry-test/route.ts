import { NextResponse } from 'next/server'
import { captureException, captureMessage } from '@/lib/sentry'

export async function GET() {
  try {
    // Send a test message
    captureMessage('Sentry test - message received!', 'info', {
      testType: 'verification',
      timestamp: new Date().toISOString(),
    })

    // Throw a test error to verify exception capture
    throw new Error('Sentry test - exception captured successfully!')
  } catch (error) {
    captureException(error, {
      testType: 'verification',
      endpoint: '/api/sentry-test',
    })

    return NextResponse.json({
      success: true,
      message: 'Test error sent to Sentry! Check your Sentry dashboard.',
    })
  }
}

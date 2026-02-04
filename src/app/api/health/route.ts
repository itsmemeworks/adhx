import { NextResponse } from 'next/server'
import { rawDb } from '@/lib/db'

/**
 * Health check endpoint for Fly.io and monitoring.
 * Verifies database connectivity and returns application status.
 */
export async function GET() {
  const startTime = Date.now()

  try {
    // Verify database connectivity with a simple query using raw SQLite
    rawDb.prepare('SELECT 1').get()

    const responseTime = Date.now() - startTime

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
      checks: {
        database: {
          status: 'healthy',
          responseTime: `${responseTime}ms`,
        },
      },
    })
  } catch (error) {
    console.error('Health check failed:', error)

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
        checks: {
          database: {
            status: 'unhealthy',
            error: 'Database unreachable',
          },
        },
      },
      { status: 503 }
    )
  }
}

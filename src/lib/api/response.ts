import { NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'

/**
 * Standardized error handler for API route catch blocks.
 *
 * Logs the error to the console (tagged with the endpoint), reports it to
 * Sentry with `{ endpoint, userId }` context, and returns a JSON error
 * response. The error is normalized to an `Error` instance before being
 * sent to Sentry so the stack trace is preserved.
 *
 * Defaults preserve the existing contract: `{ error: 'Internal server error' }`
 * with status `500`. Pass `message`/`status` to match a route's current body.
 *
 * @param error - The caught value (may be anything thrown).
 * @param ctx - Context for logging/reporting and the response shape.
 * @param ctx.endpoint - Route identifier used in the log tag and Sentry context.
 * @param ctx.userId - Optional user id forwarded to Sentry (never to the client).
 * @param ctx.message - Optional client-facing error message (defaults to 'Internal server error').
 * @param ctx.status - Optional HTTP status code (defaults to 500).
 * @returns A `NextResponse` JSON error payload.
 */
export function handleRouteError(
  error: unknown,
  ctx: { endpoint: string; userId?: string; message?: string; status?: number },
): NextResponse {
  console.error(`[${ctx.endpoint}]`, error)

  const normalized = error instanceof Error ? error : new Error(String(error))
  captureException(normalized, { endpoint: ctx.endpoint, userId: ctx.userId })

  return NextResponse.json(
    { error: ctx.message ?? 'Internal server error' },
    { status: ctx.status ?? 500 },
  )
}

/**
 * Thin convenience wrapper around `NextResponse.json` for success responses.
 *
 * Optional to use — behaves identically to calling `NextResponse.json(data, init)`.
 *
 * @param data - The response body to serialize as JSON.
 * @param init - Optional `ResponseInit` (status, headers, etc.).
 * @returns A `NextResponse` JSON response.
 */
export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init)
}

/**
 * Build a JSON error response with a message, status, and optional extra fields.
 *
 * The `extra` object is spread alongside `error`, so callers can attach
 * additional fields (e.g. `cooldownRemaining`) without changing the contract.
 *
 * @param message - Client-facing error message.
 * @param status - HTTP status code.
 * @param extra - Optional additional fields merged into the JSON body.
 * @returns A `NextResponse` JSON error payload.
 */
export function fail(
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status })
}

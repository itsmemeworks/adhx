import type { Instrumentation } from 'next'

const MAX_PATH_LENGTH = 256
const HTTP_METHOD = /^[A-Z]{1,16}$/
const NEXT_ERROR_DIGEST = /^(?:0|[1-9][0-9]{0,9})$/

function boundedRoutePath(routePath: string): string {
  const path = routePath.split(/[?#]/, 1)[0] || '/'
  return path.slice(0, MAX_PATH_LENGTH)
}

function boundedMethod(method: string): string {
  const normalized = method.toUpperCase()
  return HTTP_METHOD.test(normalized) ? normalized : 'UNKNOWN'
}

function boundedDigest(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('digest' in error)) {
    return undefined
  }

  const digest = (error as { digest?: unknown }).digest
  if (typeof digest !== 'string' && typeof digest !== 'number') {
    return undefined
  }

  const normalized = String(digest)
  return NEXT_ERROR_DIGEST.test(normalized) ? normalized : undefined
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { initSentry } = await import('@/lib/sentry')
  initSentry()
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { captureException } = await import('@/lib/sentry')
  const routePath = boundedRoutePath(context.routePath)
  const digest = boundedDigest(error)

  captureException(error, {
    requestPath: routePath,
    requestMethod: boundedMethod(request.method),
    routePath,
    routeType: context.routeType,
    ...(digest ? { digest } : {}),
  })
}

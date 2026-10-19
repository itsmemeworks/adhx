import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock('node:child_process', () => ({ fork: mocks.fork }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/semantic/config', async (load) => ({
  ...(await load<Record<string, unknown>>()),
  semanticEnabled: () => true,
}))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  delete (globalThis as Record<string, unknown>).__adhxSemanticSupervisor
  mocks.fork.mockReset()
})

describe('remote NAS model roles', () => {
  it('keeps the query child but never starts indexing after readiness, wake or fallback', async () => {
    vi.useFakeTimers()
    vi.stubEnv('PROCESSING_MODE', 'remote')
    vi.resetModules()
    const child = Object.assign(new EventEmitter(), {
      connected: true,
      send: vi.fn(),
      kill: vi.fn(),
    })
    mocks.fork.mockReturnValue(child)
    const supervisor = await import('@/lib/semantic/supervisor')
    supervisor.startSemanticProcesses()
    expect(mocks.fork).toHaveBeenCalledTimes(1)
    expect(mocks.fork.mock.calls[0][2].env.ADHX_SEMANTIC_ROLE).toBe('query')
    child.emit('message', { type: 'ready' })
    supervisor.wakeJobs()
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    expect(mocks.fork).toHaveBeenCalledTimes(1)
    expect(child.send).not.toHaveBeenCalled()
    supervisor.stopSemanticProcesses()
    expect(child.kill).toHaveBeenCalledOnce()
  })
})

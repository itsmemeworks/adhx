import { describe, expect, it, vi } from 'vitest'
import { runExtractTask } from '@/lib/semantic/extract-task'

class BadImage extends Error {}
const readable = { width: 100, height: 100, lines: [] }
const request = { id: 'ocr', task: { kind: 'screen' as const, files: ['a.jpg', 'b.jpg'] } }
const model = (readScreenFile = vi.fn(async () => readable)) => ({
  ScreenImageError: BadImage,
  readScreenFile,
  readSamples: vi.fn(),
  transcribeSamples: vi.fn(),
})

describe('screen extraction failure policy', () => {
  it('does not report model loading or inference failure as empty text', async () => {
    for (const message of ['model weights unavailable', 'ONNX inference failed']) {
      const m = model(vi.fn().mockRejectedValue(new Error(message)))
      await expect(runExtractTask(request, m)).rejects.toThrow(message)
      expect(m.readScreenFile).toHaveBeenCalledTimes(1)
    }
  })
  it('allows a corrupt image only when another image was readable', async () => {
    const m = model(vi.fn().mockRejectedValueOnce(new BadImage()).mockResolvedValue(readable))
    await expect(runExtractTask(request, m)).resolves.toEqual({ id: 'ocr', reads: [readable] })
    await expect(
      runExtractTask(request, model(vi.fn().mockRejectedValue(new BadImage()))),
    ).rejects.toThrow('No screen images could be decoded')
  })
  it('distinguishes successfully read pictures with no words from failed pictures', async () => {
    await expect(runExtractTask(request, model())).resolves.toEqual({
      id: 'ocr',
      reads: [readable, readable],
    })
  })
  it('does not discard a later systemic failure after one good image', async () => {
    const m = model(
      vi.fn().mockResolvedValueOnce(readable).mockRejectedValue(new Error('out of memory')),
    )
    await expect(runExtractTask(request, m)).rejects.toThrow('out of memory')
  })
})

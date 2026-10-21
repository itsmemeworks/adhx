import type { ScreenRead, SpeechWindow } from './extract-clean'
import type { ExtractRequest, ExtractResponse } from './extractor'

interface ExtractModel {
  readSamples(file: string): Promise<Float32Array>
  transcribeSamples(samples: Float32Array): Promise<SpeechWindow[]>
  readScreenFile(file: string): Promise<ScreenRead>
  ScreenImageError: new (...args: never[]) => Error
}

/** A decoding failure may lose one picture, never an entire model failure.
 * No readable inputs is an error, unlike readable pictures containing no text. */
export async function runExtractTask(
  request: ExtractRequest,
  model: ExtractModel,
): Promise<ExtractResponse> {
  const { task } = request
  if (task.kind === 'speech') {
    const samples = await model.readSamples(task.file)
    return { id: request.id, windows: await model.transcribeSamples(samples) }
  }
  const reads = []
  for (const file of task.files) {
    try {
      reads.push(await model.readScreenFile(file))
    } catch (error) {
      if (!(error instanceof model.ScreenImageError)) throw error
    }
  }
  if (task.files.length > 0 && reads.length === 0)
    throw new Error('No screen images could be decoded')
  return { id: request.id, reads }
}

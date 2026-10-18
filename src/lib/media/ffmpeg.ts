/** The ffmpeg binary: `FFMPEG_PATH`, the bundled ffmpeg-static, or ffmpeg on PATH. */
export async function ffmpegPath(): Promise<string> {
  const fromEnv = process.env['FFMPEG_PATH']
  if (fromEnv) return fromEnv
  try {
    const bundled = (await import('ffmpeg-static')).default as unknown as string | null
    if (bundled) return bundled
  } catch {
    // fall back to ffmpeg on PATH
  }
  return 'ffmpeg'
}

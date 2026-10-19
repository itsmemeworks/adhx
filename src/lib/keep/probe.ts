import { execFile } from 'child_process'
import { ffmpegPath } from '@/lib/media/ffmpeg'

export interface Probed {
  width: number | null
  height: number | null
  durationMs: number | null
  hasVideo: boolean
  hasAudio: boolean
  /** e.g. `h264`, `hevc`, `vp9`, `av1` (null when there's no moving picture). */
  videoCodec: string | null
}

/** Read a media file's size and length from `ffmpeg -i` (there's no ffprobe in ffmpeg-static). */
export async function probeMedia(file: string, timeoutMs = 30_000): Promise<Probed> {
  const bin = await ffmpegPath()
  const stderr = await new Promise<string>((resolve) => {
    // `ffmpeg -i x` with no output always exits 1; the details are on stderr.
    execFile(
      bin,
      ['-hide_banner', '-nostdin', '-threads', '1', '-i', file],
      { timeout: timeoutMs, killSignal: 'SIGKILL' },
      (_e, _o, err) => resolve(String(err ?? '')),
    )
  })
  const duration = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  const video = stderr.match(/Stream #[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/)
  // Images report a Video stream too; their "Duration" is N/A.
  const codec = stderr.match(/Stream #[^\n]*Video: ([a-z0-9_]+)/)?.[1] ?? null
  return {
    videoCodec: codec,
    width: video ? Number(video[1]) : null,
    height: video ? Number(video[2]) : null,
    durationMs: duration
      ? Math.round(
          (Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000,
        )
      : null,
    hasVideo:
      /Stream #[^\n]*Video:/.test(stderr) &&
      !/Video: (?:mjpeg|png|webp)[^\n]*attached pic/.test(stderr),
    hasAudio: /Stream #[^\n]*Audio:/.test(stderr),
  }
}

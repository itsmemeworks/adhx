import type { ChildProcess } from 'child_process'
import os from 'os'

/**
 * Downloads and conversions run below the web server, like the model worker
 * (nice 10). On a throttled shared CPU an FFmpeg re-encode at equal priority
 * held every page for seconds; this way pages answer first. Children (yt-dlp's
 * own FFmpeg) inherit it.
 */
export function inBackground<T extends ChildProcess>(child: T): T {
  try {
    if (child.pid) os.setPriority(child.pid, 10)
  } catch {
    // Not permitted on some hosts; the work still runs.
  }
  return child
}

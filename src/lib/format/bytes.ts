/** "6.59 TB", "46.8 GB", "120 MB" (binary units, as disks report free space). */
export function bytesLabel(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 GB'
  const tb = bytes / 1024 ** 4
  if (tb >= 1) return `${tb >= 10 ? tb.toFixed(1) : tb.toFixed(2)} TB`
  const gb = bytes / 1024 ** 3
  if (gb >= 0.1) return `${gb.toFixed(1)} GB`
  const mb = bytes / 1024 ** 2
  return `${Math.max(1, Math.round(mb))} MB`
}

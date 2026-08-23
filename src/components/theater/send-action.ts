import type { LucideIcon } from 'lucide-react'
import { Copy, FileText, Film, Image as ImageIcon } from 'lucide-react'
import type { ContentType } from '@/components/matter'

/** Idle label + icon for the file send/download slot (video or photo). */
export function fileSendCopy(kind: ContentType | null): {
  label: string
  title: string
  Icon: LucideIcon
} {
  if (kind === 'photo') {
    return { label: 'Photo', title: 'Download the photo', Icon: ImageIcon }
  }
  return { label: 'Video', title: 'Download the video', Icon: Film }
}

/** Idle label + icon for the text-like Copy slot (tweet vs article). */
export function textCopyAction(kind: ContentType | null): {
  idleLabel: string
  copiedLabel: string
  title: string
  Icon: LucideIcon
} {
  if (kind === 'article') {
    return {
      idleLabel: 'Copy article',
      copiedLabel: 'Copied',
      title: 'Copy the article',
      Icon: FileText,
    }
  }
  return {
    idleLabel: 'Copy text',
    copiedLabel: 'Copied',
    title: "Copy the post's text",
    Icon: Copy,
  }
}

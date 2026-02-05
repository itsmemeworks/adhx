import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import { join } from 'path'

export const runtime = 'nodejs'
export const alt = 'ADHX - Save now. Read never. Find always.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  // Serve the static OG image
  const imagePath = join(process.cwd(), 'public', 'og-logo.png')
  const imageData = await readFile(imagePath)
  const imageBase64 = `data:image/png;base64,${imageData.toString('base64')}`

  return new ImageResponse(
    (
      <img
        src={imageBase64}
        alt={alt}
        width={size.width}
        height={size.height}
        style={{ width: '100%', height: '100%' }}
      />
    ),
    {
      ...size,
    }
  )
}

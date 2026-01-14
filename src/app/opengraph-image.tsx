import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import { join } from 'path'

export const runtime = 'nodejs'
export const alt = 'ADHX - Save now. Read never. Find always.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  // Load the logo image
  const logoPath = join(process.cwd(), 'public', 'logo.png')
  const logoData = await readFile(logoPath)
  const logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#030712',
          backgroundImage: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, transparent 50%)',
        }}
      >
        {/* Logo */}
        <img
          src={logoBase64}
          alt="ADHX Logo"
          width={180}
          height={180}
          style={{
            marginBottom: 32,
            objectFit: 'contain',
          }}
        />

        {/* Brand name */}
        <div style={{ fontSize: 72, fontWeight: 700, color: 'white', marginBottom: 16 }}>
          ADHX
        </div>

        {/* Tagline */}
        <div style={{ fontSize: 32, color: '#8B5CF6', marginBottom: 24 }}>
          Save now. Read never. Find always.
        </div>

        {/* Subtitle */}
        <div style={{ fontSize: 24, color: '#9CA3AF' }}>
          For people who bookmark everything and read nothing.
        </div>

        {/* URL */}
        <div style={{ position: 'absolute', bottom: 40, fontSize: 20, color: '#6B7280' }}>
          adhx.com
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}

import type { Metadata } from 'next'
import { InstallPage } from '../../components/InstallPage'
import { OG_IMAGE } from '../../components/seo'

const TITLE = 'Install the ADHX phone apps'
const DESCRIPTION =
  'ADHX Share isn’t in the stores. Install it on Android from GitHub, on iPhone through AltStore PAL in the EU or SideStore everywhere else, then connect it to your ADHX.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/install/' },
  openGraph: {
    type: 'website',
    url: '/install/',
    siteName: 'ADHX',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
}

export default function Install() {
  return <InstallPage />
}

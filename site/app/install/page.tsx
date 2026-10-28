import type { Metadata } from 'next'
import { InstallPage } from '../../components/InstallPage'

export const metadata: Metadata = {
  title: 'Install the ADHX phone apps',
  description:
    'ADHX Share isn’t in the stores. Install it on Android from GitHub, on iPhone through AltStore PAL in the EU or SideStore everywhere else, then connect it to your ADHX.',
}

export default function Install() {
  return <InstallPage />
}

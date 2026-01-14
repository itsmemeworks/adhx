import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { QuickAddLanding } from '@/components/QuickAddLanding'

interface Props {
  params: Promise<{ username: string; id: string }>
}

export default async function QuickAddPage({ params }: Props) {
  const { username, id } = await params

  // Validate username (Twitter handles are 1-15 alphanumeric + underscore)
  if (!/^\w{1,15}$/.test(username)) {
    redirect('/')
  }

  // Validate tweet ID (numeric only)
  if (!/^\d+$/.test(id)) {
    redirect('/')
  }

  // Check authentication
  const session = await getSession()

  if (!session) {
    // Show the quick add landing page for unauthenticated users
    return <QuickAddLanding username={username} tweetId={id} />
  }

  // User is authenticated - add the tweet via the API
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const tweetUrl = `https://x.com/${username}/status/${id}`

  try {
    const response = await fetch(`${baseUrl}/api/tweets/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the session cookie
        Cookie: `tweetstash_session=${JSON.stringify(session)}`,
      },
      body: JSON.stringify({ url: tweetUrl }),
    })

    const data = await response.json()

    if (data.success || data.isDuplicate) {
      // Redirect to main page with lightbox open
      redirect(`/?open=${id}`)
    } else {
      // Error adding tweet - redirect to home
      redirect('/')
    }
  } catch (error) {
    console.error('Failed to add tweet:', error)
    redirect('/')
  }
}

// Generate metadata for the page
export async function generateMetadata({ params }: Props) {
  const { username, id: _id } = await params
  return {
    title: `Save @${username}'s tweet - ADHX`,
    description: 'Save this tweet to your ADHX collection',
  }
}

import { withPhoneKey } from '@/lib/api/phone-auth'
import { momentStreamResponse } from '@/lib/moments/stream'
export const dynamic = 'force-dynamic'
/** Foreground list invalidations. Fetch the authenticated snapshot on open/reconnect. */
export const GET = withPhoneKey((request, { userId, keyId }) =>
  momentStreamResponse({ request, viewerId: userId, keyId, notify: true }),
)

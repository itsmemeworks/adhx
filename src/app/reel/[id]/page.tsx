// Instagram historically used `/reel/{id}` (singular) and recently `/reels/{id}`
// (plural). The bookmarklet host-swap lands on either depending on the source
// URL, so we serve both from the same page component.
export { default } from '@/app/reels/[id]/page'
export { generateMetadata } from '@/app/reels/[id]/page'

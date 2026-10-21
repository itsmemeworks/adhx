/** A successfully saved post; listeners match its platform:id before acting. */
export const POST_SAVED = 'nx-post-saved'

/**
 * A post's copy just arrived on this ADHX (the theater saw "Getting it ready"
 * end): a stage whose load failed while it waited loads it again. `{ key }`
 * is its platform:id.
 */
export const POST_KEPT = 'nx-post-kept'

/**
 * Pure placement logic for the signed-out "Connect with X" CTA card that
 * `DiscoverFeed` interleaves into the /trending grid. Kept separate (and
 * DOM-free) so the placement rule is unit-testable without mounting the feed.
 *
 * The CTA is inserted at render time only — it's never added to the `items`
 * state array, so the polling/dedupe/infinite-scroll pagination in
 * `DiscoverFeed` never sees it and can't be perturbed by it.
 */

/** Re-ask roughly every 18 real cards (first ask after the 18th). */
export const CTA_INTERVAL = 18

/**
 * True when a CTA slot belongs immediately after the `count`-th real card
 * has been placed (1-indexed — i.e. call with `index + 1` for a 0-indexed
 * loop). Fires after 18, 36, 54, … real cards.
 */
export function shouldInsertCtaAfter(count: number, interval: number = CTA_INTERVAL): boolean {
  return interval > 0 && count > 0 && count % interval === 0
}

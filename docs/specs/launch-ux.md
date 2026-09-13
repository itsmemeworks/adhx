# Launch UX

The first useful experience is: paste a social link, watch it in ADHX, and send
the video to a friend. Discovery gives new visitors something to watch immediately;
Saved makes their own posts easy to find again.

## Acceptance criteria

- Discover starts with Videos and Hide watched enabled for a new visitor.
- Saved starts with all post types and Hide watched disabled. Its name is Saved
  consistently across desktop, mobile, navigation, empty states, and help.
- Each destination remembers its own filters. A deliberate All selection survives
  reloads. Storage failures do not prevent watching. Legacy preferences migrate.
- A labelled content filter is visible beside Queue on desktop and mobile.
  One panel contains post type choices and a Hide watched switch. Its selected
  state remains understandable with the panel closed and using a screen reader.
- Watch filtering and Repeat are independent. Caught-up Discover offers an explicit
  Watch again action; it does not silently include excluded watched posts.
- Shared links always open their target. Public playlists retain their authored
  membership and order regardless of personal filters.
- Paste link uses a dark fill with an orange border in theater chrome.
  Mobile media actions are icon-only, matching the other 44px rail controls,
  with accessible names. Desktop retains action labels.
- Paste link and media send/download are clear, usable primary actions. Unsupported
  file-sharing formats retain an honest share-link alternative.
- First visits and empty accounts explain the paste/watch/send loop and provide
  a useful discovery path. Starter playlists can be opened before committing to save.
- Launch preparation includes a small verified clip selection, two or three themed
  playlist candidates, and a recommended Reddit entry link. No Reddit post is sent.
- Existing analytics distinguish playback, paste, and successful sharing/download;
  success must not be recorded for a failed or cancelled operation.
- Verify desktop, phone portrait and landscape, keyboard operation, and mobile
  WebKit; test empty, caught-up, returning, signed-in, signed-out, shared-link,
  and playlist flows. Run the repo checks and inspect actual rendered results.
- Commit, push, and open/update a PR. Production deployment remains a separate step.

## Verification record

- Unit suite: 271 files / 3,665 tests pass, including independent filter persistence,
  shared-link isolation, Repeat versus Hide watched, confirmed playback, failed
  downloads, and cancelled native sharing.
- Typecheck and formatting pass; lint has zero errors and 75 existing warnings.
- Browser checks cover fresh visits at 1440×900, 390×844, 360×740, and 844×390;
  returning preferences, empty accounts, Saved/Discover switching, keyboard controls,
  paste failures, shared targets, playlist loops, and mobile WebKit.
- Rendered phone portrait and landscape inspected: theater Paste link has a dark
  fill/orange border, mobile media actions are icon-only 44px controls, and the
  compact landscape rail clears the header and transport. Desktop retains labels.
- Public media delivery and actual browser playback evidence, with three themed
  playlist candidates, are recorded in `docs/launch-content.md`. No public content
  was created or Reddit message sent.
- Complete isolated browser suite: 124/124 pass (Chromium and mobile WebKit).
  Manual preview tabs were parked during the run; the shared-link fixture uses
  an existing save so asynchronous saving cannot change another test's collection.
- Implementation and verification complete for PR review. No production deployment performed.

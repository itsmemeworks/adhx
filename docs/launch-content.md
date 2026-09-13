# Launch content shortlist

Verified against public adhx.com on 13 September 2026. These are launch candidates,
not newly published collections. The live community feed can change; a direct demo
link gives Reddit visitors a predictable first experience.

## Recommended entry links

Use [the seven-second football clip](https://adhx.com/sudanalytics_/status/2086494316558447097)
as the immediate demo: it opened directly, loaded an MP4 and played in the browser
(`readyState=4`, `paused=false`, 6.93 seconds into a 7.48-second clip). It is short,
vertical, and shows the watch/share value quickly.

Follow with [the existing memes playlist](https://adhx.com/t/weedauwl/memes)
to demonstrate the collection theater. The public endpoint returned three posts;
the playlist opened with its authored queue and loaded playable video. Its material
includes AI humour, so describe it as a personal selection. The homepage is the
secondary “explore more” link after the launch UX is deployed.

## Small media selection

All four candidates returned HTTP 206, `video/mp4`, a 1,024-byte range, and a valid
full-file length during delivery checks. This verifies current delivery, not a
promise that an upstream social post will remain available.

| Candidate                | Link                                                               |   File size | Use                                                                       |
| ------------------------ | ------------------------------------------------------------------ | ----------: | ------------------------------------------------------------------------- |
| Brazilian football chaos | [Watch](https://adhx.com/sudanalytics_/status/2086494316558447097) |   726,015 B | Fast opening demo; actual browser playback confirmed                      |
| Kitchen observation      | [Watch](https://adhx.com/NeilLfc_5/status/2064025408673132701)     | 4,317,710 B | Group-chat humour candidate                                               |
| Grandad's bag prank      | [Watch](https://adhx.com/reels/DZ-8XgkI8_E)                        | 8,266,756 B | Instagram → actual video demonstration                                    |
| Fontaines D.C. clip      | [Watch](https://adhx.com/reels/DcL_k64IlAe)                        | 3,056,908 B | Music example; playback/download also verified in the prior delivery test |

## Three playlist candidates

- **Group chat ammunition:** the football, kitchen and Grandad clips. Keep it short;
  three reliable clips show the feature better than a long unreviewed feed.
- **Internet nonsense:** build from the existing three-post memes playlist. Keep the
  AI label/context on the Rooney/Glastonbury clip and put the strongest clip first.
- **Take five:** the Fontaines clip plus a few personally chosen music/nature clips.
  The public `storms` playlist currently has one item, so it is a seed, not a finished
  launch collection.

The first two are ready to curate from existing material; the third still needs
editorial selections. Review the complete clips, including sound, when choosing the
final public playlist order. No Reddit post or new production playlist was published
as part of this implementation.

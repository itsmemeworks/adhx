---
name: adhx
description: Search your own ADHX saves (posts kept from X, Instagram, TikTok, YouTube, Reddit and more) by meaning, including what is in pictures and videos, and fetch any X/Twitter post as clean LLM-friendly JSON. Use when the user asks to find something they saved, bookmarked or watched ("find my saved videos with a frog in them", "that article I saved about sleep", "the TikTok with the guy building a boat"), or shares an x.com or twitter.com post link (or a link to a post on their ADHX) and wants to read, analyze or summarize it.
metadata:
  source_url: https://github.com/itsmemeworks/adhx
---

# ADHX

ADHX keeps the posts a person saves from X, Instagram, TikTok, YouTube, Reddit, Facebook, LinkedIn, Vimeo, SoundCloud, Pinterest, Twitch, Threads, Imgur and Bluesky (X bookmarks sync about every hour), and understands them: what they say, what is in their pictures, and what happens in their videos. This skill does two things:

1. **Search the user's own saves** by meaning, with their access key.
2. **Read any X post** as structured JSON, no key needed.

## 1. Search the user's saves

### Setup (once)

Search needs the user's personal access key in the `ADHX_API_KEY` environment variable. Keys start with `adhx_`. ADHX is self-hosted: the user's server address is in `ADHX_URL` (e.g. `https://adhx.example.com`). If `ADHX_URL` isn't set, ask the user for their ADHX's address. adhx.com is only the project's website and has no API.

If `ADHX_API_KEY` is not set, ask the user to:

1. Open their ADHX's Settings page (`$ADHX_URL/settings#access-keys`)
2. Under **Search from Claude**, name a key and press **Make a key**, then copy it (it is shown once)
3. Set it in their shell profile (`export ADHX_API_KEY=adhx_...`, plus `export ADHX_URL=https://their-adhx.example` for their own server) or the agent's environment settings

Never print, log or repeat the key. Pass it only in the `Authorization` header to the user's ADHX.

### Request

```bash
curl -s -G "$ADHX_URL/api/agent/search" \
  -H "Authorization: Bearer $ADHX_API_KEY" \
  --data-urlencode "q=a frog" \
  --data-urlencode "type=videos"
```

| Parameter | Values                                                  | Notes                                                     |
| --------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `q`       | plain words, up to 200 characters                       | Required. Describe the thing, not the request (see below) |
| `type`    | `all` (default), `videos`, `photos`, `text`, `articles` | Use it whenever the user names a kind of post             |
| `limit`   | 1–30, default 10                                        |                                                           |
| `offset`  | from `nextOffset` in the last response                  | Next page                                                 |

### Turning a request into `q` and `type`

Search matches meaning across words, pictures and video frames, so `q` should describe **what is in the post**. Move the kind of post into `type` and drop filler like "find", "my", "saved", "that one":

| User says                                            | `q`                                 | `type`     |
| ---------------------------------------------------- | ----------------------------------- | ---------- |
| "videos that contain a frog"                         | `a frog`                            | `videos`   |
| "that photo of a red sports car I saved"             | `red sports car`                    | `photos`   |
| "the article about sleep and memory"                 | `sleep and memory`                  | `articles` |
| "anything I saved about Rust async"                  | `Rust async programming`            | `all`      |
| "the clip where someone explains it on a whiteboard" | `person explaining on a whiteboard` | `videos`   |

If nothing comes back close, try once more with a broader or differently worded `q` (e.g. `frog` → `amphibian` or `toad`) before saying it isn't there.

### Response

```json
{
  "query": "a frog",
  "type": "videos",
  "results": [
    {
      "platform": "twitter",
      "kind": "video",
      "url": "https://x.com/frogfan/status/111",
      "adhxUrl": "https://adhx.example.com/frogfan/status/111",
      "author": { "handle": "frogfan", "name": "Frog Fan" },
      "text": "look at this little guy",
      "postedAt": "2026-10-01T00:00:00.000Z",
      "savedAt": "2026-10-02T00:00:00.000Z",
      "article": null,
      "links": ["https://frogs.example/care"],
      "media": [
        { "type": "video", "url": "https://…", "thumbnailUrl": "https://…", "durationSeconds": 12 }
      ],
      "tags": ["nature"],
      "match": { "strength": "strong", "on": ["video", "words"] }
    }
  ],
  "total": 1,
  "nextOffset": null
}
```

- Results are best first. `match.strength` is `strong` (it's the thing), `good` (very likely) or `related` (close in meaning, not exactly it). `match.on` says what matched: `video`, `picture`, `words` or `keywords`.
- `closest` appears when nothing matched closely: say so, and offer the nearest results as maybes.
- `note` appears when search fell back to exact words, or when a post's picture or video isn't understood yet.
- `kind` is one of `video`, `photo`, `text`, `article` (a SoundCloud track is a `video` with sound only). `platform` is `twitter`, `instagram`, `tiktok`, `youtube`, `facebook`, `reddit`, `linkedin`, `vimeo`, `soundcloud`, `pinterest`, `twitch`, `threads`, `imgur` or `bluesky`.
- `media[].url` is the file on the user's ADHX, in the best quality it kept.
- `links` are the outside web pages the post points to. To read one, fetch it with your normal web tools.
- For an X post with an `article`, or to read a whole X thread or article, use the post reader below with the `url`.

### Presenting results

List the matches with their strength, the author, a one-line description from `text` (or the article title), and link to `adhxUrl` (it plays the post in ADHX) with `url` as the original. Don't paste raw JSON unless asked.

### Errors

| Status | Meaning                                                                   |
| ------ | ------------------------------------------------------------------------- |
| 401    | Key missing, mistyped or removed: ask the user to check or make a new one |
| 400    | `q` empty or `type` not one of the values above                           |
| 429    | Too many searches; wait for `Retry-After` seconds                         |

## 2. Read any X post

```
$ADHX_URL/api/share/tweet/{username}/{statusId}
```

Extract `username` and `statusId` from any of these:

| Format                           | Example                                                        |
| -------------------------------- | -------------------------------------------------------------- |
| `x.com/{user}/status/{id}`       | `https://x.com/dgt10011/status/2020167690560647464`            |
| `twitter.com/{user}/status/{id}` | `https://twitter.com/dgt10011/status/2020167690560647464`      |
| `<your ADHX>/{user}/status/{id}` | `https://adhx.example.com/dgt10011/status/2020167690560647464` |

```bash
curl -s "$ADHX_URL/api/share/tweet/dgt10011/2020167690560647464"
```

Response:

```json
{
  "id": "statusId",
  "url": "original x.com URL",
  "text": "short-form tweet text (empty if article post)",
  "author": { "name": "Display Name", "username": "handle", "avatarUrl": "profile image URL" },
  "createdAt": "timestamp",
  "engagement": { "replies": 0, "retweets": 0, "likes": 0, "views": 0 },
  "article": {
    "title": "Article title (for long-form posts)",
    "previewText": "First ~200 chars",
    "coverImageUrl": "hero image URL",
    "content": "Full markdown content with images"
  }
}
```

- `text` holds the body of a regular post; `article.content` holds the full markdown of a long-form X article, with images as `![](url)`.
- No key needed (it uses the user's ADHX at `ADHX_URL`). Always prefer this over scraping or a browser for X content.
- If it errors or comes back empty, tell the user the post may not be available.

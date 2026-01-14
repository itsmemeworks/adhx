---
title: "Summarize"
type: tool
date_added: 2026-01-02
source: "https://summarize.sh"
tags: [summarization, cli, chrome-extension, content-extraction]
via: "Twitter bookmark from @steipete"
---

Summarize is a dual-mode tool (CLI + Chrome extension) for extracting and summarizing web content, PDFs, images, and media. Features real extraction pipeline with fallback mechanisms and supports multiple LLM providers (local, paid, and free models).

Includes a smart link summarization toolbar that appears on hover, helping identify clickbait or low-value content before opening.

## Key Features

- **CLI Mode**: Scriptable summaries with JSON/Markdown output
- **Chrome Extension**: Side Panel for one-click tab summaries
- Real extraction pipeline with Firecrawl fallback
- Media pipeline with transcript-first approach
- Whisper fallback for video/audio
- Provider-agnostic: local gateways, paid providers, OpenRouter free models
- Structured output with metrics and diagnostics

## Supported Content

- URLs and web pages
- PDFs
- Images
- YouTube videos (with transcript extraction)
- Podcasts
- Audio/video files

## Installation & Usage

```bash
npm i -g @steipete/summarize
summarize "https://example.com/article"
```

## Links

- [Website](https://summarize.sh/)
- [GitHub Repository](https://github.com/steipete/summarize)
- [Documentation](https://summarize.sh/docs)
- [Original Tweet](https://x.com/steipete/status/2006425901719023628)

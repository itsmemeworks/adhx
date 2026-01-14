---
title: "Sessy"
type: tool
date_added: 2026-01-02
source: "https://github.com/marckohlbrugge/sessy"
tags: [email, observability, aws-ses, monitoring, self-hosted]
via: "Twitter bookmark from @marckohlbrugge"
---

Sessy is an open-source email observability platform for Amazon SES. It provides a beautiful, self-hosted interface to monitor and analyze email delivery, bounces, complaints, opens, clicks, and other events without relying on expensive commercial SES wrappers.

Marc Köhlbrugge built Sessy after switching from Postmark to AWS SES for cost and deliverability reasons, but missing Postmark's polished monitoring UI. Rather than paying for another VC-backed wrapper, he created an open-source alternative you can host yourself.

## Key Features

- **Event Timeline** - Single view of all email events (sends, deliveries, bounces, complaints, opens, clicks)
- **Self-Hosted** - Run on your own infrastructure, not SaaS
- **Cost-Effective** - Eliminate expensive SES wrapper fees
- **Beautiful UI** - Professional interface for email monitoring
- **Open Source** - O'Saasy licensed, community-maintained
- **Docker Support** - Easy deployment with Docker

## Technical Details

- **Language:** Ruby (Rails)
- **License:** O'Saasy (open-source with commercial-friendly terms)
- **Repository:** github.com/marckohlbrugge/sessy
- **Stars:** 199
- **Status:** Production-ready (used at BetaList), active development
- **Inspiration:** Based on @37signals' Fizzy

## Installation

Easiest deployment with Docker:

```bash
docker run -p 80:80 \
  -e SECRET_KEY_BASE=$(openssl rand -hex 64) \
  -e DISABLE_SSL=true \
  -v sessy:/rails/storage \
  ghcr.io/marckohlbrugge/sessy:main
```

## Use Cases

- Monitoring AWS SES email deliverability
- Tracking email events and engagement
- Cost-effective alternative to commercial email monitoring services
- Self-hosted email observability for privacy-conscious teams

## Links

- [GitHub](https://github.com/marckohlbrugge/sessy)
- [Original Tweet](https://x.com/marckohlbrugge/status/2005972157445333371)
- [Inspiration: Fizzy by 37signals](https://github.com/basecamp/fizzy)

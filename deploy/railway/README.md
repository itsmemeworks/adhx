# ADHX on Railway

Railway's **Deploy on Railway** buttons point at a template made in a Railway
account, not at a file in this repository. This page is the recipe for that
template, and how to deploy by hand until it exists.

## By hand (about two minutes)

1. In Railway, **New project → Docker image**: `ghcr.io/itsmemeworks/adhx:latest`.
2. On the service, **Settings → Networking → Generate domain** (port `3000`).
   Railway then sets `RAILWAY_PUBLIC_DOMAIN`, and ADHX uses it as its address.
3. **Add a volume** mounted at `/data`. It holds the database, the search
   models and every kept file, so give it room for your media.
4. **Variables**: add `SETUP_CODE` with any long value you like (or leave it
   out and read the code from the deploy logs).
5. Deploy, open the domain, and enter the setup code.

Search by meaning needs about 2 GB of memory. Railway bills by use, so an
always-on ADHX costs more than the Hobby plan's included credit; check
Railway's pricing page for current rates.

## The template (for the maintainers)

Create it from **Templates → New template** and publish it, then put its
button in the README:

| Setting  | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Source   | Docker image `ghcr.io/itsmemeworks/adhx:latest`                    |
| Domain   | Public, port `3000`                                                |
| Volume   | `/data`                                                            |
| Variable | `SETUP_CODE` = `${{secret(12, "ABCDEFGHJKMNPQRSTVWXYZ23456789")}}` |
| Variable | `SESSION_SECRET` = `${{secret(48)}}`                               |
| Variable | `SEMANTIC_THREADS` = `1`                                           |
| Health   | `/api/health`                                                      |

The setup code then shows on the service's Variables tab, so nobody needs the
logs.

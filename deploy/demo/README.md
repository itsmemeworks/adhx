# The public demo

[demo.adhx.com](https://demo.adhx.com) is an ADHX anyone can look around
without installing anything. Everyone who visits is **Sam**, with Ana, Ben,
Mum and Jo saving the posts credited on adhx.com
([`site/public/media/credits.json`](../../site/public/media/credits.json)).

- **Read-only.** [`gate.ts`](gate.ts) sits in front of the app and refuses
  every request that could change something: saves, reactions, invites,
  sign-ins, X connect and sync. Nothing is ever fetched from the networks, so
  the demo can't be used to download anyone's videos.
- **Fresh every day.** [`start.sh`](start.sh) reseeds the showcase world
  (`PARITY_SHOWCASE=1 PARITY_DEMO=1`, see [`e2e/parity`](../../e2e/parity))
  on every start and again every 24 hours, so Right now and New stay current.
- **Demo mode** (`DEMO_MODE=1`, `src/lib/demo/`) makes visitors without a
  session the demo person and shows the demo pill.
- Search works on words only: no models run in the demo.

## Deploying

The image is the ADHX image plus the world's seed and media. Build the ADHX
image for the code you want (a release, or a branch on Fly's builder), then
the demo on top. From the repository root:

```bash
# Optional: the app from this checkout instead of a release.
fly deploy . --config deploy/demo/base.fly.toml --dockerfile Dockerfile \
  --build-only --push --image-label base-$(git rev-parse --short HEAD) --app adhx-demo

fly deploy . --config deploy/demo/fly.toml --dockerfile deploy/demo/Dockerfile \
  --ignorefile deploy/demo/Dockerfile.dockerignore --app adhx-demo \
  --build-arg ADHX_IMAGE=registry.fly.io/adhx-demo:base-$(git rev-parse --short HEAD)
```

Leave out the first command and `--build-arg` to build on
`ghcr.io/itsmemeworks/adhx:latest`. The domain is `fly certs add
demo.adhx.com --app adhx-demo` plus the DNS records it prints.

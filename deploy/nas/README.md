# ADHX on a home NAS, with Tailscale Funnel

ADHX runs in Docker on the NAS. A Tailscale container next to it serves
`https://adhx.<your-tailnet>.ts.net` to the whole internet (Funnel), so friends
can use it without Tailscale. Your own devices on the tailnet reach it
directly, which is faster for big videos.

Written for a UGREEN NAS (UGOS Pro, Docker app installed); any Linux box with
Docker Compose works the same way.

## 1. Tailscale admin console (once)

- **DNS → HTTPS Certificates:** Enable. Funnel needs them.
- **Access controls:** the default policy already lets members use Funnel. If
  you've edited it, keep a `nodeAttrs` entry with `"attr": ["funnel"]` for
  `autogroup:member`.
- **Settings → Keys → Generate auth key:** not ephemeral, not reusable. It's
  only used the first time.

## 2. The NAS (once)

- UGOS: **Control Panel → Terminal → SSH:** on.
- Copy this repository to the NAS, for example to `/volume1/docker/adhx`.
- In `deploy/nas/`, make your settings:

```sh
cp .env.example .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 32)|" .env
```

Then edit `.env`: the auth key (`TS_AUTHKEY`), who may sign up
(`ALLOWED_EMAILS`), and, optionally, the search refine key and an X app. Keep
`SESSION_SECRET` as it is from now on: changing it signs everyone out.

## 3. Start it

```sh
cd /volume1/docker/adhx/deploy/nas
sudo docker compose up -d --build
```

The first build takes a while (10–20 minutes on a small NAS). Then:

- The device **adhx** appears in your tailnet. In the admin console, open its
  menu and choose **Disable key expiry**. You can now delete `TS_AUTHKEY` from
  `.env`.
- Open `https://adhx.<your-tailnet>.ts.net/start` and enter your email. Nobody
  runs this ADHX yet, so your sign-in link is printed in the log:

```sh
sudo docker compose logs adhx | grep sign-in
```

Open it, and you're the admin. Friends' links then wait on your admin page;
pass them on.

- First search: the search model (about 400 MB) downloads into the data folder
  the first time it's needed.

## Phones

Install ADHX Share, then on the web open **Settings → Phone app** and pair with
the code or link. The app only talks to your ADHX.

## Updating

Copy the new code over, then rebuild:

```sh
sudo docker compose up -d --build
```

Migrations run on start. To update only yt-dlp (sites change often) without a
rebuild:

```sh
sudo docker compose exec adhx /opt/yt-dlp/bin/pip install -U "yt-dlp[default]"
```

## What's where

- `data/` (or `ADHX_DATA_DIR`): the database, the search model, and every kept
  picture and video. Back up this folder. Videos are kept at the best quality
  offered: a 4K music video is about 500 MB. Downloads pause when the disk has
  less than `KEEP_MIN_FREE_GB` free (20 by default).
- The Tailscale login lives in the `tailscale_state` Docker volume.

## Notes

- Nothing on the NAS is opened to the internet except that one HTTPS address.
  ADHX itself publishes no port. To also reach it on your home network at
  `http://<nas>:3000`, uncomment `ports` in `docker-compose.yml`.
- X bookmark sync needs your own X developer app, with the callback
  `https://adhx.<your-tailnet>.ts.net/api/auth/twitter/callback`.

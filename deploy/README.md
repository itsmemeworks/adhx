# Install ADHX anywhere

Every recipe in this folder, one section each. The [README](../README.md#one-click-wherever-you-host)
links each host's logo here. Wherever it runs, the first screen asks for a
setup code: it's in the server log (`grep setup`), or in the host's dashboard
when the recipe made one (`SETUP_CODE`).

## Any Linux server

Installs Docker if it's missing, keeps ADHX in `/opt/adhx` and prints the link
that makes you the owner. Run it again to update. [What it does](install.sh).

```bash
curl -fsSL https://raw.githubusercontent.com/itsmemeworks/adhx/main/deploy/install.sh | sudo sh
```

With a domain, HTTPS included (add it later and everything is kept):

```bash
curl -fsSL https://raw.githubusercontent.com/itsmemeworks/adhx/main/deploy/install.sh | sudo ADHX_DOMAIN=adhx.example.com sh
```

## A new cloud server

At Hetzner, DigitalOcean, Vultr, Akamai (Linode) or any host with cloud-init:
paste [`cloud-init.yaml`](cloud-init.yaml) into **User data** when you create
the server. It runs the installer above on first boot.

## Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/itsmemeworks/adhx)

Uses [`render.yaml`](../render.yaml): the Standard plan with a disk.

## Railway

[The two-minute recipe](railway/README.md): a Docker image, a domain and a
volume at `/data`.

## Fly.io

[`fly/fly.toml`](fly/fly.toml) runs the published image on one dedicated CPU
with 4 GB. Pick your own app name:

```bash
curl -fsSLO https://raw.githubusercontent.com/itsmemeworks/adhx/main/deploy/fly/fly.toml
fly launch --copy-config --no-deploy --name your-adhx
fly volumes create adhx_data --size 20 --region lhr --yes --app your-adhx
fly deploy --app your-adhx
fly logs --app your-adhx --no-tail | grep setup
```

More in [the self-hosting guide](../docs/self-hosting.md#flyio).

## Zeabur

[`zeabur/template.yaml`](zeabur/template.yaml). A Deploy button follows once
the template is published.

## Portainer

**Settings → App Templates**, add this URL, then **App Templates → ADHX**:

```text
https://raw.githubusercontent.com/itsmemeworks/adhx/main/deploy/portainer/templates.json
```

## CapRover

**One-Click Apps → >> TEMPLATE <<**, then paste [`caprover/adhx.yml`](caprover/adhx.yml).

## Dokploy, Coolify, CasaOS, Synology and TrueNAS

Paste [`one-click/docker-compose.yml`](one-click/docker-compose.yml) into the
app's Compose box.

## Your own Compose, with Caddy for HTTPS

[`vps/docker-compose.yml`](vps/docker-compose.yml), from that folder:

```bash
ADHX_DOMAIN=adhx.example.com docker compose up -d
```

## Unraid

The container template: [`unraid/adhx.xml`](unraid/adhx.xml).

## Umbrel

The app folder: [`umbrel/adhx`](umbrel/adhx). It isn't in the Umbrel store yet.

## UGREEN NAS

[The UGOS Pro walkthrough](nas/ugreen.md). Other NAS boxes:
[Docker and NAS deployment](nas/README.md).

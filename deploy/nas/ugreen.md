# UGREEN NAS: install ADHX through UGOS Pro

This optional appendix maps the [portable Docker guide](README.md) onto UGOS
Pro. The application, proxy, authentication and backup requirements stay the
same. Menu wording varies by UGOS version; UGREEN documents
**Docker → Project → Create** in its
[Compose project example](https://support.ugnas.com/detail/article/en-US/507).

## Prepare the project

Use a published ADHX image for the NAS architecture and record its version or
digest. No source checkout or local build is needed for a published image.
Prepare the final HTTPS address, a stable random `SESSION_SECRET`, invited
emails and a [sign-in delivery method](../../README.md#sign-in-links).

In File Manager, create a dedicated folder under an existing Docker shared
folder. An example host path is `/volume1/docker/adhx`; use the actual volume
and path on your NAS. Keep private Compose configuration here, separate from
the application's data. Do not mount the entire shared Docker folder.

For a container-based HTTPS proxy, find the actual Docker network shared with
that proxy and set `ADHX_PROXY_NETWORK` accordingly. The generic example
publishes no host port; the proxy connects to `http://adhx:3000`. For a proxy
running on the NAS host, use the [host-proxy example](../../docker-compose.yml)
instead, with its loopback-only published port.

## Choose storage and initialize permissions

The image runs as **UID 1001**. It does not implement the `PUID` and
`PGID` environment variables used by some NAS containers. NAS login permissions
alone do not prove that UID 1001 can write the data folder. Keep the application
running as its normal non-root user.

**Bind folder:** create a new, empty `data` subfolder, for example
`/volume1/docker/adhx/data`, and set `ADHX_DATA_DIR` to that absolute path. This
dedicated subfolder is mounted at `/data`. If UGOS's supported permissions
controls already make it writable by UID 1001, no initializer is needed.

Otherwise, add the following service and completion dependency to the
**complete** generic [`docker-compose.yml`](docker-compose.yml). Preserve
`adhx`'s existing image, environment, health check, volume and network settings:

```yaml
services:
  data-init:
    image: ${ADHX_IMAGE:?Select the intended ADHX image}
    user: '0:0'
    restart: 'no'
    network_mode: none
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - FOWNER
      - DAC_OVERRIDE
    entrypoint: ['/bin/sh', '-ec']
    command: ['chown 1001:1001 /data && chmod 0700 /data']
    volumes:
      - ${ADHX_DATA_DIR:?Select the dedicated empty data folder}:/data

  adhx:
    # Keep all existing settings from docker-compose.yml here.
    depends_on:
      data-init:
        condition: service_completed_successfully
```

Use the same pinned image for both services. This helper has no network and
changes only the mounted directory itself, without recursive ownership changes.
It is for an empty folder, not repairing an existing library. Docker documents
the dependency in its
[startup-order guide](https://docs.docker.com/compose/how-tos/startup-order/).

The initializer should finish with **exit code 0**. UGOS may count this completed
helper as a stopped container, showing the project as partly running or in an
error state even when ADHX itself is healthy. Check the helper's exit code and
the application's health separately. Remove both `data-init` and
`adhx.depends_on` from the saved project after successful initialization. Keep
the application and its data mount. Existing files restored from a backup must
also retain the correct ownership; changing the top directory alone does not
repair their permissions.

When replacing the Compose document in the project editor, select and clear
the existing text first, then verify the replacement contains a single
`services` section. Review the redeployment confirmation: only the unused
helper should disappear; keep application data and its mount. After
redeployment, verify that the application is running and inspect its logs
before retrying an operation because of a temporary notification.

**Named volume alternative:** replace the bind mount on `adhx` with
`adhx_data:/data` and add a top-level `volumes: { adhx_data: {} }`. Do not add
`data-init`. With Docker's default initialization, a new empty volume inherits
the image's `/data` ownership. Do not enable `nocopy`. Record the actual volume
name from the container's mount details, since Compose usually prefixes it
with the project name. Docker manages its location; copying the UGOS project
folder alone will not back up the database or media. See Docker's
[volume documentation](https://docs.docker.com/engine/storage/volumes/).

## Create and start the project

1. Open **Docker → Project → Create**, name the project and select its dedicated
   folder. Import the complete Compose file or use the Compose editor.
2. Supply private values through the interface or a private `.env` beside the
   Compose file. Confirm that the interface resolves the variables. Entries
   reach the container only when the Compose `environment` section passes them
   through. If environment-file loading is unavailable, save private values in
   the project's configuration instead; never share that populated file.
3. Keep `SEMANTIC_SEARCH=on`, `SEMANTIC_THREADS=1` and `KEEP_CONCURRENCY=1` as a
   starting point for contextual search on a shared NAS. Permit the first model
   download and measure actual memory/CPU alongside other applications.
4. Deploy the project, inspect its container logs and wait for ADHX to become
   healthy. A one-shot initializer finishing successfully is expected.

Configure HTTPS, DNS, forwarding headers, byte ranges and event streams as
described in the [generic guide](README.md#https-and-access). Creating a Docker
project does not create a proxy route, certificate or DNS record. Choose the
intended LAN/VPN/public boundary separately; do not enable public access just
to make this container reachable. Personal lists/search require sign-in, while
kept media and shared previews are available to anyone who can reach ADHX.

## First sign-in and verification

Open the final HTTPS address and request your owner sign-in link. With
`EMAIL_LINKS_TO_ADMIN=1` and no existing owner, read it privately from the ADHX
container's logs in Docker, open it in your normal browser and press **Sign in**. Keep the link and log screenshots
private. Later invited users' links wait in the admin interface for 60 minutes.
Recipients open them and press **Sign in**; message previews do not consume links.

Save a picture and video, wait for their files to finish downloading, check
playback and seeking, then search for words and visible content. The first
model download takes time. A healthy web/database status does not prove that
model inference or a source-network downloader is working.

For a bulk X import, use the [shared-host resource checks](README.md#resource-and-storage-controls).
In **Docker → Container → your ADHX container → Basic Information → Others**,
check the effective CPU and memory limits; **Process** helps distinguish the
web server from model workers. Menu labels can differ. Use Docker's overview
and Task Manager for total CPU, available memory/cache and disk load, alongside
the app's learning progress. A CPU limit without a RAM limit still permits
memory growth. Test search and playback while indexing is active before
increasing concurrency. A completed text pass does not measure peak video
inference memory.

Restart or recreate this project and verify accounts, files and search survive.
Confirm the intended bind folder or named volume remains mounted. Pair phones
with the final HTTPS address when a native app is available. Record the running
image and device-specific observations privately.

## Updates and backups

Back up the private configuration and application data. Stop ADHX before
copying SQLite, its WAL state and retained media together, or use the
[coordinated backup method](README.md#updates-backups-and-recovery). A named
volume needs a volume-aware export, rather than a copy of the project folder.

For updates, select and pull the new pinned image, then recreate only this
project with the same data mount and session secret. Preserve other projects
and shared proxy networks. Keep the previous image reference and a matching
backup, and test a restore in a separate project. Avoid any option to delete
associated data/volumes unless you intend to remove the library.

For an environment/resource change, edit the existing project's complete
Compose configuration and **Redeploy**, keeping the image reference and data
mount. Choose image pulling when deliberately updating the image. The
deployment-log panel can be blank or keep saying **Processing** after the
project is already running: inspect the actual container status, logs and
HTTPS health before retrying a deployment. Never paste a sanitized guide over
working credentials. See [X sync timing and optional keys](README.md#optional-services-and-x-sync).

UGOS can show an **Updatable** badge when image update detection is enabled
and a tracked tag changes. An image pinned by digest will not follow a new
release; a numbered tag will not advance to the next number either. Use the
[channel table](README.md#choose-an-update-channel) to choose between explicit
digest updates and a moving tag, then use the project's update/redeployment
flow to apply it. The badge is a notification, not proof an update has been
installed. See UGREEN's [project update guide](https://support.ugnas.com/detail/article/en-US/411).

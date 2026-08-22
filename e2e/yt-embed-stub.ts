import type { Page } from '@playwright/test'

/**
 * Stand-in for the youtube-nocookie embed. Origin stays
 * `https://www.youtube-nocookie.com` so StageYouTube's postMessage filter
 * accepts it. Autoplay reports playing + duration but withholds currentTime
 * until a click inside the frame — the real-player starvation the clay bar
 * now interpolates around.
 */
export function fakeYtPlayerHtml(durationSec: number): string {
  return `<!doctype html><html><head>
<style>html,body{margin:0;width:100%;height:100%;background:#000;min-height:100vh}</style>
</head><body>
<script>
(function () {
  var duration = ${durationSec};
  var started = Date.now();
  var frozenElapsed = 0;
  var reportTime = false;
  var playerState = 1;
  function send(event, info) {
    parent.postMessage(JSON.stringify({ event: event, info: info }), '*');
  }
  function elapsed() {
    if (playerState !== 1) return frozenElapsed;
    return Math.min(duration, (Date.now() - started) / 1000);
  }
  window.addEventListener('message', function (e) {
    var data;
    try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
    if (!data || typeof data !== 'object') return;
    if (data.event === 'listening') {
      send('onReady');
      send('infoDelivery', { playerState: 1, duration: duration, muted: true });
    }
    if (data.event !== 'command') return;
    if (data.func === 'getDuration') {
      send('infoDelivery', { duration: duration, playerState: playerState });
    }
    if (data.func === 'getCurrentTime' && reportTime) {
      send('infoDelivery', { currentTime: elapsed(), duration: duration, playerState: playerState });
    }
    if (data.func === 'pauseVideo') {
      frozenElapsed = elapsed();
      playerState = 2;
      send('onStateChange', 2);
    }
    if (data.func === 'playVideo') {
      started = Date.now() - frozenElapsed * 1000;
      playerState = 1;
      send('onStateChange', 1);
    }
  });
  document.addEventListener('click', function () {
    reportTime = true;
    send('infoDelivery', { playerState: playerState, currentTime: 15, duration: duration });
  });
})();
</script>
</body></html>`
}

/** Exact host match — never `.includes()`. CodeQL js/incomplete-url-substring-sanitization. */
export function isYoutubeNocookieFrameUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'www.youtube-nocookie.com' || host === 'youtube-nocookie.com'
  } catch {
    return false
  }
}

export async function stubYouTubeEmbed(page: Page, durationSec = 20): Promise<void> {
  await page.route('https://www.youtube-nocookie.com/embed/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: fakeYtPlayerHtml(durationSec),
    })
  })
}

export async function progressFillPercent(page: Page): Promise<number> {
  const fill = page.locator('[data-theater-progress-fill]').first()
  await fill.waitFor({ state: 'attached', timeout: 15_000 })
  return fill.evaluate((el) => {
    const raw = (el as HTMLElement).style.width || '0'
    return Number.parseFloat(raw) || 0
  })
}

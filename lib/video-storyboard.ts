import { chromium, Browser } from "playwright";

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--allow-running-insecure-content",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-gpu",
      ],
    });
  }
  return sharedBrowser;
}

const EXTRACT_SCRIPT = `
(function(videoUrl, frameCount) {
  return new Promise(function(resolve) {
    var video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    document.body.appendChild(video);

    var timeout = setTimeout(function() {
      resolve([]);
    }, 12000);

    function onMetadata() {
      var duration = (video.duration && !isNaN(video.duration) && video.duration > 0) ? video.duration : 10;
      var vW = video.videoWidth || 640;
      var vH = video.videoHeight || 360;

      var width, height;
      if (vH > vW) {
        // Portrait / Vertical Video (e.g. 9:16 Reels or 4:5 Feed)
        height = Math.min(vH, 720);
        width = Math.round((height / vH) * vW);
      } else {
        // Landscape / Square Video (e.g. 16:9 or 1:1)
        width = Math.min(vW, 640);
        height = Math.round((width / vW) * vH);
      }

      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var ctx = canvas.getContext('2d');

      if (!ctx) {
        clearTimeout(timeout);
        resolve([]);
        return;
      }

      var intervals = [0.1, 0.3, 0.5, 0.7, 0.9];
      var timestamps = intervals.map(function(pct) {
        return Math.max(0.2, Math.min(duration - 0.2, duration * pct));
      });

      var results = [];
      var currentIndex = 0;

      function captureNext() {
        if (currentIndex >= timestamps.length) {
          clearTimeout(timeout);
          resolve(results);
          return;
        }

        var ts = timestamps[currentIndex];
        function onSeeked() {
          video.removeEventListener('seeked', onSeeked);
          try {
            ctx.drawImage(video, 0, 0, width, height);
            var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            results.push(dataUrl);
          } catch(e) {}
          currentIndex++;
          captureNext();
        }

        video.addEventListener('seeked', onSeeked);
        video.currentTime = ts;
      }

      captureNext();
    }

    if (video.readyState >= 1) {
      onMetadata();
    } else {
      video.addEventListener('loadedmetadata', onMetadata);
      video.addEventListener('error', function() {
        clearTimeout(timeout);
        resolve([]);
      });
    }
  });
})
`;

/**
 * Extracts 5 storyboard frame buffers from a remote video URL using
 * browser canvas seeking (HTTP Range requests) without downloading the full video.
 */
export async function extractStoryboardFrames(
  videoUrl: string,
  frameCount: number = 5
): Promise<Buffer[]> {
  if (!videoUrl) return [];

  let context = null;
  let page = null;

  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      bypassCSP: true,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    page = await context.newPage();
    page.setDefaultTimeout(15000);

    await page.goto("about:blank");

    const frameDataUrls: string[] = await page.evaluate(
      `${EXTRACT_SCRIPT}(${JSON.stringify(videoUrl)}, ${frameCount})`
    );

    if (frameDataUrls && frameDataUrls.length > 0) {
      const buffers = frameDataUrls.map((dataUrl) => {
        const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
        return Buffer.from(base64, "base64");
      });
      return buffers;
    }
  } catch (err: any) {
    console.warn(`[Video Storyboard] Frame extraction skipped (${err.message}) for ${videoUrl.substring(0, 70)}...`);
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }

  return [];
}

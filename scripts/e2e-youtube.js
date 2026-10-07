// End-to-end check on YouTube: Chromium with the extension loaded and a fake webcam that plays a
// scripted video of real hand photos (MediaPipe's sample images). Logs what happens to the video.
//
//   node scripts/e2e-youtube.js [youtube-url]
//
// Needs Playwright's Chromium (npx playwright install chromium) and network access.

import { mkdtempSync, existsSync, createWriteStream, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "..");
const EXT = join(ROOT, "extension");
const URL = process.argv[2] || "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
const W = 480;
const H = 270;
const FPS = 30;
const PHOTOS = {
  palm: "https://storage.googleapis.com/mediapipe-assets/right_hands.jpg", // right hands, open, facing the camera
  thumbs_up: "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/thumbs_up.jpg", // right
  fist: "https://storage.googleapis.com/mediapipe-assets/fist.jpg", // right
  point: "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/pointing_up.jpg", // a LEFT hand
  peace: "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/victory.jpg", // right
};
// Run with the default settings: gestures start with a wake palm, right hand only.
// [seconds, photo or null, x centre in the raw (unmirrored) frame from start to end]
// The tracker mirrors the picture, so a photo moving left in the raw frame is a swipe right.
const SCRIPT = [
  [2.0, null],
  [2.5, "fist", 0.5], // asleep: ignored
  [1.0, null],
  [1.5, "palm", 0.5], // wakes gestures
  [0.5, null],
  [2.5, "thumbs_up", 0.5], // like
  [0.5, null],
  [2.5, "point", 0.5], // a left hand: ignored
  [0.5, null],
  [2.5, "fist", 0.5], // mute
  [0.5, null],
  [1.0, "palm", 0.68],
  [0.2, "palm", [0.68, 0.32]], // swipe right: +10 s
  [1.3, "palm", 0.32],
  [1.0, null],
  [2.5, "peace", 0.5], // full screen
  [10.0, null], // falls asleep after 8 s without a gesture
  [2.5, "fist", 0.5], // asleep again: ignored
  [1.0, null],
];
const EXPECT = [
  ["asleepIgnored", "fist before waking → ignored"],
  ["wake", "open palm → wakes up"],
  ["like", "thumbs up → like"],
  ["leftIgnored", "left hand pointing → ignored (right hand only)"],
  ["mute", "fist → mute"],
  ["seek", "swipe right → +10 s"],
  ["fullscreen", "peace sign → full screen"],
  ["sleepIgnored", "fist after 8 s idle → ignored (asleep again)"],
];

async function photosRGBA(browser) {
  const page = await browser.newPage();
  const out = await page.evaluate(
    async ({ photos, h }) => {
      const result = {};
      for (const [name, url] of Object.entries(photos)) {
        const bmp = await createImageBitmap(await (await fetch(url)).blob());
        // The palm photo is wide (two hands side by side): smaller, so it stays in frame while it swipes.
        const ph = Math.round(h * (name === "palm" ? 0.55 : 0.95));
        const pw = Math.round((bmp.width / bmp.height) * ph);
        const c = new OffscreenCanvas(pw, ph);
        c.getContext("2d").drawImage(bmp, 0, 0, pw, ph);
        result[name] = { w: pw, h: ph, data: Array.from(c.getContext("2d").getImageData(0, 0, pw, ph).data) };
      }
      return result;
    },
    { photos: PHOTOS, h: H },
  );
  await page.close();
  return out;
}

/** Writes the fake webcam as a YUV4MPEG2 (4:2:0) file, which Chromium plays as a camera. */
async function makeWebcam(file, photos) {
  const out = createWriteStream(file);
  out.write(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`);
  const rgb = new Uint8ClampedArray(W * H * 3);
  for (const [secs, name, xs] of SCRIPT) {
    const frames = Math.round(secs * FPS);
    for (let i = 0; i < frames; i++) {
      rgb.fill(96); // a plain grey wall
      if (name) {
        const p = photos[name];
        const f = frames > 1 ? i / (frames - 1) : 1;
        const cx = Array.isArray(xs) ? xs[0] + (xs[1] - xs[0]) * f : xs;
        const x0 = Math.round(cx * W - p.w / 2);
        const y0 = Math.round((H - p.h) / 2);
        for (let y = 0; y < p.h; y++) {
          for (let x = 0; x < p.w; x++) {
            const fx = x0 + x;
            const fy = y0 + y;
            if (fx < 0 || fx >= W || fy < 0 || fy >= H) continue;
            const s = (y * p.w + x) * 4;
            const d = (fy * W + fx) * 3;
            rgb[d] = p.data[s];
            rgb[d + 1] = p.data[s + 1];
            rgb[d + 2] = p.data[s + 2];
          }
        }
      }
      const yP = Buffer.alloc(W * H);
      const uP = Buffer.alloc((W / 2) * (H / 2));
      const vP = Buffer.alloc((W / 2) * (H / 2));
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const d = (y * W + x) * 3;
          const [r, g, b] = [rgb[d], rgb[d + 1], rgb[d + 2]];
          yP[y * W + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          if (y % 2 === 0 && x % 2 === 0) {
            const k = (y / 2) * (W / 2) + x / 2;
            uP[k] = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
            vP[k] = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
          }
        }
      }
      out.write("FRAME\n");
      out.write(yP);
      out.write(uP);
      out.write(vP);
    }
  }
  await new Promise((r) => out.end(r));
}

/** Playwright's own Chromium if installed, else any Chromium build already in its cache. */
function findChromium() {
  if (process.env.FLICK_CHROMIUM) return process.env.FLICK_CHROMIUM;
  if (existsSync(chromium.executablePath())) return chromium.executablePath();
  const cache = join(homedir(), "Library", "Caches", "ms-playwright");
  const builds = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const b of builds) {
    const exe = join(cache, b, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
    if (existsSync(exe)) return exe;
  }
  throw new Error("No Chromium found: run npx playwright install chromium, or set FLICK_CHROMIUM");
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), "flick-e2e-"));
  const webcam = join(work, "webcam.y4m");
  const exe = findChromium();

  console.log("Building the fake webcam from hand photos…");
  const plain = await chromium.launch({ executablePath: exe });
  await makeWebcam(webcam, await photosRGBA(plain));
  await plain.close();

  console.log("Launching Chromium with the extension…");
  const context = await chromium.launchPersistentContext(join(work, "profile"), {
    executablePath: exe,
    // A real window, so MediaPipe gets the GPU; headless Chromium renders WebGL in software.
    headless: process.env.HEADLESS === "1",
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${webcam}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const sw = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
  const extId = sw.url().split("/")[2];
  console.log(`Extension ${extId} loaded`);

  const page = await context.newPage();
  const log = [];
  const t0 = Date.now();
  const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`;
  page.on("console", (m) => {
    if (m.text().includes("[Flick]")) log.push(`${stamp()} ${m.text()}`);
  });
  await page.addInitScript(() => localStorage.setItem("flick:debug", "1"));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("video", { timeout: 30000 });
  // Close the extension's setup tab; turn gestures on as the setup page would.
  for (const p of context.pages()) if (p.url().startsWith(`chrome-extension://${extId}`)) await p.close();
  await page.bringToFront();
  await page.waitForTimeout(3000);
  const before = await page.evaluate(() => {
    const v = document.querySelector("video");
    return { title: document.title, paused: v.paused, muted: v.muted, rate: v.playbackRate, t: v.currentTime };
  });
  console.log("Before:", before);

  // Keep a trail of what the engine saw, for when a gesture is missed.
  await sw.evaluate(() => {
    self.trail = [];
    chrome.runtime.onMessage.addListener((m) => {
      if (m.type !== "ht/frame") return;
      const st = m.state;
      self.trail.push([performance.now(), st.present ? +st.x.toFixed(3) : null, st.pose || "-", st.active ? 1 : 0, st.side || "-", m.events.map((e) => e.type + (e.dir || e.name || "")).join(" ")]);
    });
  });
  await sw.evaluate(() => chrome.storage.sync.set({ settings: { enabled: true, activation: "wake", hand: "right" } }));
  const states = [];
  // One pass of the fake webcam (it loops), plus the moment the camera takes to start.
  const total = SCRIPT.reduce((a, s) => a + s[0], 0) + 2.5;
  const end = Date.now() + total * 1000;
  let last = null;
  let lastStatus = null;
  while (Date.now() < end) {
    const s = await page.evaluate(() => {
      const v = document.querySelector("video");
      return { paused: v.paused, muted: v.muted, rate: v.playbackRate, t: Math.round(v.currentTime * 10) / 10, ad: !!document.querySelector(".ad-showing") };
    });
    const status = await sw.evaluate(async () => {
      const { status: st } = await chrome.storage.session.get("status");
      const docs = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
      return `${st ? st.camera + (st.error ? ` (${st.error})` : "") : "none"}, offscreen documents: ${docs.length}`;
    });
    if (status !== lastStatus) states.push(`${stamp()} camera: ${status}`);
    lastStatus = status;
    if (last && (s.muted !== last.muted || s.rate !== last.rate || s.paused !== last.paused || Math.abs(s.t - last.t) > 4)) {
      states.push(`${stamp()} video: ${JSON.stringify(last)} → ${JSON.stringify(s)}`);
    }
    last = s;
    await page.waitForTimeout(150);
  }
  const fullscreen = await sw.evaluate(async () => (await chrome.windows.getLastFocused()).state);
  const counts = await sw.evaluate(() => self.stats);
  const tab = await page.evaluate(() => ({ hidden: document.hidden, visibility: document.visibilityState }));
  console.log(`Frames from the camera: ${counts.frames}, with a hand: ${counts.withHand}, gestures: ${counts.events}`);
  console.log(`Poses seen (frames): ${JSON.stringify(counts.poses)}`);
  console.log(`Tracker: ${JSON.stringify(counts.perf)}`);
  console.log(`Page visibility: ${JSON.stringify(tab)}`);

  console.log("\nGestures that reached the page:");
  console.log(log.join("\n") || "  (none)");
  console.log("\nChanges to the video:");
  console.log(states.join("\n"));
  console.log(`\nWindow state at the end: ${fullscreen}`);
  // The gestures in the order they reached the page, e.g. ["wake", "hold:thumbs_up", ...].
  const seq = log
    .map((line) => JSON.parse(line.slice(line.indexOf("{"), line.lastIndexOf("}") + 1)))
    .map((e) => (e.type === "hold" ? `hold:${e.name}` : e.type === "swipe" ? `swipe:${e.dir}` : e.type))
    .filter((t) => !t.startsWith("drag"));
  const wakeAt = seq.indexOf("wake");
  const fists = seq.filter((t) => t === "hold:fist").length;
  const seen = {
    asleepIgnored: wakeAt >= 0 && !seq.slice(0, wakeAt).includes("hold:fist"),
    wake: wakeAt >= 0,
    like: seq.includes("hold:thumbs_up"),
    leftIgnored: !seq.includes("hold:point"),
    mute: fists >= 1 && last.muted,
    seek: seq.includes("swipe:right"),
    fullscreen: seq.includes("hold:peace") && fullscreen === "fullscreen",
    sleepIgnored: fists === 1,
  };
  console.log(`\nSequence: ${seq.join(" → ")}`);
  if (process.env.TRAIL) {
    const trail = await sw.evaluate(() => self.trail);
    const t0 = trail[0][0];
    console.log("\nTrail (seconds, x, pose, active, side, events):");
    for (const r of trail) if (r[1] !== null || r[5]) console.log(((r[0] - t0) / 1000).toFixed(2), ...r.slice(1));
  }
  console.log("\nResult:");
  for (const [k, label] of EXPECT) console.log(`  ${seen[k] ? "✔" : "✖"} ${label}`);
  await page.screenshot({ path: join(work, "youtube.png") });
  console.log(`\nScreenshot: ${join(work, "youtube.png")}`);
  await context.close();
  process.exit(Object.values(seen).every(Boolean) ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});

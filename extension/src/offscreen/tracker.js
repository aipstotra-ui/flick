// The camera-to-gesture loop, shared by the offscreen document and the onboarding page.
//
// Frames are pulled from the camera track with MediaStreamTrackProcessor, which keeps running in a
// hidden document where timers and video rendering are throttled.

import { GestureEngine } from "../engine/gestures.js";

// With no hand in view for this long, only every IDLE_STRIDE-th frame is examined, to save power.
const IDLE_AFTER_MS = 3000;
const IDLE_STRIDE = 3;

export function createTracker({ track, landmarker, onFrame, onStatus = () => {}, withLandmarks = false }) {
  const settings = track.getSettings();
  const aspect = settings.width && settings.height ? settings.width / settings.height : 16 / 9;
  const engine = new GestureEngine({ aspect });
  let stopped = false;
  let lastHandAt = performance.now();
  let lastTs = -1;
  let count = 0;
  let fpsWindow = [];
  const perf = { read: 0, processed: 0, detectMs: 0 }; // for debugging: frames read and examined

  function process(source, now) {
    // detectForVideo needs strictly increasing timestamps.
    const ts = Math.max(now, lastTs + 1);
    lastTs = ts;
    const started = performance.now();
    const res = landmarker.detectForVideo(source, ts);
    perf.processed++;
    perf.detectMs += performance.now() - started;
    const hands = res.landmarks.map((lm, i) => ({
      image: lm.map((p) => [1 - p.x, p.y, p.z]), // mirrored, so moving right moves right
      world: res.worldLandmarks[i].map((p) => [p.x, p.y, p.z]),
    }));
    if (hands.length) lastHandAt = now;
    const { events, state } = engine.update(hands, now / 1000);
    fpsWindow.push(now);
    while (fpsWindow.length && now - fpsWindow[0] > 1000) fpsWindow.shift();
    const frame = { state, events, fps: fpsWindow.length, perf };
    if (withLandmarks) frame.landmarks = hands.map((h) => h.image);
    onFrame(frame);
  }

  function shouldSkip(now) {
    count++;
    return now - lastHandAt > IDLE_AFTER_MS && count % IDLE_STRIDE !== 0;
  }

  async function runProcessor() {
    const processor = new MediaStreamTrackProcessor({ track });
    const reader = processor.readable.getReader();
    onStatus({ camera: "on" });
    while (!stopped) {
      const { value: frame, done } = await reader.read();
      if (done) break;
      const now = performance.now();
      perf.read++;
      try {
        if (!shouldSkip(now)) process(frame, now);
      } catch (err) {
        console.error("HoloTouch: frame failed", err);
      } finally {
        frame.close();
      }
    }
    reader.releaseLock();
  }

  async function runVideo() {
    // Fallback for browsers without MediaStreamTrackProcessor.
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    await video.play();
    onStatus({ camera: "on" });
    let lastTime = -1;
    const step = () => {
      if (stopped) return;
      const now = performance.now();
      if (video.readyState >= 2 && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        if (!shouldSkip(now)) process(video, now);
      }
      setTimeout(step, 15);
    };
    step();
  }

  return {
    run() {
      return typeof MediaStreamTrackProcessor === "function" ? runProcessor() : runVideo();
    },
    stop() {
      stopped = true;
      track.stop();
    },
  };
}

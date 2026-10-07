// Offscreen document: reads the webcam, finds hands with MediaPipe, and turns them into gestures.
// Nothing leaves this computer: frames are read, measured and dropped here.

import { loadLandmarker, openCamera } from "./landmarker.js";
import { createTracker } from "./tracker.js";

function status(s) {
  chrome.runtime.sendMessage({ type: "ht/status", status: s }).catch(() => {});
}

async function main() {
  status({ camera: "starting" });
  let stream;
  try {
    stream = await openCamera();
  } catch (err) {
    const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
    status({ camera: denied ? "needs-permission" : "error", error: String(err && err.message) });
    return;
  }
  let landmarker;
  try {
    landmarker = await loadLandmarker();
  } catch (err) {
    status({ camera: "error", error: `Couldn't load the hand model: ${err && err.message}` });
    return;
  }
  const track = stream.getVideoTracks()[0];
  track.addEventListener("ended", () => status({ camera: "error", error: "The camera was disconnected." }));
  const tracker = createTracker({
    track,
    landmarker,
    onFrame: (frame) => chrome.runtime.sendMessage({ type: "ht/frame", ...frame }).catch(() => {}),
    onStatus: status,
  });
  tracker.run();
}

main();

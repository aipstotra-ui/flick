// Loads MediaPipe's hand landmarker from the files bundled with the extension (no remote code).

import { FilesetResolver, HandLandmarker } from "../../vendor/mediapipe/vision_bundle.mjs";

// MediaPipe's runtime writes its routine log lines ("W1007 19:32:28.342 gl_context.cc:1135] ...",
// "INFO: Created TensorFlow Lite XNNPACK delegate") through console.error, which Chrome lists as
// extension errors. Drop its info and warning lines; its real errors (E and F) still get through.
// This has to run before the runtime loads, since it keeps a reference to console.error.
const MEDIAPIPE_NOISE = /^(?:[IW]\d{4} \d\d:\d\d:\d\d\.\d+ +\d+ [\w.]+:\d+\]|INFO: )/;
for (const level of ["error", "warn", "log", "info"]) {
  const original = console[level];
  console[level] = function (...args) {
    if (typeof args[0] === "string" && MEDIAPIPE_NOISE.test(args[0])) return;
    original.apply(console, args);
  };
}

export async function openCamera() {
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30 } },
    audio: false,
  });
}

/**
 * delegate is "GPU" or "CPU". The offscreen document uses the CPU: there, the GPU delegate measured
 * about 330 ms a frame, against 20 ms or so for either in a visible page.
 */
export async function loadLandmarker(delegate = "GPU") {
  const fileset = await FilesetResolver.forVisionTasks(chrome.runtime.getURL("vendor/mediapipe/wasm"));
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: chrome.runtime.getURL("models/hand_landmarker.task"), delegate },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  if (delegate === "CPU") return HandLandmarker.createFromOptions(fileset, options("CPU"));
  try {
    return await HandLandmarker.createFromOptions(fileset, options("GPU"));
  } catch (err) {
    console.warn("Flick: GPU delegate unavailable, using the CPU", err);
    return HandLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

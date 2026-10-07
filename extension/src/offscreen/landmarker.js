// Loads MediaPipe's hand landmarker from the files bundled with the extension (no remote code).

import { FilesetResolver, HandLandmarker } from "../../vendor/mediapipe/vision_bundle.mjs";

export async function openCamera() {
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30 } },
    audio: false,
  });
}

export async function loadLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(chrome.runtime.getURL("vendor/mediapipe/wasm"));
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: chrome.runtime.getURL("models/hand_landmarker.task"), delegate },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  try {
    return await HandLandmarker.createFromOptions(fileset, options("GPU"));
  } catch (err) {
    console.warn("HoloTouch: GPU delegate unavailable, using the CPU", err);
    return HandLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

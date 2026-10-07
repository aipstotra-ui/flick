// Settings shared by the popup, the onboarding page and the service worker.

export const DEFAULTS = Object.freeze({
  enabled: false,
  seekStep: 10, // seconds a left or right swipe jumps
  showHand: true, // the small hand indicator on the video
  extras: true, // on pages without a video: swipes scroll the page and switch tabs
  gestures: {
    play: true, // pinch tap
    scrub: true, // pinch and drag sideways
    volume: true, // pinch and drag up or down
    swipe: true, // next/previous and seek
    mute: true, // fist
    like: true, // thumbs up
    fullscreen: true, // peace sign
    speed: true, // point up
  },
});

export async function loadSettings() {
  const { settings } = await chrome.storage.sync.get("settings");
  return { ...DEFAULTS, ...settings, gestures: { ...DEFAULTS.gestures, ...(settings && settings.gestures) } };
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  const next = { ...current, ...patch, gestures: { ...current.gestures, ...(patch.gestures || {}) } };
  await chrome.storage.sync.set({ settings: next });
  return next;
}

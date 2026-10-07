// Settings shared by the popup, the onboarding page and the service worker.

export const DEFAULTS = Object.freeze({
  enabled: false,
  activation: "wake", // when gestures count: "wake" (open palm first), "raise" (hand up high), "always"
  hand: "right", // which hand is followed: "right", "left" or "either"
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

// Saves read the stored settings and write them back with one change, so they run one at a time:
// two quick clicks must not each start from the same old settings and undo the other's change.
let saving = Promise.resolve();

export function saveSettings(patch) {
  const run = async () => {
    const current = await loadSettings();
    const next = { ...current, ...patch, gestures: { ...current.gestures, ...(patch.gestures || {}) } };
    await chrome.storage.sync.set({ settings: next });
    return next;
  };
  const result = saving.then(run, run);
  saving = result.catch(() => {});
  return result;
}

/** The part of the settings the gesture engine itself needs. */
export function engineOptions(settings) {
  return { activation: settings.activation, hand: settings.hand };
}

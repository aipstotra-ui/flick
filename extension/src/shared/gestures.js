// What each gesture does, for the popup and the setup page. Icons are drawn in 24x24 with strokes.

export const ICONS = {
  play: '<path d="M7 4.5v15l12.5-7.5z"/>',
  scrub: '<path d="M3 12h18"/><path d="M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a7.8 7.8 0 0 1 0 11"/>',
  swipe: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  like: '<path d="M7.5 10.5V20H4.5v-9.5z"/><path d="M7.5 10.5l3.6-6.2a1.7 1.7 0 0 1 3.1 1.2L13.4 9.5h5a1.8 1.8 0 0 1 1.8 2.1l-1.2 6.6a2.2 2.2 0 0 1-2.2 1.8H7.5"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  speed: '<path d="M4.5 16.5a8 8 0 1 1 15 0"/><path d="M12 13.5l4-4.5"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v5.5M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.6a5.5 5.5 0 0 1-4.3-2.1L3.8 15a1.5 1.5 0 0 1 2.3-1.9L8 15"/>',
  camera: '<path d="M15 10l5-3v10l-5-3z"/><rect x="3" y="6" width="12" height="12" rx="2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="2.5"/><path d="M21.5 10.5v3"/><path d="M6.5 10.5v3"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8"/>',
};

export function icon(name, cls = "icon") {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

// key: settings.gestures key; how: the hand; does: the action; event: what the engine emits for it.
export const GESTURES = [
  { key: "play", icon: "play", how: "Quick pinch", does: "Play or pause", event: (e) => e.type === "tap" },
  { key: "scrub", icon: "scrub", how: "Pinch and drag sideways", does: "Scrub the timeline", event: (e) => e.type === "drag_start" && e.axis === "x" },
  { key: "volume", icon: "volume", how: "Pinch and drag up or down", does: "Volume", event: (e) => e.type === "drag_start" && e.axis === "y" },
  { key: "swipe", icon: "swipe", how: "Swipe up, down, left or right", does: "Next, previous, skip 10 s", event: (e) => e.type === "swipe" },
  { key: "mute", icon: "mute", how: "Hold a fist", does: "Mute", event: (e) => e.type === "hold" && e.name === "fist" },
  { key: "like", icon: "like", how: "Hold a thumbs up", does: "Like", event: (e) => e.type === "hold" && e.name === "thumbs_up" },
  { key: "fullscreen", icon: "fullscreen", how: "Hold a peace sign", does: "Full screen", event: (e) => e.type === "hold" && e.name === "peace" },
  { key: "speed", icon: "speed", how: "Hold one finger up", does: "Change speed", event: (e) => e.type === "hold" && e.name === "point" },
];

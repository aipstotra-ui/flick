// The on-video overlay, "quiet glass": small frosted pills that appear for a moment and get out of
// the way. Everything lives in a closed shadow root so the page's styles cannot reach it.

/* exported HTOverlay */
var HTOverlay = (() => {
  const ICONS = {
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>',
    forward: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/>',
    rewind: '<path d="M4 12a8 8 0 1 0 2.34-5.66"/><path d="M4 4v4.5h4.5"/>',
    next: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
    prev: '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
    volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a7.8 7.8 0 0 1 0 11"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    like: '<path d="M7.5 10.5V20H4.5v-9.5z"/><path d="M7.5 10.5l3.6-6.2a1.7 1.7 0 0 1 3.1 1.2L13.4 9.5h5a1.8 1.8 0 0 1 1.8 2.1l-1.2 6.6a2.2 2.2 0 0 1-2.2 1.8H7.5"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    speed: '<path d="M4.5 16.5a8 8 0 1 1 15 0"/><path d="M12 13.5l4-4.5"/><circle cx="12" cy="14" r="1.3" fill="currentColor"/>',
    "scroll-down": '<path d="M12 4v16"/><path d="M6 14l6 6 6-6"/>',
    "scroll-up": '<path d="M12 20V4"/><path d="M6 10l6-6 6 6"/>',
    hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v5.5M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.6a5.5 5.5 0 0 1-4.3-2.1L3.8 15a1.5 1.5 0 0 1 2.3-1.9L8 15"/>',
  };
  const HOLD_ICON = { fist: "mute", thumbs_up: "like", peace: "fullscreen", point: "speed" };
  const HOLD_LABEL = { fist: "Mute", thumbs_up: "Like", peace: "Full screen", point: "Speed" };

  const CSS = `
    :host { all: initial; }
    .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
      font: 500 14px/1.2 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Inter, Roboto, sans-serif;
      color: #fff; -webkit-font-smoothing: antialiased; }
    .frame { position: absolute; }
    .glass { background: rgba(28, 28, 32, 0.52); border: 0.5px solid rgba(255, 255, 255, 0.22);
      -webkit-backdrop-filter: blur(22px) saturate(1.7); backdrop-filter: blur(22px) saturate(1.7);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22); }
    svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;
      stroke-linecap: round; stroke-linejoin: round; flex: none; }

    .toast { position: absolute; left: 50%; top: 50%; display: flex; align-items: center; gap: 9px;
      padding: 10px 18px; border-radius: 999px; white-space: nowrap; opacity: 0;
      transform: translate(-50%, -50%) scale(0.92);
      transition: opacity 160ms ease, transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1.2); }
    .toast.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    .toast .sub { color: rgba(255, 255, 255, 0.62); font-weight: 400; font-variant-numeric: tabular-nums; }

    .chip { position: absolute; top: 12px; right: 12px; display: flex; align-items: center; gap: 7px;
      padding: 5px 10px 5px 8px; border-radius: 999px; font-size: 12px; opacity: 0;
      transition: opacity 200ms ease; }
    .chip.on { opacity: 1; }
    .chip .dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(255, 255, 255, 0.45);
      transition: background 150ms ease, transform 150ms ease; }
    .chip.ready .dot { background: #5DCAA5; }
    .chip.pinch .dot { background: #fff; transform: scale(1.35); }
    .chip .ring { width: 16px; height: 16px; display: none; }
    .chip.holding .ring { display: block; }
    .chip.holding .dot { display: none; }
    .ring circle { fill: none; stroke-width: 2.5; }
    .ring .track { stroke: rgba(255, 255, 255, 0.25); }
    .ring .fill { stroke: #fff; stroke-dasharray: 44; stroke-dashoffset: 44; transform: rotate(-90deg);
      transform-origin: 50% 50%; }

    .cursor { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%;
      border: 1.5px solid rgba(255, 255, 255, 0.85); background: rgba(255, 255, 255, 0.12); opacity: 0;
      transition: opacity 200ms ease, width 120ms ease, height 120ms ease, margin 120ms ease; }
    .cursor.on { opacity: 0.75; }
    .cursor.pinch { width: 8px; height: 8px; margin: -4px 0 0 -4px; background: #fff; opacity: 1; }

    .meter { position: absolute; left: 50%; bottom: 28px; transform: translate(-50%, 8px);
      width: min(360px, 70%); padding: 12px 16px 14px; border-radius: 16px; opacity: 0;
      transition: opacity 160ms ease, transform 200ms ease; }
    .meter.on { opacity: 1; transform: translate(-50%, 0); }
    .meter .row { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; font-variant-numeric: tabular-nums; }
    .meter .label { font-size: 15px; }
    .meter .sub { margin-left: auto; color: rgba(255, 255, 255, 0.62); font-weight: 400; font-size: 13px; }
    .meter .bar { height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.22); overflow: hidden; }
    .meter .bar i { display: block; height: 100%; width: 0; background: #fff; border-radius: 2px; }

    .page-toast { position: fixed; left: 50%; bottom: 40px; top: auto; }

    @media (prefers-reduced-motion: reduce) {
      .toast, .meter, .chip, .cursor { transition: opacity 120ms linear; }
    }
  `;

  let host = null;
  let els = null;
  let toastTimer = 0;
  let anchor = null; // the video the overlay sits on, or null for the page

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  }

  function mount() {
    if (host) return;
    host = document.createElement("holotouch-overlay");
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="layer">
        <div class="frame">
          <div class="chip glass" role="status" aria-live="polite">
            <span class="dot"></span>
            <svg class="ring" viewBox="0 0 16 16"><circle class="track" cx="8" cy="8" r="7"/><circle class="fill" cx="8" cy="8" r="7"/></svg>
            <span class="chip-label">Hand</span>
          </div>
          <div class="cursor"></div>
          <div class="toast glass" role="status" aria-live="polite"></div>
          <div class="meter glass">
            <div class="row"><span class="m-icon"></span><span class="label"></span><span class="sub"></span></div>
            <div class="bar"><i></i></div>
          </div>
        </div>
      </div>`;
    const q = (s) => root.querySelector(s);
    els = {
      frame: q(".frame"),
      chip: q(".chip"),
      chipLabel: q(".chip-label"),
      ringFill: q(".ring .fill"),
      cursor: q(".cursor"),
      toast: q(".toast"),
      meter: q(".meter"),
      meterIcon: q(".m-icon"),
      meterLabel: q(".meter .label"),
      meterSub: q(".meter .sub"),
      meterBar: q(".meter .bar i"),
    };
    attach();
    document.addEventListener("fullscreenchange", attach);
    requestAnimationFrame(follow);
  }

  /** Keeps the overlay inside whatever element is full screen, or it would be hidden behind it. */
  function attach() {
    const parent = document.fullscreenElement || document.documentElement;
    if (host.parentNode !== parent) parent.appendChild(host);
  }

  /** Lays the frame over the anchored video, or over the whole window. */
  function follow() {
    if (!host) return;
    const r = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : null;
    const f = els.frame.style;
    if (r && r.width > 0) {
      const left = Math.max(r.left, 0);
      const top = Math.max(r.top, 0);
      f.left = `${left}px`;
      f.top = `${top}px`;
      f.width = `${Math.min(r.right, innerWidth) - left}px`;
      f.height = `${Math.min(r.bottom, innerHeight) - top}px`;
    } else {
      Object.assign(f, { left: "0px", top: "0px", width: `${innerWidth}px`, height: `${innerHeight}px` });
    }
    requestAnimationFrame(follow);
  }

  return {
    /** state: the gesture engine's hand state, or null when there is none. */
    hand(state, { video = null, show = true } = {}) {
      if (!state && !host) return;
      mount();
      anchor = video || anchor;
      const visible = !!(state && state.present && show);
      els.chip.classList.toggle("on", visible);
      els.cursor.classList.toggle("on", visible && state.armed);
      if (!visible) return;
      const pinching = state.pose === "pinch";
      const hold = state.hold;
      els.chip.classList.toggle("ready", state.armed);
      els.chip.classList.toggle("pinch", pinching);
      els.chip.classList.toggle("holding", !!hold);
      els.chipLabel.textContent = hold
        ? HOLD_LABEL[hold.name]
        : state.drag
          ? state.drag.axis === "x" ? "Scrubbing" : "Volume"
          : pinching ? "Pinch" : state.armed ? "Ready" : "Hand";
      if (hold) els.ringFill.style.strokeDashoffset = String(44 * (1 - hold.progress));
      // The cursor shows where the hand is over the video, from the middle 80% of the camera's view.
      const u = Math.min(Math.max((state.x - 0.1) / 0.8, 0), 1);
      const v = Math.min(Math.max((state.y - 0.1) / 0.8, 0), 1);
      els.cursor.style.left = `${u * 100}%`;
      els.cursor.style.top = `${v * 100}%`;
      els.cursor.classList.toggle("pinch", pinching);
    },

    /** A brief notice in the middle of the video (or at the bottom of the page). */
    toast(video, iconName, label, sub) {
      mount();
      if (video) anchor = video;
      els.toast.classList.toggle("page-toast", !video);
      els.toast.innerHTML = `${icon(iconName)}<span></span>${sub ? '<span class="sub"></span>' : ""}`;
      els.toast.children[1].textContent = label;
      if (sub) els.toast.children[2].textContent = sub;
      els.toast.classList.remove("on");
      void els.toast.offsetWidth;
      els.toast.classList.add("on");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => els.toast.classList.remove("on"), 900);
    },

    /** A live bar while scrubbing or changing the volume. kind is "seek" or "volume". */
    meter(video, kind, fraction, { label = "", sub = "" } = {}) {
      mount();
      anchor = video;
      els.toast.classList.remove("on");
      els.meterIcon.innerHTML = icon(kind === "seek" ? "forward" : fraction === 0 ? "mute" : "volume");
      els.meterLabel.textContent = label;
      els.meterSub.textContent = sub;
      els.meterBar.style.width = `${Math.round(Math.min(Math.max(fraction, 0), 1) * 1000) / 10}%`;
      els.meter.classList.add("on");
    },

    endMeter() {
      if (els) setTimeout(() => els.meter.classList.remove("on"), 500);
    },
  };
})();

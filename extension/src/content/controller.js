// Turns gesture events from the service worker into actions on the page's video.
// Uses HTSites (site adapters) and HTOverlay (what the user sees), loaded before this file.

(() => {
  // Kept in step with src/shared/settings.js, which content scripts cannot import.
  const DEFAULTS = {
    enabled: false,
    seekStep: 10,
    showHand: true,
    extras: true,
    gestures: { play: true, scrub: true, volume: true, swipe: true, mute: true, like: true, fullscreen: true, speed: true },
  };
  const SPEEDS = [1, 1.25, 1.5, 2];
  // Half the camera frame's width scrubs this much of a video (seconds), and 0.35 of its height
  // is the whole volume range.
  const SCRUB_FRAME = 0.5;
  const VOLUME_FRAME = 0.35;
  const SEEK_EVERY_MS = 90;

  let settings = DEFAULTS;
  let drag = null; // { axis, video, from, lastSeek }
  let lastFrameAt = 0;
  let debug = false;
  try {
    // Set localStorage["flick:debug"] on a page to log the gestures that reach it.
    debug = !!localStorage.getItem("flick:debug");
  } catch {}

  function merge(s) {
    return { ...DEFAULTS, ...s, gestures: { ...DEFAULTS.gestures, ...(s && s.gestures) } };
  }
  chrome.storage.sync.get("settings").then(({ settings: s }) => (settings = merge(s)));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.settings) settings = merge(changes.settings.newValue);
  });

  const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

  function fmtTime(s) {
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  }

  function seekTo(site, video, seconds) {
    const target = clamp(seconds, 0, Number.isFinite(video.duration) ? video.duration - 0.25 : seconds);
    if (site.seekTo) site.seekTo(target);
    else video.currentTime = target;
    return target;
  }

  function scrubRange(video) {
    const d = video.duration;
    if (!Number.isFinite(d) || d <= 0) return 60;
    return d <= 180 ? d : clamp(d * 0.1, 60, 300);
  }

  // --- Gestures on a page with a video ---------------------------------------------------------

  function onVideoEvent(e, video, site) {
    const g = settings.gestures;
    switch (e.type) {
      case "tap": {
        if (!g.play) return;
        if (video.paused) {
          video.play().catch(() => video.click());
          HTOverlay.toast(video, "play", "Play");
        } else {
          video.pause();
          HTOverlay.toast(video, "pause", "Paused");
        }
        return;
      }
      case "drag_start": {
        if ((e.axis === "x" && !g.scrub) || (e.axis === "y" && !g.volume)) return;
        drag = { axis: e.axis, video, from: e.axis === "x" ? video.currentTime : video.muted ? 0 : video.volume, lastSeek: 0 };
        return;
      }
      case "drag":
      case "drag_end": {
        if (!drag || drag.axis !== e.axis) return;
        const final = e.type === "drag_end";
        if (drag.axis === "x") {
          const to = clamp(drag.from + (e.delta / SCRUB_FRAME) * scrubRange(video), 0, video.duration || Infinity);
          const now = performance.now();
          if (final || now - drag.lastSeek > SEEK_EVERY_MS) {
            seekTo(site, video, to);
            drag.lastSeek = now;
          }
          const diff = to - drag.from;
          HTOverlay.meter(video, "seek", Number.isFinite(video.duration) ? to / video.duration : 0, {
            label: fmtTime(to),
            sub: `${diff >= 0 ? "+" : "−"}${fmtTime(Math.abs(diff))}`,
          });
        } else {
          const vol = clamp(drag.from + e.delta / VOLUME_FRAME, 0, 1);
          video.volume = vol;
          video.muted = vol === 0;
          HTOverlay.meter(video, "volume", vol, { label: `${Math.round(vol * 100)}%` });
        }
        if (final) {
          drag = null;
          HTOverlay.endMeter();
        }
        return;
      }
      case "swipe": {
        if (!g.swipe) return;
        if (e.dir === "up" || e.dir === "down") {
          const dir = e.dir === "up" ? 1 : -1;
          const went = site.step(dir, video);
          if (went !== false) HTOverlay.toast(video, dir > 0 ? "next" : "prev", dir > 0 ? "Next" : "Previous");
        } else {
          const step = settings.seekStep * (e.dir === "right" ? 1 : -1);
          const to = seekTo(site, video, video.currentTime + step);
          HTOverlay.toast(video, step > 0 ? "forward" : "rewind", `${step > 0 ? "+" : "−"}${Math.abs(step)} s`, fmtTime(to));
        }
        return;
      }
      case "hold":
        return onHold(e.name, video, site);
    }
  }

  function onHold(name, video, site) {
    const g = settings.gestures;
    if (name === "fist" && g.mute) {
      video.muted = !video.muted;
      HTOverlay.toast(video, video.muted ? "mute" : "volume", video.muted ? "Muted" : "Sound on");
    } else if (name === "thumbs_up" && g.like) {
      const ok = site.like(video);
      HTOverlay.toast(video, "like", ok ? "Liked" : "No like button here");
    } else if (name === "peace" && g.fullscreen) {
      chrome.runtime.sendMessage({ type: "ht/cmd", cmd: "fullscreen" }).then((res) => {
        if (res && res.on && site.theater && !document.querySelector("ytd-watch-flexy[theater]")) site.theater();
        HTOverlay.toast(video, "fullscreen", res && res.on ? "Full screen" : "Exit full screen");
      });
    } else if (name === "point" && g.speed) {
      const i = SPEEDS.findIndex((s) => Math.abs(s - video.playbackRate) < 0.01);
      video.playbackRate = SPEEDS[(i + 1) % SPEEDS.length];
      HTOverlay.toast(video, "speed", `${video.playbackRate}×`);
    }
  }

  // --- Gestures on a page without a video (extras) ---------------------------------------------

  function onPageEvent(e) {
    if (e.type !== "swipe") return;
    if (e.dir === "up" || e.dir === "down") {
      // Like a phone: pushing the page up moves further down it.
      window.scrollBy({ top: (e.dir === "up" ? 1 : -1) * innerHeight * 0.85, behavior: "smooth" });
      HTOverlay.toast(null, e.dir === "up" ? "scroll-down" : "scroll-up", e.dir === "up" ? "Scroll down" : "Scroll up");
    } else {
      chrome.runtime.sendMessage({ type: "ht/cmd", cmd: e.dir === "left" ? "tab_next" : "tab_prev" });
    }
  }

  // --- Frames from the service worker ----------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "ht/frame" || document.hidden) return;
    lastFrameAt = performance.now();
    const video = drag ? drag.video : HTSites.mainVideo();
    const site = HTSites.adapter();
    HTOverlay.hand(msg.state, { video, show: settings.showHand && (video || settings.extras) });
    for (const e of msg.events) {
      if (debug) console.debug("[Flick]", JSON.stringify(e), video ? `on ${site.name} video` : "on page");
      if (e.type === "wake") {
        if (video || settings.extras) HTOverlay.toast(video, "hand", "Listening");
        continue;
      }
      if (video) onVideoEvent(e, video, site);
      else if (settings.extras) onPageEvent(e);
    }
  });

  // When frames stop (gestures turned off, or another tab took over), hide the hand.
  setInterval(() => {
    if (lastFrameAt && performance.now() - lastFrameAt > 400) {
      lastFrameAt = 0;
      if (drag) {
        drag = null;
        HTOverlay.endMeter();
      }
      HTOverlay.hand(null, {});
    }
  }, 250);
})();

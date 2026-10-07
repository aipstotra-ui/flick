// Site adapters: how to find the video, go to the next one, and like it on each site.
// Selectors change as sites redesign, so every adapter falls back to something generic.

/* exported HTSites */
var HTSites = (() => {
  const host = location.hostname;

  function onScreen(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }

  function visibleArea(el) {
    const r = el.getBoundingClientRect();
    const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    return w > 0 && h > 0 ? w * h : 0;
  }

  /** The video being watched: the largest one on screen, favouring one that is playing. */
  function mainVideo() {
    let best = null;
    let bestScore = 0;
    for (const v of document.querySelectorAll("video")) {
      const area = visibleArea(v);
      if (area < 160 * 120) continue;
      let score = area;
      if (!v.paused) score *= 2;
      if (v.readyState < 1) score *= 0.5;
      if (score > bestScore) [best, bestScore] = [v, score];
    }
    return best;
  }

  function clickFirst(selectors, near) {
    for (const s of selectors) {
      const els = [...document.querySelectorAll(s)].filter(onScreen);
      if (!els.length) continue;
      const el = near ? nearest(els, near) : els[0];
      el.click();
      return true;
    }
    return false;
  }

  function nearest(els, to) {
    const t = to.getBoundingClientRect();
    const cx = t.left + t.width / 2;
    const cy = t.top + t.height / 2;
    let best = els[0];
    let bestD = Infinity;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (d < bestD) [best, bestD] = [el, d];
    }
    return best;
  }

  function pressKey(key, { code = key, keyCode = 0, shiftKey = false } = {}) {
    const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document;
    for (const type of ["keydown", "keyup"]) {
      target.dispatchEvent(new KeyboardEvent(type, { key, code, keyCode, which: keyCode, shiftKey, bubbles: true, cancelable: true }));
    }
  }

  /** The nearest ancestor of el that scrolls vertically, or null for the page itself. */
  function scroller(el) {
    for (let node = el && el.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 10) return node;
    }
    return null;
  }

  function scrollFeed(video, dir) {
    const box = scroller(video);
    if (box) box.scrollBy({ top: dir * box.clientHeight, behavior: "smooth" });
    else window.scrollBy({ top: dir * innerHeight, behavior: "smooth" });
  }

  /** Goes to the next item in a vertical feed, checking it worked and falling back to scrolling. */
  function feedStep(dir, tries) {
    const before = mainVideo();
    for (const attempt of tries) {
      if (attempt()) break;
    }
    setTimeout(() => {
      if (mainVideo() === before) scrollFeed(before, dir);
    }, 450);
  }

  /** A like button near the video, found by its accessible name. */
  function genericLike(video) {
    const candidates = [...document.querySelectorAll('button, [role="button"]')].filter((el) => {
      if (!onScreen(el)) return false;
      const label = (el.getAttribute("aria-label") || el.querySelector("svg[aria-label]")?.getAttribute("aria-label") || "").trim();
      return /^(like|i like)/i.test(label) || /\blike this\b/i.test(label);
    });
    if (!candidates.length) return false;
    (video ? nearest(candidates, video) : candidates[0]).click();
    return true;
  }

  const keyDown = (dir) => () => {
    pressKey(dir > 0 ? "ArrowDown" : "ArrowUp", { keyCode: dir > 0 ? 40 : 38 });
    return true;
  };

  const adapters = [
    {
      name: "YouTube Shorts",
      match: () => host.endsWith("youtube.com") && location.pathname.startsWith("/shorts"),
      feed: true,
      step: (dir) =>
        feedStep(dir, [
          () => clickFirst(dir > 0 ? ["#navigation-button-down button"] : ["#navigation-button-up button"]),
          keyDown(dir),
        ]),
      like: (v) =>
        clickFirst(
          ["ytd-reel-video-renderer[is-active] like-button-view-model button", "ytd-reel-video-renderer[is-active] #like-button button"],
          v,
        ) || genericLike(v),
    },
    {
      name: "YouTube",
      match: () => host.endsWith("youtube.com"),
      feed: false,
      step: (dir, v) => {
        if (dir > 0) return clickFirst([".ytp-next-button"]);
        if (clickFirst([".ytp-prev-button:not([aria-disabled='true'])"])) return true;
        if (v) v.currentTime = 0;
        return true;
      },
      like: (v) =>
        clickFirst(["#top-level-buttons-computed like-button-view-model button", "#segmented-like-button button", "like-button-view-model button"]) ||
        genericLike(v),
      theater: () => clickFirst([".ytp-size-button"]),
    },
    {
      name: "TikTok",
      match: () => host.endsWith("tiktok.com"),
      feed: true,
      step: (dir) =>
        feedStep(dir, [
          () => clickFirst(dir > 0 ? ['[data-e2e="arrow-right"]', 'button[aria-label*="next" i]'] : ['[data-e2e="arrow-left"]', 'button[aria-label*="previous" i]']),
          keyDown(dir),
        ]),
      like: (v) => clickFirst(['[data-e2e="like-icon"]', '[data-e2e="browse-like-icon"]'], v) || genericLike(v),
    },
    {
      name: "Instagram",
      match: () => host.endsWith("instagram.com"),
      feed: () => location.pathname.startsWith("/reels") || location.pathname.startsWith("/reel/"),
      step: (dir, v) => scrollFeed(v, dir),
      like: (v) => genericLike(v),
    },
    {
      name: "Netflix",
      match: () => host.endsWith("netflix.com"),
      feed: false,
      step: (dir) => dir > 0 && clickFirst(['[data-uia="control-next"]', '[data-uia="next-episode-seamless-button"]']),
      like: () => clickFirst(['[data-uia="thumbs-rate-button"]', '[data-uia="thumbs-up-button"]']),
      seekTo: (seconds) => window.postMessage({ source: "holotouch", cmd: "seek", ms: Math.round(seconds * 1000) }, location.origin),
    },
    {
      name: "Video",
      match: () => true,
      feed: false,
      step: () => false,
      like: (v) => genericLike(v),
    },
  ];

  function adapter() {
    const a = adapters.find((x) => x.match());
    return { ...a, feed: typeof a.feed === "function" ? a.feed() : a.feed };
  }

  return { adapter, mainVideo, scrollFeed };
})();

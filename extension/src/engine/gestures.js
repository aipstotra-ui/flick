// Turns per-frame hand landmarks into gesture events for video control.
//
// Events:
//   { type: "tap" }                                   quick pinch and release
//   { type: "drag_start", axis: "x" | "y" }           pinch held and moved; axis is locked from here
//   { type: "drag", axis, delta }                     delta in frame units from where the pinch began:
//                                                     x grows to the right, y grows upward
//   { type: "drag_end", axis, delta }
//   { type: "swipe", dir: "up" | "down" | "left" | "right" }
//   { type: "hold", name: "fist" | "thumbs_up" | "peace" | "point" }

import { FILTER, GESTURE, POSE } from "./config.js";
import { extractFeatures } from "./features.js";
import { OneEuro2D } from "./filters.js";
import { Pose, PoseTracker } from "./poses.js";

const HOLD_NAMES = {
  [Pose.FIST]: "fist",
  [Pose.THUMBS_UP]: "thumbs_up",
  [Pose.PEACE]: "peace",
  [Pose.POINT]: "point",
};
const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

export class GestureEngine {
  constructor({ gesture = GESTURE, pose = POSE, filter = FILTER, aspect = 16 / 9 } = {}) {
    this.cfg = gesture;
    this.poseCfg = pose;
    this.filterCfg = filter;
    this.aspect = aspect;
    this.reset();
  }

  reset() {
    this.hand = null; // the one hand being followed
  }

  newHand(t, palm) {
    return {
      firstSeen: t,
      lastSeen: t,
      palm,
      pos: palm,
      filter: new OneEuro2D(this.filterCfg),
      poses: new PoseTracker(this.poseCfg),
      pose: Pose.NEUTRAL,
      history: [],
      pinch: null, // { t, x, y, drag: null | axis, delta }
      hold: null, // { pose, t, x, y, fired }
      lastSwipe: null, // { t, dir }
    };
  }

  /** Picks the hand to follow: the one already followed if it is still near, else the largest. */
  choose(feats) {
    if (!feats.length) return null;
    if (this.hand) {
      let best = null;
      let bestD = 0.25;
      for (const f of feats) {
        const d = Math.hypot(f.palm[0] - this.hand.palm[0], f.palm[1] - this.hand.palm[1]);
        if (d < bestD) [best, bestD] = [f, d];
      }
      if (best) return best;
    }
    return feats.reduce((a, b) => (b.palmScale > a.palmScale ? b : a));
  }

  /**
   * hands: [{ image, world }] with image x already mirrored. t: capture time in seconds.
   * Returns { events, state }.
   */
  update(hands, t) {
    const events = [];
    const feats = hands.map((h) => extractFeatures(h, this.aspect));
    const f = this.choose(feats);

    if (!f) {
      if (this.hand && (t - this.hand.lastSeen) * 1000 > this.cfg.lostMs) {
        this.endPinch(events, false);
        this.hand = null;
      }
      return { events, state: this.state(t) };
    }

    if (!this.hand || (t - this.hand.lastSeen) * 1000 > this.cfg.lostMs) {
      this.hand = this.newHand(t, f.palm);
    }
    const h = this.hand;
    h.lastSeen = t;
    h.palm = f.palm;
    h.pos = h.filter.filter(f.palm, t);
    h.history.push({ t, x: h.pos[0], y: h.pos[1] });
    while (h.history.length && t - h.history[0].t > 0.8) h.history.shift();
    h.feat = f;

    const prev = h.pose;
    h.pose = h.poses.update(f, t);
    const armed = (t - h.firstSeen) * 1000 >= this.cfg.armMs;

    if (prev !== h.pose) this.onPoseChange(prev, h, t, armed, events);
    if (h.pinch) this.trackPinch(h, t, events);
    if (armed) {
      this.trackHold(h, t, events);
      if (h.pose !== Pose.PINCH) this.detectSwipe(h, t, events);
    }
    return { events, state: this.state(t) };
  }

  speed(h, t, span = 0.1) {
    const hist = h.history;
    const now = hist[hist.length - 1];
    let from = null;
    for (const s of hist) {
      if (t - s.t <= span && s !== now) {
        from = s;
        break;
      }
    }
    if (!from) return 0;
    return Math.hypot(now.x - from.x, now.y - from.y) / Math.max(now.t - from.t, 1e-3);
  }

  onPoseChange(prev, h, t, armed, events) {
    if (prev === Pose.PINCH) this.endPinch(events, true);
    if (h.pose === Pose.PINCH && armed && this.speed(h, t) <= this.cfg.maxPinchOnsetSpeed) {
      h.pinch = { t, x: h.pos[0], y: h.pos[1], drag: null, delta: 0 };
    }
    h.hold = null;
  }

  trackPinch(h, t, events) {
    const p = h.pinch;
    const dx = h.pos[0] - p.x;
    const dy = p.y - h.pos[1]; // upward is positive
    if (!p.drag) {
      if (Math.hypot(dx, dy) < this.cfg.dragSlop) return;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax >= ay * this.cfg.dragAxisRatio) p.drag = "x";
      else if (ay >= ax * this.cfg.dragAxisRatio) p.drag = "y";
      else return;
      // Measure from where the drag began, so the slop does not jump the value.
      p.origin = p.drag === "x" ? h.pos[0] : h.pos[1];
      events.push({ type: "drag_start", axis: p.drag });
    }
    p.delta = p.drag === "x" ? h.pos[0] - p.origin : p.origin - h.pos[1];
    events.push({ type: "drag", axis: p.drag, delta: p.delta });
  }

  endPinch(events, released) {
    const h = this.hand;
    const p = h && h.pinch;
    if (!p) return;
    h.pinch = null;
    // A hand letting go often moves off at once: that is not a swipe.
    h.quietUntil = h.lastSeen + this.cfg.afterPinchMs / 1000;
    if (p.drag) {
      events.push({ type: "drag_end", axis: p.drag, delta: p.delta });
      return;
    }
    const last = h.history[h.history.length - 1];
    const moved = last ? Math.hypot(last.x - p.x, last.y - p.y) : 0;
    if (released && (last.t - p.t) * 1000 <= this.cfg.tapMs && moved < this.cfg.tapSlop) {
      events.push({ type: "tap" });
    }
  }

  trackHold(h, t, events) {
    const name = HOLD_NAMES[h.pose];
    if (!name) {
      h.hold = null;
      return;
    }
    const ms = this.cfg.holdMs[name];
    if (!h.hold || h.hold.pose !== h.pose) {
      h.hold = { pose: h.pose, name, t, x: h.pos[0], y: h.pos[1], fired: false, progress: 0 };
    }
    const hold = h.hold;
    if (Math.hypot(h.pos[0] - hold.x, h.pos[1] - hold.y) > this.cfg.holdSlop) {
      // Moving restarts the count: only a pose held still fires.
      Object.assign(hold, { t, x: h.pos[0], y: h.pos[1] });
    }
    hold.progress = Math.min(((t - hold.t) * 1000) / ms, 1);
    if (hold.progress >= 1 && !hold.fired) {
      hold.fired = true;
      events.push({ type: "hold", name });
    }
  }

  detectSwipe(h, t, events) {
    const cfg = this.cfg;
    const last = h.lastSwipe;
    if (last && (t - last.t) * 1000 < cfg.swipeCooldownMs) return;
    if (h.hold && h.hold.fired) return;
    if (h.quietUntil && t < h.quietUntil) return;
    const hist = h.history;
    const now = hist[hist.length - 1];
    for (const s of hist) {
      if ((t - s.t) * 1000 > cfg.swipeWindowMs || s === now) continue;
      const dx = now.x - s.x;
      const dy = now.y - s.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      let dir = null;
      if (ax >= cfg.swipeDistX && ax >= ay * cfg.swipeAxisRatio) dir = dx > 0 ? "right" : "left";
      else if (ay >= cfg.swipeDistY && ay >= ax * cfg.swipeAxisRatio) dir = dy > 0 ? "down" : "up";
      if (!dir) continue;
      if (!this.restedBefore(h, s)) continue;
      if (last && OPPOSITE[dir] === last.dir && (t - last.t) * 1000 < cfg.swipeReturnMs) return;
      h.lastSwipe = { t, dir };
      h.history = [now];
      events.push({ type: "swipe", dir });
      return;
    }
  }

  /** Whether the hand was moving slowly just before sample s: a swipe starts from rest. */
  restedBefore(h, s) {
    let from = null;
    for (const r of h.history) {
      if (r.t >= s.t) break;
      if (s.t - r.t <= 0.15) {
        from = r;
        break;
      }
    }
    if (!from) return true;
    const v = Math.hypot(s.x - from.x, s.y - from.y) / Math.max(s.t - from.t, 1e-3);
    return v <= this.cfg.swipeRestSpeed;
  }

  state(t) {
    const h = this.hand;
    if (!h) return { present: false };
    return {
      present: true,
      armed: (t - h.firstSeen) * 1000 >= this.cfg.armMs,
      x: h.pos[0],
      y: h.pos[1],
      pose: h.pose,
      pinch: h.feat ? h.poses.pinchStrength(h.feat) : 0,
      hold: h.hold && !h.hold.fired && h.hold.progress > 0.15 ? { name: h.hold.name, progress: h.hold.progress } : null,
      drag: h.pinch && h.pinch.drag ? { axis: h.pinch.drag, delta: h.pinch.delta } : null,
    };
  }
}

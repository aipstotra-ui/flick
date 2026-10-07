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
//   { type: "wake" }                                  an open palm woke gestures up ("wake" mode)
//
// Which gestures count is set with setOptions({ activation, hand }):
//   activation "always": any followed hand, once in view for a moment
//              "raise":  only while the hand is raised to chin or shoulder height
//              "wake":   only for a while after an open palm is held up to the camera
//   hand       "right", "left" or "either": the hand that is followed; the other is ignored

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
  constructor({ gesture = GESTURE, pose = POSE, filter = FILTER, aspect = 16 / 9, activation = "always", hand = "either" } = {}) {
    this.cfg = gesture;
    this.poseCfg = pose;
    this.filterCfg = filter;
    this.aspect = aspect;
    this.activation = activation;
    this.side = hand;
    this.reset();
  }

  reset() {
    this.hand = null; // the one hand being followed
    this.awakeUntil = 0; // "wake" mode: gestures count until this time
    this.wake = null; // { t, x, y, progress } while an open palm is being held up to wake
  }

  setOptions({ activation, hand } = {}) {
    if (activation && activation !== this.activation) {
      this.activation = activation;
      this.awakeUntil = 0;
      this.wake = null;
    }
    if (hand && hand !== this.side) {
      this.side = hand;
      this.hand = null;
    }
  }

  /** Whether a hand labelled `side` ("Left"/"Right") may be followed. */
  sideOk(side) {
    return this.side === "either" || !side || side.toLowerCase() === this.side;
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
      side: 0, // -1 left .. +1 right, following MediaPipe's per-frame label
      raised: false, // "raise" mode: above the line
      pinch: null, // { t, x, y, drag: null | axis, delta }
      hold: null, // { pose, t, x, y, fired }
      lastSwipe: null, // { t, dir }
    };
  }

  /** Picks the hand to follow: the one already followed if it is still near, else the largest. */
  /** How far the followed hand may have moved since it was last seen, by now, t. */
  reach(t) {
    return Math.max(this.cfg.reachMin, this.cfg.reachSpeed * (t - this.hand.lastSeen));
  }

  choose(feats, t) {
    if (!feats.length) return null;
    if (this.hand) {
      let best = null;
      let bestD = this.reach(t);
      for (const f of feats) {
        const d = Math.hypot(f.palm[0] - this.hand.palm[0], f.palm[1] - this.hand.palm[1]);
        if (d < bestD) [best, bestD] = [f, d];
      }
      // The hand already followed stays followed while its remembered side is still the right one,
      // even through a frame where MediaPipe labels it the other way.
      if (best && (this.side === "either" || this.sideOk(this.hand.side > 0 ? "Right" : this.hand.side < 0 ? "Left" : null))) {
        return best;
      }
    }
    const usable = feats.filter((f) => this.sideOk(f.side));
    if (!usable.length) return null;
    return usable.reduce((a, b) => (b.palmScale > a.palmScale ? b : a));
  }

  /**
   * hands: [{ image, world }] with image x already mirrored. t: capture time in seconds.
   * Returns { events, state }.
   */
  update(hands, t) {
    const events = [];
    const feats = hands.map((h) => extractFeatures(h, this.aspect));
    const f = this.choose(feats, t);

    if (!f) {
      if (this.hand && (t - this.hand.lastSeen) * 1000 > this.cfg.lostMs) {
        this.endPinch(events, false);
        this.hand = null;
      }
      return { events, state: this.state(t) };
    }

    const jumped = this.hand && Math.hypot(f.palm[0] - this.hand.palm[0], f.palm[1] - this.hand.palm[1]) > this.reach(t);
    if (jumped) this.endPinch(events, false);
    if (!this.hand || jumped || (t - this.hand.lastSeen) * 1000 > this.cfg.lostMs) {
      this.hand = this.newHand(t, f.palm);
      if (f.side) this.hand.side = f.side === "Right" ? 1 : -1;
    }
    const h = this.hand;
    if (f.side) h.side += this.cfg.sideFollow * ((f.side === "Right" ? 1 : -1) - h.side);
    h.lastSeen = t;
    h.palm = f.palm;
    h.pos = h.filter.filter(f.palm, t);
    h.history.push({ t, x: h.pos[0], y: h.pos[1] });
    while (h.history.length && t - h.history[0].t > 0.8) h.history.shift();
    h.feat = f;

    const prev = h.pose;
    h.pose = h.poses.update(f, t);
    const armed = (t - h.firstSeen) * 1000 >= this.cfg.armMs;
    if (armed && this.activation === "wake") this.trackWake(h, t, events);
    const active = armed && this.active(h, t);

    if (prev !== h.pose) this.onPoseChange(prev, h, t, active, events);
    // A pinch already begun carries on to its release even if the hand leaves the raised zone.
    if (h.pinch) this.trackPinch(h, t, events);
    if (active) {
      this.trackHold(h, t, events);
      if (h.pose !== Pose.PINCH) this.detectSwipe(h, t, events);
    } else {
      h.hold = null;
    }
    // In "wake" mode every gesture keeps gestures awake for another listenMs.
    if (this.activation === "wake" && (events.some((e) => e.type !== "wake") || h.pinch)) {
      this.awakeUntil = t + this.cfg.listenMs / 1000;
    }
    return { events, state: this.state(t) };
  }

  /** Whether this hand's gestures count now, by the activation mode. */
  active(h, t) {
    if (this.activation === "wake") return t < this.awakeUntil;
    if (this.activation === "raise") {
      h.raised = h.pos[1] <= (h.raised ? this.cfg.raiseExitY : this.cfg.raiseEnterY);
      return h.raised;
    }
    return true;
  }

  /** "wake" mode: an open palm facing the camera, held still for wakeMs, wakes gestures up. */
  trackWake(h, t, events) {
    const cfg = this.cfg;
    const palmUp = h.pose === Pose.OPEN && h.feat.facing >= cfg.wakeFacing;
    if (!palmUp) {
      this.wake = null;
      return;
    }
    const w = this.wake;
    if (!w || Math.hypot(h.pos[0] - w.x, h.pos[1] - w.y) > cfg.wakeSlop) {
      this.wake = { t, x: h.pos[0], y: h.pos[1], progress: 0, fired: false };
      return;
    }
    w.progress = Math.min(((t - w.t) * 1000) / cfg.wakeMs, 1);
    if (w.progress >= 1 && !w.fired) {
      w.fired = true;
      const wasAwake = t < this.awakeUntil;
      this.awakeUntil = t + cfg.listenMs / 1000;
      if (!wasAwake) events.push({ type: "wake" });
    }
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
    const awake = this.activation === "wake" && t < this.awakeUntil;
    if (!h) return { present: false, activation: this.activation, awake };
    const armed = (t - h.firstSeen) * 1000 >= this.cfg.armMs;
    return {
      present: true,
      activation: this.activation,
      // Whether gestures count right now, and in "wake" mode how far along waking up is.
      active: armed && (this.activation === "wake" ? awake : this.activation === "raise" ? h.raised : true),
      awake,
      listenLeft: awake ? this.awakeUntil - t : 0,
      waking: this.activation === "wake" && !awake && this.wake && this.wake.progress > 0.1 ? this.wake.progress : 0,
      side: h.side > 0 ? "right" : h.side < 0 ? "left" : null,
      armed,
      x: h.pos[0],
      y: h.pos[1],
      pose: h.pose,
      pinch: h.feat ? h.poses.pinchStrength(h.feat) : 0,
      hold: h.hold && !h.hold.fired && h.hold.progress > 0.15 ? { name: h.hold.name, progress: h.hold.progress } : null,
      drag: h.pinch && h.pinch.drag ? { axis: h.pinch.drag, delta: h.pinch.delta } : null,
    };
  }
}

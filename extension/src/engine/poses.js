// Pose classification with hysteresis and time-based debounce, ported from HoloTouch's PoseTracker
// and cut down to the poses video control uses.

import { POSE } from "./config.js";

export const Pose = Object.freeze({
  NEUTRAL: "neutral",
  OPEN: "open",
  PINCH: "pinch",
  FIST: "fist",
  THUMBS_UP: "thumbs_up",
  PEACE: "peace", // index and middle up, the rest folded
  POINT: "point", // index up alone
});

export class PoseTracker {
  constructor(cfg = POSE) {
    this.cfg = cfg;
    this.pose = Pose.NEUTRAL;
    this.since = 0;
    this.candidate = Pose.NEUTRAL;
    this.candidateSince = 0;
    this.extended = [false, false, false, false];
  }

  reset() {
    this.pose = Pose.NEUTRAL;
    this.candidate = Pose.NEUTRAL;
    this.extended = [false, false, false, false];
  }

  classify(f) {
    const cfg = this.cfg;
    // A thumb held well up makes it a thumbs-up even with the fingers less tightly curled than a
    // fist's: a real one measured 0.57 against a fist's 0.58.
    if (this.thumbsUp(f) && f.curl.every((c) => c < cfg.fistExit)) return Pose.THUMBS_UP;
    if (f.curl.every((c) => c < (this.pose === Pose.FIST ? cfg.fistExit : cfg.fistEnter))) return Pose.FIST;

    if (this.pose === Pose.PINCH && f.pinchIndex < cfg.pinchExit) return Pose.PINCH;
    // The pinky pinch is not a gesture here, but a thumb nearer the pinky than the index is not an index pinch.
    if (f.pinchIndex < cfg.pinchEnter && f.pinchIndex <= Math.min(f.pinchPinky, f.pinchOthers) * cfg.pinchMargin) {
      return Pose.PINCH;
    }

    const slackPoint = this.pose === Pose.POINT ? cfg.pointSlack : 0;
    if (f.straight[0] >= cfg.pointStraight - slackPoint && Math.max(...f.straight.slice(1)) <= cfg.pointFolded + slackPoint) {
      return Pose.POINT;
    }
    const slackPeace = this.pose === Pose.PEACE ? cfg.pointSlack : 0;
    if (
      Math.min(f.straight[0], f.straight[1]) >= cfg.pointStraight - slackPeace &&
      Math.max(f.straight[2], f.straight[3]) <= cfg.peaceFolded + slackPeace
    ) {
      return Pose.PEACE;
    }

    for (let i = 0; i < 4; i++) {
      this.extended[i] = f.straight[i] > (this.extended[i] ? cfg.extendExit : cfg.extendEnter);
    }
    if (this.extended.every(Boolean)) return Pose.OPEN;
    return Pose.NEUTRAL;
  }

  thumbsUp(f) {
    const cfg = this.cfg;
    const keep = this.pose === Pose.THUMBS_UP ? 0.1 : 0;
    return f.thumbReach >= cfg.thumbReach - keep && f.thumbUp <= cfg.thumbUp + keep && f.thumbAbove >= cfg.thumbAbove - keep;
  }

  holdMs(candidate) {
    const cfg = this.cfg;
    if (this.pose === Pose.PINCH) return cfg.pinchOffMs;
    if (candidate === Pose.PINCH) return cfg.pinchOnMs;
    if (candidate === Pose.FIST || candidate === Pose.THUMBS_UP) return cfg.fistOnMs;
    return cfg.poseOnMs;
  }

  /** t in seconds. Returns the stable pose. */
  update(f, t) {
    const candidate = this.classify(f);
    if (candidate === this.pose) {
      this.candidate = candidate;
      return this.pose;
    }
    if (candidate !== this.candidate) {
      this.candidate = candidate;
      this.candidateSince = t;
    }
    if ((t - this.candidateSince) * 1000 >= this.holdMs(candidate)) {
      this.pose = candidate;
      this.since = t;
    }
    return this.pose;
  }

  /** 0 when the fingers are apart at the exit threshold, 1 when fully closed. */
  pinchStrength(f) {
    const cfg = this.cfg;
    const closed = cfg.pinchEnter * 0.5;
    const open = cfg.pinchExit * 1.6;
    return Math.min(Math.max((open - f.pinchIndex) / Math.max(open - closed, 1e-6), 0), 1);
  }
}

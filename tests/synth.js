// Synthetic hands, ported from HoloTouch's tests/synth.py, so the engine can be tested without a camera.

import { GestureEngine } from "../extension/src/engine/gestures.js";

const WRIST = [0.0, 0.04, 0.0];
const THUMB_BASE = [
  [-0.02, 0.02, -0.01],
  [-0.04, 0.0, -0.015],
  [-0.055, -0.02, -0.02],
];
const MCPS = [
  [-0.025, -0.045, 0.0],
  [-0.005, -0.05, 0.0],
  [0.012, -0.045, 0.0],
  [0.028, -0.035, 0.0],
];
const BONES = [
  [0.04, 0.025, 0.02],
  [0.045, 0.028, 0.02],
  [0.04, 0.026, 0.02],
  [0.032, 0.02, 0.018],
];

// pose -> [curl per finger index..pinky, thumb tip position or the finger index it touches]
const POSES = {
  open: [[0, 0, 0, 0], [-0.07, -0.04, -0.02]],
  neutral: [[0.35, 0.35, 0.35, 0.35], [-0.07, -0.02, -0.02]],
  pinch: [[0.45, 0, 0, 0], 0],
  fist: [[1, 1, 1, 1], [-0.02, -0.03, -0.04]],
  thumbs_up: [[1, 1, 1, 1], [-0.06, -0.075, -0.02]],
  peace: [[0, 0, 1, 1], [0.0, -0.02, -0.035]],
  point: [[0, 1, 1, 1], [0.0, -0.02, -0.035]],
};
const IMAGE_SCALE = [1.2, 2.1];

function finger(mcp, bones, curl) {
  const points = [mcp];
  let pos = [...mcp];
  let angle = 0;
  for (const len of bones) {
    angle += (curl * Math.PI) / 2;
    pos = [pos[0], pos[1] - len * Math.cos(angle), pos[2] - len * Math.sin(angle)];
    points.push(pos);
  }
  return points;
}

export function worldLandmarks(pose) {
  const [curls, thumbSpec] = POSES[pose];
  const fingers = MCPS.map((m, i) => finger(m, BONES[i], curls[i]));
  let thumb = thumbSpec;
  if (typeof thumbSpec === "number") {
    const tip = fingers[thumbSpec][3];
    thumb = [tip[0] - 0.008, tip[1] + 0.005, tip[2]];
  }
  return [WRIST, ...THUMB_BASE, thumb, ...fingers.flat()];
}

/** A hand whose palm centre is at (x, y) in the mirrored frame (0..1). */
export function makeHand(pose, x, y, handedness = "Right") {
  const world = worldLandmarks(pose);
  const palmW = [0, 5, 17].reduce((a, i) => [a[0] + world[i][0] / 3, a[1] + world[i][1] / 3], [0, 0]);
  const image = world.map((p) => [
    x + (p[0] - palmW[0]) * IMAGE_SCALE[0],
    y + (p[1] - palmW[1]) * IMAGE_SCALE[1],
    p[2],
  ]);
  return { image, world, handedness };
}

/** Feeds 30 Hz synthetic frames into a GestureEngine and collects what it emits. */
export class Sim {
  constructor(opts) {
    this.engine = new GestureEngine(opts);
    this.t = 100;
    this.events = [];
    this.state = null;
  }

  /** hands(frac) -> list of [pose, x, y, handedness?], frac running 0..1 over the duration. */
  run(duration, hands) {
    const frames = Math.round(duration * 30);
    for (let i = 0; i < frames; i++) {
      const frac = frames > 1 ? i / (frames - 1) : 1;
      const specs = hands ? hands(frac) : [];
      const out = this.engine.update(
        specs.map(([p, x, y, side]) => makeHand(p, x, y, side)),
        this.t,
      );
      this.events.push(...out.events);
      this.state = out.state;
      this.t += 1 / 30;
    }
  }

  hold(duration, pose, x = 0.5, y = 0.5, side = "Right") {
    this.run(duration, () => [[pose, x, y, side]]);
  }

  glide(duration, pose, [x0, y0], [x1, y1]) {
    this.run(duration, (f) => {
      const s = f * f * (3 - 2 * f);
      return [[pose, x0 + (x1 - x0) * s, y0 + (y1 - y0) * s]];
    });
  }

  types() {
    return this.events.map((e) => (e.type === "swipe" ? `swipe:${e.dir}` : e.type === "hold" ? `hold:${e.name}` : e.type));
  }
}

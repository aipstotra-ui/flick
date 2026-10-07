import assert from "node:assert/strict";
import { test } from "node:test";

import { extractFeatures } from "../extension/src/engine/features.js";
import { PoseTracker } from "../extension/src/engine/poses.js";
import { makeHand, Sim } from "./synth.js";

test("each synthetic pose is read as itself", () => {
  for (const pose of ["open", "neutral", "pinch", "fist", "thumbs_up", "peace", "point"]) {
    const tracker = new PoseTracker();
    const f = extractFeatures(makeHand(pose, 0.5, 0.5));
    let read;
    for (let t = 0; t < 0.3; t += 1 / 30) read = tracker.update(f, t);
    assert.equal(read, pose, `${pose} read as ${read}`);
  }
});

test("a quick pinch is a tap", () => {
  const sim = new Sim();
  sim.hold(0.5, "open");
  sim.hold(0.2, "pinch");
  sim.hold(0.3, "open");
  assert.deepEqual(sim.types(), ["tap"]);
});

test("a long still pinch is not a tap", () => {
  const sim = new Sim();
  sim.hold(0.5, "open");
  sim.hold(0.8, "pinch");
  sim.hold(0.3, "open");
  assert.deepEqual(sim.types(), []);
});

test("a pinch dragged sideways scrubs along x", () => {
  const sim = new Sim();
  sim.hold(0.5, "open");
  sim.hold(0.15, "pinch");
  sim.glide(0.8, "pinch", [0.5, 0.5], [0.75, 0.52]);
  sim.hold(0.3, "open", 0.75, 0.52);
  const types = sim.types();
  assert.equal(types[0], "drag_start");
  assert.equal(types.at(-1), "drag_end");
  assert.ok(!types.includes("tap"));
  const end = sim.events.at(-1);
  assert.equal(end.axis, "x");
  assert.ok(end.delta > 0.15, `delta ${end.delta}`);
});

test("a pinch dragged upward changes along y with a positive delta", () => {
  const sim = new Sim();
  sim.hold(0.5, "open");
  sim.hold(0.15, "pinch");
  sim.glide(0.8, "pinch", [0.5, 0.6], [0.51, 0.35]);
  const start = sim.events.find((e) => e.type === "drag_start");
  assert.equal(start.axis, "y");
  assert.ok(sim.events.at(-1).delta > 0.15);
});

test("a fast open-hand swipe up is a swipe, and the hand coming back is ignored", () => {
  const sim = new Sim();
  sim.hold(0.5, "open", 0.5, 0.7);
  sim.glide(0.2, "open", [0.5, 0.7], [0.5, 0.4]);
  sim.hold(0.2, "open", 0.5, 0.4);
  sim.glide(0.25, "open", [0.5, 0.4], [0.5, 0.7]);
  assert.deepEqual(sim.types(), ["swipe:up"]);
});

test("swipes left and right", () => {
  for (const [from, to, dir] of [
    [0.7, 0.4, "left"],
    [0.3, 0.6, "right"],
  ]) {
    const sim = new Sim();
    sim.hold(0.5, "open", from, 0.5);
    sim.glide(0.2, "open", [from, 0.5], [to, 0.5]);
    assert.deepEqual(sim.types(), [`swipe:${dir}`]);
  }
});

test("a slow drift is not a swipe", () => {
  const sim = new Sim();
  sim.hold(0.5, "open", 0.3, 0.5);
  sim.glide(2.0, "open", [0.3, 0.5], [0.7, 0.5]);
  assert.deepEqual(sim.types(), []);
});

test("held poses fire once each", () => {
  for (const pose of ["fist", "thumbs_up", "peace", "point"]) {
    const sim = new Sim();
    sim.hold(0.5, "open");
    sim.hold(1.5, pose);
    assert.deepEqual(sim.types(), [`hold:${pose}`], pose);
  }
});

test("a fist that keeps moving does not fire", () => {
  const sim = new Sim();
  sim.hold(0.5, "open", 0.2, 0.5);
  sim.glide(1.2, "fist", [0.2, 0.5], [0.8, 0.5]);
  assert.ok(!sim.types().includes("hold:fist"));
});

test("a hand that has only just appeared does nothing", () => {
  const sim = new Sim();
  sim.hold(0.15, "pinch");
  sim.hold(0.3, "open");
  assert.deepEqual(sim.types(), []);
});

test("losing the hand mid-drag ends the drag", () => {
  const sim = new Sim();
  sim.hold(0.5, "open");
  sim.hold(0.15, "pinch");
  sim.glide(0.4, "pinch", [0.5, 0.5], [0.7, 0.5]);
  sim.run(0.5, () => []);
  assert.equal(sim.types().at(-1), "drag_end");
  assert.equal(sim.state.present, false);
});

test("a hand moving off right after a drag is not a swipe", () => {
  const sim = new Sim();
  sim.hold(0.5, "open");
  sim.hold(0.15, "pinch");
  sim.glide(0.6, "pinch", [0.5, 0.5], [0.7, 0.5]);
  sim.glide(0.2, "open", [0.7, 0.5], [0.4, 0.5]);
  assert.ok(!sim.types().some((t) => t.startsWith("swipe")), sim.types().join());
});

test("a fast swipe on a slow computer (10 frames a second) still counts", () => {
  const sim = new Sim({ fps: 10 });
  sim.hold(0.6, "open", 0.3, 0.5);
  // 0.3 of the frame between two frames (3 frame widths a second): further than the fixed 0.25 a
  // followed hand was once allowed to move, which took it for a different hand and lost the swipe.
  sim.run(0.2, (f) => [["open", 0.3 + 0.3 * f, 0.5]]);
  sim.hold(0.5, "open", 0.6, 0.5);
  assert.deepEqual(sim.types(), ["swipe:right"]);
});

test("a different hand appearing far away is a new hand, not a swipe", () => {
  const sim = new Sim();
  sim.hold(0.6, "open", 0.2, 0.5);
  sim.hold(0.5, "open", 0.8, 0.5);
  assert.deepEqual(sim.types(), []);
});

test("a swipe whose middle frames lose the hand still counts", () => {
  const sim = new Sim();
  sim.hold(0.6, "open", 0.3, 0.5);
  sim.run(0.3, () => []); // the blur: no hand found for 300 ms
  sim.hold(0.5, "open", 0.66, 0.5);
  assert.deepEqual(sim.types(), ["swipe:right"]);
});

test("a hand gone for half a second and back elsewhere is not a swipe", () => {
  const sim = new Sim();
  sim.hold(0.6, "open", 0.3, 0.5);
  sim.run(0.5, () => []);
  sim.hold(0.5, "open", 0.66, 0.5);
  assert.deepEqual(sim.types(), []);
});

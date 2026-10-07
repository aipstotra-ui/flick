// When gestures count: the wake palm, the raised-hand zone, and following one hand only.

import assert from "node:assert/strict";
import { test } from "node:test";

import { Sim } from "./synth.js";

test("wake mode: gestures before waking do nothing", () => {
  const sim = new Sim({ activation: "wake" });
  sim.hold(0.3, "neutral");
  sim.hold(1.5, "fist");
  assert.deepEqual(sim.types(), []);
  assert.equal(sim.state.active, false);
});

test("wake mode: a still open palm wakes it, and a gesture then works", () => {
  const sim = new Sim({ activation: "wake" });
  sim.hold(1.0, "open");
  assert.deepEqual(sim.types(), ["wake"]);
  assert.equal(sim.state.active, true);
  sim.hold(1.5, "fist");
  assert.deepEqual(sim.types(), ["wake", "hold:fist"]);
});

test("wake mode: it goes back to sleep after listenMs with no gesture", () => {
  const sim = new Sim({ activation: "wake" });
  sim.hold(1.0, "open");
  sim.hold(9.0, "neutral");
  assert.equal(sim.state.awake, false);
  sim.hold(1.5, "thumbs_up");
  assert.deepEqual(sim.types(), ["wake"]);
});

test("wake mode: each gesture keeps it awake", () => {
  const sim = new Sim({ activation: "wake" });
  sim.hold(1.0, "open");
  sim.hold(6.0, "neutral");
  sim.hold(1.5, "fist"); // at about 7 s: keeps it awake for another 8 s
  sim.hold(6.0, "neutral");
  sim.hold(1.5, "thumbs_up");
  assert.deepEqual(sim.types(), ["wake", "hold:fist", "hold:thumbs_up"]);
});

test("wake mode: a palm waved about does not wake it", () => {
  const sim = new Sim({ activation: "wake" });
  sim.hold(0.3, "open", 0.3, 0.5);
  sim.glide(1.5, "open", [0.3, 0.5], [0.7, 0.5]);
  assert.ok(!sim.types().includes("wake"));
});

test("wake mode: swiping after waking works", () => {
  const sim = new Sim({ activation: "wake" });
  sim.hold(1.0, "open", 0.5, 0.7);
  sim.glide(0.2, "open", [0.5, 0.7], [0.5, 0.4]);
  assert.deepEqual(sim.types(), ["wake", "swipe:up"]);
});

test("raise mode: a hand held low does nothing, a raised one works", () => {
  const sim = new Sim({ activation: "raise" });
  sim.hold(0.5, "open", 0.5, 0.85);
  sim.hold(1.5, "fist", 0.5, 0.85);
  assert.deepEqual(sim.types(), []);
  sim.hold(0.5, "open", 0.5, 0.45);
  sim.hold(1.5, "fist", 0.5, 0.45);
  assert.deepEqual(sim.types(), ["hold:fist"]);
});

test("raise mode: a scrub begun up high carries on below the line", () => {
  const sim = new Sim({ activation: "raise" });
  sim.hold(0.5, "open", 0.5, 0.5);
  sim.hold(0.15, "pinch", 0.5, 0.5);
  sim.glide(0.8, "pinch", [0.5, 0.5], [0.52, 0.85]);
  const types = sim.types();
  assert.equal(types[0], "drag_start");
  assert.ok(sim.events.filter((e) => e.type === "drag").at(-1).delta < -0.25);
});

test("right hand only: the left hand is ignored", () => {
  const sim = new Sim({ hand: "right" });
  sim.hold(0.5, "open", 0.5, 0.5, "Left");
  sim.hold(1.5, "fist", 0.5, 0.5, "Left");
  assert.deepEqual(sim.types(), []);
  assert.equal(sim.state.present, false);
  sim.hold(0.5, "open", 0.5, 0.5, "Right");
  sim.hold(1.5, "fist", 0.5, 0.5, "Right");
  assert.deepEqual(sim.types(), ["hold:fist"]);
});

test("left hand only, with both hands in view, follows the left", () => {
  const sim = new Sim({ hand: "left" });
  sim.run(0.5, () => [["open", 0.3, 0.5, "Right"], ["open", 0.7, 0.5, "Left"]]);
  sim.run(1.5, () => [["fist", 0.3, 0.5, "Right"], ["thumbs_up", 0.7, 0.5, "Left"]]);
  assert.deepEqual(sim.types(), ["hold:thumbs_up"]);
  assert.equal(sim.state.side, "left");
});

test("one misread frame does not drop the followed hand", () => {
  const sim = new Sim({ hand: "right" });
  sim.hold(0.5, "open");
  sim.hold(0.4, "fist");
  sim.hold(1 / 30, "fist", 0.5, 0.5, "Left");
  sim.hold(0.4, "fist");
  assert.deepEqual(sim.types(), ["hold:fist"]);
});

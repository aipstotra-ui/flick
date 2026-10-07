// Landmarks MediaPipe found in real photos (MediaPipe's own sample images), run through the pose rules.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { extractFeatures } from "../extension/src/engine/features.js";
import { PoseTracker } from "../extension/src/engine/poses.js";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/real_hands.json", import.meta.url)));
const EXPECTED = {
  thumbs_up: "thumbs_up",
  fist_thumb_down: "fist",
  fist: "fist",
  peace_a: "peace",
  peace_b: "peace",
  point_a: "point",
  point_b: "point",
  relaxed: "neutral",
};

for (const [name, want] of Object.entries(EXPECTED)) {
  test(`real photo "${name}" reads as ${want}`, () => {
    const { aspect, hands } = fixtures[name];
    assert.ok(hands.length > 0, "no hand found");
    for (const hand of hands) {
      const f = extractFeatures(hand, aspect);
      const tracker = new PoseTracker();
      let pose;
      for (let t = 0; t < 0.4; t += 1 / 30) pose = tracker.update(f, t);
      assert.equal(pose, want);
    }
  });
}

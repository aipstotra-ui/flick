// Hand measurements in palm lengths, ported from HoloTouch's core/poses.py.
// A hand is { image: [[x,y,z]x21] normalised to the mirrored frame, world: [[x,y,z]x21] metres }.

export const WRIST = 0;
export const THUMB_MCP = 2;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const INDEX_TIP = 8;
export const MIDDLE_MCP = 9;
export const MIDDLE_TIP = 12;
export const RING_TIP = 16;
export const PINKY_MCP = 17;
export const PINKY_TIP = 20;
export const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

// How far apart in depth the thumb and index tips may be, by the picture's own estimate, and still
// be taken for touching where they meet in the picture.
const MAX_DEPTH_GAP = 0.45;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => norm(sub(a, b));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function dist2(a, b, aspect) {
  return Math.hypot((a[0] - b[0]) * aspect, a[1] - b[1]);
}

/** The palm's length in the picture, or its width scaled to match: whichever is less foreshortened. */
export function picturePalm(image, aspect) {
  return Math.max(
    dist2(image[MIDDLE_MCP], image[WRIST], aspect),
    1.25 * dist2(image[INDEX_MCP], image[PINKY_MCP], aspect),
    1e-6,
  );
}

/** Thumb tip to index fingertip as the picture shows them, in palm lengths. */
function picturePinch(image, aspect) {
  const palm = picturePalm(image, aspect);
  const depth = (Math.abs(image[THUMB_TIP][2] - image[INDEX_TIP][2]) * aspect) / palm;
  if (depth > MAX_DEPTH_GAP) return Infinity;
  return dist2(image[THUMB_TIP], image[INDEX_TIP], aspect) / palm;
}

/** How far the point is from the nearest part of the bone from a to b. */
function toSegment(p, a, b) {
  const bone = sub(b, a);
  const along = Math.min(Math.max(dot(sub(p, a), bone) / Math.max(dot(bone, bone), 1e-12), 0), 1);
  return dist(p, [a[0] + along * bone[0], a[1] + along * bone[1], a[2] + along * bone[2]]);
}

export function extractFeatures(hand, aspect = 16 / 9) {
  const w = hand.world;
  const palmLen = Math.max(dist(w[MIDDLE_MCP], w[WRIST]), 1e-4);
  const curl = [];
  const straight = [];
  for (const [mcp, pip, dip, tip] of FINGERS) {
    const reach = dist(w[tip], w[mcp]);
    const bones = dist(w[pip], w[mcp]) + dist(w[dip], w[pip]) + dist(w[tip], w[dip]);
    curl.push(reach / palmLen);
    straight.push(reach / Math.max(bones, 1e-4));
  }
  const normal = cross(sub(w[INDEX_MCP], w[WRIST]), sub(w[PINKY_MCP], w[WRIST]));
  const facing = Math.abs(normal[2]) / Math.max(norm(normal), 1e-9);
  const img = hand.image;
  const palm = [
    (img[WRIST][0] + img[INDEX_MCP][0] + img[PINKY_MCP][0]) / 3,
    (img[WRIST][1] + img[INDEX_MCP][1] + img[PINKY_MCP][1]) / 3,
  ];
  const thumb = w[THUMB_TIP];
  const pinchOthers = Math.min(dist(thumb, w[MIDDLE_TIP]), dist(thumb, w[RING_TIP])) / palmLen;
  const mid = FINGERS[1];
  let tuck = Infinity;
  for (let i = 0; i < 3; i++) tuck = Math.min(tuck, toSegment(thumb, w[mid[i]], w[mid[i + 1]]));
  // The thumb's own direction and reach, for telling a thumbs-up from a fist.
  const thumbVec = sub(thumb, w[THUMB_MCP]);
  const thumbLen = norm(thumbVec);
  return {
    palm,
    palmScale: picturePalm(img, aspect),
    pinchIndex: Math.min(dist(thumb, w[INDEX_TIP]) / palmLen, picturePinch(img, aspect)),
    pinchPinky: dist(thumb, w[PINKY_TIP]) / palmLen,
    pinchOthers,
    thumbTuck: tuck / palmLen,
    curl,
    straight,
    facing,
    thumbReach: thumbLen / palmLen,
    // -1 when the thumb points straight up in the picture, +1 straight down.
    thumbUp: thumbLen > 1e-6 ? thumbVec[1] / thumbLen : 0,
    // How far above the index knuckle the thumb tip is, in palm lengths (positive is above).
    thumbAbove: (w[INDEX_MCP][1] - thumb[1]) / palmLen,
  };
}

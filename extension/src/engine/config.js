// Every tunable threshold, with HoloTouch's measured values where they carry over.

export const POSE = {
  // Thumb tip to fingertip over palm length. Touching fingertips measure about 0.15; a relaxed
  // hand sits near 0.4 to 0.6.
  pinchEnter: 0.25,
  pinchExit: 0.42,
  pinchMargin: 1.3,
  // Fingertip to knuckle over palm length; all four under this is a fist. Curled fingers measure
  // 0.2 to 0.55, relaxed ones 0.6 and up.
  fistEnter: 0.58,
  fistExit: 0.68,
  // Finger straightness: a flat open hand is above 0.96, a relaxed one around 0.9.
  extendEnter: 0.94,
  extendExit: 0.9,
  // Pointing: index at least this straight, the other three folded to this or under.
  pointStraight: 0.88,
  pointFolded: 0.72,
  pointSlack: 0.07,
  // The peace sign's two folded fingers may be looser than pointing's: real ones measure up to 0.74,
  // where an open hand's are 0.9 and up.
  peaceFolded: 0.8,
  // A thumbs-up: the thumb reaching at least this far from its base, pointing this nearly up,
  // with its tip this far above the index knuckle. A real one measured 0.85 and 0.65; a fist's
  // tucked thumb 0.56 and -0.03.
  thumbReach: 0.65,
  thumbUp: -0.6,
  thumbAbove: 0.3,
  turnedFacing: 0.73,
  // How long a candidate pose must persist before it counts.
  pinchOnMs: 30,
  pinchOffMs: 60,
  fistOnMs: 90,
  poseOnMs: 80,
};

export const GESTURE = {
  // A new hand must be in view this long before its gestures count.
  armMs: 250,
  // A hand not seen for this long is forgotten.
  lostMs: 250,
  // Pinches that start while the hand moves faster than this (frame widths/s) are ignored.
  maxPinchOnsetSpeed: 1.2,
  // A pinch released within tapMs that moved less than tapSlop is a tap.
  tapMs: 350,
  tapSlop: 0.03,
  // A held pinch that moves dragSlop picks the axis it moved most along, if by dragAxisRatio.
  dragSlop: 0.035,
  dragAxisRatio: 1.3,
  // A swipe covers swipeDistX (or Y) of the frame within swipeWindowMs, mostly along one axis.
  swipeDistX: 0.16,
  swipeDistY: 0.13,
  swipeWindowMs: 320,
  swipeAxisRatio: 1.8,
  // and starts from a hand moving slower than this (frame units/s) just before.
  swipeRestSpeed: 0.9,
  swipeCooldownMs: 600,
  // After a swipe, the opposite direction is ignored this long: it is the hand coming back.
  swipeReturnMs: 1100,
  // No swipe counts this soon after a pinch ends.
  afterPinchMs: 400,
  // Poses held still this long fire once.
  holdMs: { fist: 500, thumbs_up: 450, peace: 600, point: 600 },
  holdSlop: 0.05,

  // Activation ("activation" setting). In "wake" mode an open palm, facing the camera and held
  // still for wakeMs, starts gestures; they stop after listenMs with no gesture.
  wakeMs: 500,
  wakeSlop: 0.04,
  wakeFacing: 0.6,
  listenMs: 8000,
  // In "raise" mode the palm must be above raiseEnterY of the frame (0 is the top) to start
  // gestures, and drops out below raiseExitY. Chin and shoulder height sit around 0.45 to 0.6 on a
  // laptop camera; hands on a desk or a lap sit below 0.75.
  raiseEnterY: 0.62,
  raiseExitY: 0.7,
  // How quickly the followed hand's left/right reading follows MediaPipe's per-frame label (0..1).
  // One misread frame does not turn a right hand into a left one.
  sideFollow: 0.25,
};

export const FILTER = {
  minCutoff: 1.2,
  beta: 8.0,
  dCutoff: 1.0,
};

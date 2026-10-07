import { loadLandmarker, openCamera } from "../offscreen/landmarker.js";
import { createTracker } from "../offscreen/tracker.js";
import { GESTURES, icon } from "../shared/gestures.js";
import { engineOptions, loadSettings, saveSettings } from "../shared/settings.js";

const $ = (id) => document.getElementById(id);
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const POSE_WORDS = { pinch: "Pinch", fist: "Fist", thumbs_up: "Thumbs up", peace: "Peace sign", point: "Pointing", open: "Open hand", neutral: "Hand" };
const FINISH_AFTER = 3; // gestures tried before setup counts as done

for (const el of document.querySelectorAll("[data-icon]")) el.innerHTML = icon(el.dataset.icon);

// The first step depends on how gestures start: a wake palm, a raised hand, or nothing.
const START_STEP = {
  wake: { key: "start", icon: "hand", how: "Hold up an open palm", does: "Starts listening for gestures" },
  raise: { key: "start", icon: "hand", how: "Raise your hand to chin height", does: "Gestures work while it's up" },
};
const HAND_WORDS = { right: "your right hand", left: "your left hand", either: "either hand" };

let settings = await loadSettings();
const done = new Set();
let finished = false;
let toastTimer = 0;

function steps() {
  const start = START_STEP[settings.activation];
  return start ? [start, ...GESTURES] : GESTURES;
}

function renderMode() {
  const how = { wake: "Show your palm to start", raise: "Raise your hand to start", always: "Gestures always on" }[settings.activation];
  $("mode-line").textContent = `${how} · using ${HAND_WORDS[settings.hand]}. Change this in the toolbar popup.`;
}

function renderChecklist() {
  const list = $("gesture-list");
  list.innerHTML = "";
  for (const g of steps()) {
    const li = document.createElement("li");
    li.id = `g-${g.key}`;
    if (g.key === "start") li.classList.add("start");
    if (done.has(g.key)) li.classList.add("done");
    li.innerHTML = `<span class="glyph">${icon(g.icon)}</span>
      <div class="text"><span></span><small></small></div>
      <span class="tick">${icon("check")}</span>`;
    li.querySelector(".text span").textContent = g.how;
    li.querySelector(".text small").textContent = g.does;
    list.appendChild(li);
  }
  $("count").textContent = `${done.size} of ${steps().length}`;
}

function tick(key) {
  const li = $(`g-${key}`);
  if (!li) return;
  li.classList.add("done", "flash");
  setTimeout(() => li.classList.remove("flash"), 600);
  done.add(key);
  $("count").textContent = `${done.size} of ${steps().length}`;
}

function toast(iconName, label) {
  const el = $("toast");
  el.innerHTML = `${icon(iconName)}<span></span>`;
  el.lastChild.textContent = label;
  el.classList.remove("on");
  void el.offsetWidth;
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 1000);
}

async function finish() {
  if (finished) return;
  finished = true;
  await saveSettings({ enabled: true });
  chrome.runtime.sendMessage({ type: "ht/camera-granted" }).catch(() => {});
  $("step-done").hidden = false;
  $("step-done").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function onEvent(e) {
  if (e.type === "wake") {
    toast("hand", "Listening");
    tick("start");
    return;
  }
  const g = GESTURES.find((x) => x.event(e));
  if (!g) return;
  toast(g.icon, e.type === "swipe" ? `Swipe ${e.dir}` : g.does);
  tick(g.key);
  if ([...done].filter((k) => k !== "start").length >= FINISH_AFTER) finish();
}

/** The same words as the pill on a video. */
function chipText(state) {
  if (!state.present) return "Raise your hand";
  const side = state.side ? `${state.side === "right" ? "Right" : "Left"} hand · ` : "";
  if (state.waking) return `${side}Waking… ${Math.round(state.waking * 100)}%`;
  if (state.active === false) return `${side}${state.activation === "wake" ? "Show palm to start" : "Raise hand"}`;
  if (state.hold) return `${side}Holding… ${Math.round(state.hold.progress * 100)}%`;
  return `${side}${state.activation === "wake" ? "Listening · " : ""}${POSE_WORDS[state.pose] || "Hand"}`;
}

function draw(canvas, landmarks) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.lineCap = "round";
  for (const hand of landmarks) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      ctx.moveTo(hand[a][0] * w, hand[a][1] * h);
      ctx.lineTo(hand[b][0] * w, hand[b][1] * h);
    }
    ctx.stroke();
    ctx.fillStyle = "#fff";
    for (const p of hand) {
      ctx.beginPath();
      ctx.arc(p[0] * w, p[1] * h, 2.6 * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

async function startPractice(stream) {
  $("step-camera").hidden = true;
  $("step-practice").hidden = false;
  const video = $("video");
  video.srcObject = stream;
  await video.play();
  const canvas = $("canvas");
  const resize = () => {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
  };
  resize();
  addEventListener("resize", resize);

  const landmarker = await loadLandmarker();
  $("loading").hidden = true;
  const chip = $("chip");
  const tracker = createTracker({
    track: stream.getVideoTracks()[0].clone(),
    landmarker,
    options: engineOptions(settings),
    withLandmarks: true,
    onFrame: ({ state, events, landmarks }) => {
      draw(canvas, landmarks);
      chip.classList.toggle("ready", !!(state.present && state.armed && state.active !== false));
      $("chip-text").textContent = chipText(state);
      if (state.present && state.active && settings.activation === "raise") tick("start");
      events.forEach(onEvent);
    },
  });
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "sync" || !changes.settings) return;
    settings = await loadSettings();
    tracker.setOptions(engineOptions(settings));
    renderMode();
    renderChecklist();
  });
  tracker.run();
  addEventListener("pagehide", () => {
    tracker.stop();
    stream.getTracks().forEach((t) => t.stop());
  });
}

async function allow() {
  $("camera-error").hidden = true;
  try {
    const stream = await openCamera();
    chrome.runtime.sendMessage({ type: "ht/camera-granted" }).catch(() => {});
    await startPractice(stream);
  } catch (err) {
    const el = $("camera-error");
    el.hidden = false;
    el.textContent =
      err && err.name === "NotAllowedError"
        ? "Camera access was blocked. Click the camera icon in the address bar, choose Allow, then try again."
        : err && err.name === "NotFoundError"
          ? "No camera was found. Plug one in and try again."
          : `The camera couldn't start: ${err && err.message}`;
  }
}

renderMode();
renderChecklist();
$("allow").addEventListener("click", allow);

// Already allowed (opened again from the popup): go straight to practice.
navigator.permissions
  .query({ name: "camera" })
  .then((p) => {
    if (p.state === "granted") allow();
  })
  .catch(() => {});

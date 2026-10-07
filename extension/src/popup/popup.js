import { GESTURES, icon } from "../shared/gestures.js";
import { loadSettings, saveSettings } from "../shared/settings.js";

const $ = (id) => document.getElementById(id);
const ONBOARDING = chrome.runtime.getURL("src/onboarding/onboarding.html");

let settings = await loadSettings();
let status = (await chrome.storage.session.get("status")).status || { camera: "off" };
let live = null; // the latest hand state, while frames arrive

function renderGestures() {
  const list = $("gestures");
  list.innerHTML = "";
  for (const g of GESTURES) {
    const on = settings.gestures[g.key];
    const li = document.createElement("li");
    li.className = on ? "" : "off";
    li.innerHTML = `
      <span class="glyph">${icon(g.icon)}</span>
      <div class="text"><span></span><small></small></div>
      <label class="switch"><input type="checkbox" /><span></span></label>`;
    li.querySelector(".text span").textContent = g.does;
    li.querySelector(".text small").textContent = g.how;
    const input = li.querySelector("input");
    input.checked = on;
    input.setAttribute("aria-label", g.does);
    input.addEventListener("change", async () => {
      settings = await saveSettings({ gestures: { [g.key]: input.checked } });
      li.className = input.checked ? "" : "off";
      renderSettings();
    });
    list.appendChild(li);
  }
}

const ACTIVATION_HINTS = {
  wake: "Hold an open palm up for a moment. Gestures then work until you stop for 8 seconds.",
  raise: "Gestures only work with your hand raised to chin or shoulder height.",
  always: "Any hand in view can control the video.",
};

function renderSegments(id, value) {
  for (const b of $(id).querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === String(value)));
}

function renderSettings() {
  renderSegments("activation", settings.activation);
  renderSegments("hand", settings.hand);
  $("activation-hint").textContent = ACTIVATION_HINTS[settings.activation];
  const on = GESTURES.filter((g) => settings.gestures[g.key]).length;
  $("gestures-count").textContent = `${on} of ${GESTURES.length} on`;
  $("enabled").checked = settings.enabled;
  $("showHand").checked = settings.showHand;
  $("extras").checked = settings.extras;
  renderSegments("seek", settings.seekStep);
}

const POSE_WORDS = { pinch: "Pinch", fist: "Fist", thumbs_up: "Thumbs up", peace: "Peace sign", point: "Pointing", open: "Open hand" };

function renderStatus() {
  const dot = $("dot");
  const text = $("status-text");
  const notice = $("notice");
  dot.className = "dot";
  notice.hidden = true;
  if (!settings.enabled) {
    text.textContent = "Off · camera closed";
    return;
  }
  switch (status.camera) {
    case "on": {
      dot.classList.add("on");
      const st = live && live.state;
      if (st && st.present && st.active === false) {
        text.textContent = `${st.activation === "wake" ? "Show your palm to start" : "Raise your hand to start"} · ${live.fps} fps`;
      } else if (st && st.present) {
        text.textContent = `${POSE_WORDS[st.pose] || "Hand"} seen${st.awake ? " · listening" : ""} · ${live.fps} fps`;
      } else {
        text.textContent = live ? `Watching for your hand · ${live.fps} fps` : "Watching for your hand";
      }
      return;
    }
    case "needs-permission":
      dot.classList.add("warn");
      text.textContent = "Camera access needed";
      notice.hidden = false;
      $("notice-text").textContent = "Flick needs your camera to see your hand. Video stays on this computer.";
      $("notice-action").textContent = "Allow camera";
      return;
    case "error":
      dot.classList.add("warn");
      text.textContent = "Camera problem";
      notice.hidden = false;
      $("notice-text").textContent = status.error || "The camera couldn't start. Check that no other app is using it.";
      $("notice-action").textContent = "Open setup";
      return;
    default:
      dot.classList.add("busy");
      text.textContent = "Starting camera…";
  }
}

$("enabled").addEventListener("change", async (e) => {
  settings = await saveSettings({ enabled: e.target.checked });
  live = null;
  renderStatus();
});
$("showHand").addEventListener("change", async (e) => (settings = await saveSettings({ showHand: e.target.checked })));
$("extras").addEventListener("change", async (e) => (settings = await saveSettings({ extras: e.target.checked })));
$("seek").addEventListener("click", async (e) => {
  const v = e.target.dataset && Number(e.target.dataset.v);
  if (!v) return;
  settings = await saveSettings({ seekStep: v });
  renderSettings();
});
for (const key of ["activation", "hand"]) {
  $(key).addEventListener("click", async (e) => {
    const v = e.target.dataset && e.target.dataset.v;
    if (!v) return;
    settings = await saveSettings({ [key]: v });
    renderSettings();
  });
}
$("practice").addEventListener("click", () => chrome.tabs.create({ url: ONBOARDING }));
$("notice-action").addEventListener("click", () => chrome.tabs.create({ url: ONBOARDING }));

chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.status) {
    status = changes.status.newValue || { camera: "off" };
    renderStatus();
  }
});

// The offscreen document's frames reach every extension page, this one included.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "ht/frame") {
    live = msg;
    if (status.camera !== "on") status = { camera: "on" };
    renderStatus();
  }
});

renderGestures();
renderSettings();
renderStatus();

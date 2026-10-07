// Service worker: starts and stops the camera, and routes gestures to the tab being watched.

import { loadSettings, saveSettings } from "./shared/settings.js";

const OFFSCREEN = "src/offscreen/offscreen.html";
const ONBOARDING = "src/onboarding/onboarding.html";

let activeTabId = null;
let creating = null;
const windowStateBefore = new Map(); // windowId -> state before we made it fullscreen

// --- Camera (offscreen document) ---------------------------------------------------------------

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  return contexts.length > 0;
}

async function startTracking() {
  if (await hasOffscreen()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN,
      reasons: ["USER_MEDIA"],
      justification: "Reads the webcam on this computer to recognise hand gestures.",
    })
    .finally(() => (creating = null));
  await creating;
}

async function stopTracking() {
  if (creating) await creating;
  if (await hasOffscreen()) await chrome.offscreen.closeDocument();
  await setStatus({ camera: "off", fps: 0 });
}

async function setStatus(status) {
  await chrome.storage.session.set({ status: { ...status, at: Date.now() } });
}

// Starting and stopping run one at a time, so a quick on-off-on cannot interleave them.
let queue = Promise.resolve();
function serial(fn) {
  queue = queue.then(fn, fn);
  return queue;
}

function applyEnabled() {
  return serial(async () => {
    const { enabled } = await loadSettings();
    await chrome.action.setBadgeText({ text: enabled ? "on" : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#1D9E75" });
    if (enabled) await startTracking();
    else await stopTracking();
  });
}

/** After camera access is granted: an offscreen document that failed for want of it is restarted. */
function restartTracking() {
  return serial(async () => {
    const { enabled } = await loadSettings();
    if (!enabled) return;
    await stopTracking();
    await startTracking();
  });
}

// --- Which tab gets the gestures -------------------------------------------------------------

async function refreshActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  activeTabId = tab ? tab.id : null;
}

chrome.tabs.onActivated.addListener(({ tabId }) => (activeTabId = tabId));
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) refreshActiveTab();
});

function toActiveTab(message) {
  if (activeTabId == null) return;
  chrome.tabs.sendMessage(activeTabId, message).catch(() => {
    // No content script there (a chrome:// page, the web store, a tab still loading).
  });
}

// --- Commands the page cannot carry out itself -------------------------------------------------

async function switchTab(windowId, step) {
  const tabs = await chrome.tabs.query({ windowId });
  const current = tabs.findIndex((t) => t.active);
  if (current < 0) return;
  const next = tabs[(current + step + tabs.length) % tabs.length];
  await chrome.tabs.update(next.id, { active: true });
}

async function toggleFullscreen(windowId) {
  const win = await chrome.windows.get(windowId);
  if (win.state === "fullscreen") {
    await chrome.windows.update(windowId, { state: windowStateBefore.get(windowId) || "normal" });
    windowStateBefore.delete(windowId);
    return false;
  }
  windowStateBefore.set(windowId, win.state);
  await chrome.windows.update(windowId, { state: "fullscreen" });
  return true;
}

// --- Messages ----------------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  switch (msg && msg.type) {
    case "ht/frame":
      toActiveTab(msg);
      return false;
    case "ht/status":
      setStatus(msg.status);
      return false;
    case "ht/camera-granted":
      restartTracking();
      return false;
    case "ht/cmd": {
      const windowId = sender.tab && sender.tab.windowId;
      if (windowId == null) return false;
      if (msg.cmd === "tab_next") switchTab(windowId, 1);
      else if (msg.cmd === "tab_prev") switchTab(windowId, -1);
      else if (msg.cmd === "fullscreen") {
        toggleFullscreen(windowId).then((on) => reply({ on }));
        return true;
      }
      return false;
    }
    default:
      return false;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings) {
    const before = changes.settings.oldValue && changes.settings.oldValue.enabled;
    const after = changes.settings.newValue && changes.settings.newValue.enabled;
    if (before !== after) applyEnabled();
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-holotouch") return;
  const { enabled } = await loadSettings();
  await saveSettings({ enabled: !enabled });
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL(ONBOARDING) });
  applyEnabled();
});

chrome.runtime.onStartup.addListener(applyEnabled);
refreshActiveTab();

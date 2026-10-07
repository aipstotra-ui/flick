// A stand-in for the chrome.* APIs, so extension pages can be looked at in a plain browser tab.
(() => {
  const listeners = () => {
    const fns = [];
    return { addListener: (f) => fns.push(f), fire: (...a) => fns.forEach((f) => f(...a)) };
  };
  const area = (data = {}) => {
    const onChanged = listeners();
    return {
      data,
      onChanged,
      get: async (key) => (typeof key === "string" ? { [key]: data[key] } : { ...data }),
      set: async (obj) => {
        const changes = {};
        for (const [k, v] of Object.entries(obj)) {
          changes[k] = { oldValue: data[k], newValue: v };
          data[k] = v;
        }
        onChanged.fire(changes);
      },
    };
  };
  const params = new URLSearchParams(location.search);
  const sync = area({ settings: { enabled: params.get("enabled") !== "0" } });
  const session = area({ status: { camera: params.get("camera") || "on" } });
  const onMessage = listeners();
  window.chrome = {
    runtime: { getURL: (p) => `/extension/${p}`, sendMessage: async () => {}, onMessage },
    storage: { sync, session, onChanged: listeners() },
    tabs: { create: ({ url }) => console.log("open tab", url) },
  };
  // Pretend frames arrive, so live status shows.
  if (params.get("frames") === "1") {
    setInterval(() => onMessage.fire({ type: "ht/frame", fps: 30, events: [], state: { present: true, armed: true, pose: "open" } }), 200);
  }
})();

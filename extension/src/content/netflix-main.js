// Runs in Netflix's own page world: its player rejects currentTime changes from outside, so seeking
// goes through its player API, asked for over window.postMessage by the content script.

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (event.source !== window || !msg || msg.source !== "holotouch" || msg.cmd !== "seek") return;
  try {
    const api = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
    const player = api.getVideoPlayerBySessionId(api.getAllPlayerSessionIds()[0]);
    player.seek(msg.ms);
  } catch (err) {
    console.warn("HoloTouch: Netflix seek failed", err);
  }
});

# HoloTouch for video

Control YouTube, Shorts, TikTok, Instagram Reels and Netflix with your hand, through your webcam.
A Chrome extension, built on the gesture work of [HoloTouch](https://github.com/justanotherinternetguy/HoloTouch)
(BigRed//Hacks 2026), refocused on watching video from across the room.

Everything runs on your computer. Camera frames are measured and dropped inside the extension;
nothing is recorded or uploaded, and the camera is closed whenever gestures are off.

## Install (developer mode)

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose the `extension` folder.
3. The setup page opens: allow the camera, try a few gestures, and you're set.
4. Pin HoloTouch to the toolbar. **Alt+Shift+H** turns gestures on or off.

## Gestures

| Gesture | On a video | On other pages (optional) |
| --- | --- | --- |
| Quick pinch (thumb and index) | Play or pause | |
| Pinch and drag sideways | Scrub the timeline | |
| Pinch and drag up or down | Volume | |
| Swipe up / down | Next / previous short or video | Scroll the page |
| Swipe right / left | Forward / back (10 s by default) | Previous / next tab |
| Hold a fist | Mute | |
| Hold a thumbs up | Like | |
| Hold a peace sign | Full screen | |
| Hold one finger up | Speed 1× → 1.25× → 1.5× → 2× | |

### When gestures work

So a hand in view doesn't control the video by accident, the popup's **Start gestures** setting
decides when gestures count:

| Mode | How it works |
| --- | --- |
| **Show palm** (default) | Hold an open palm up to the camera for half a second. The pill in the video's corner says *Listening*, and gestures work until 8 seconds pass without one. Each gesture keeps it listening. |
| **Raise hand** | Gestures only count with your hand raised to chin or shoulder height. Hands on the desk or in your lap are ignored. |
| **Always** | Any hand in view controls the video. |

**Hand** picks which hand is followed: right (default), left or either. The other hand is ignored
completely, so it can hold a drink or scratch your nose.

A new hand must be in view for a quarter of a second before it does anything. A pinch that starts
while the hand is moving fast is ignored, the hand coming back after a swipe is not read as a swipe
the other way, and held poses only count when held still.

## How it works

```
webcam ─► offscreen document ─► service worker ─► content script on the active tab
          MediaPipe hands          routes frames      finds the main <video>,
          + gesture engine         to the tab         acts on it, draws the overlay
```

| Path | What it is |
| --- | --- |
| `extension/src/engine/` | The gesture engine: features, poses, 1€ filter, gestures. Pure JS, no browser APIs. |
| `extension/src/offscreen/` | Camera capture and MediaPipe, in an offscreen document |
| `extension/src/background.js` | Starts and stops the camera; routes gestures to the active tab |
| `extension/src/content/` | Site adapters, the video controller, and the on-video overlay |
| `extension/src/popup/`, `onboarding/` | The toolbar popup and the setup page |
| `extension/vendor/`, `models/` | MediaPipe's runtime and hand model, bundled (no remote code) |
| `tests/` | Engine tests on synthetic hands and on landmarks from real photos |
| `dev/` | Pages to preview the popup, setup page and overlay outside the extension |

## Develop

```bash
npm install
npm test
```

`npm run e2e` is an end-to-end check on YouTube. It opens Playwright's Chromium (in a visible
window) with the extension loaded and a fake webcam that plays MediaPipe's sample hand photos. With
the default settings (show palm, right hand) it checks that a fist before waking, a left hand, and a
fist after falling asleep are all ignored, and that the palm wakes it so a thumbs up, a fist, a swipe
and a peace sign then like, mute, skip and go full screen.

To look at the UI without loading the extension, serve the repository root
(`python3 -m http.server 8765`) and open `/dev/overlay.html`, `/dev/popup.html?frames=1` or
`/dev/onboarding.html`. `dev/chrome-stub.js` stands in for the `chrome.*` APIs.

After changing `extension/`, click the reload arrow on the extension's card in `chrome://extensions`
and reload the video tab.

## Known limits

- **Full screen** makes the browser window full screen (and turns on YouTube's theater mode), not
  the video element itself: Chrome only lets a page go full screen in answer to a real click or key.
- **Next and like on TikTok and Instagram** depend on their page structure, which changes often.
  When a "next" button isn't found, the feed is scrolled instead.
- **Videos inside iframes** (embedded players on other sites) are not controlled.
- Thresholds come from HoloTouch's measurements and a handful of photos. They need tuning on
  recordings of more people, lighting and cameras.

## License

The code in this repository is under the [MIT License](LICENSE), except the bundled MediaPipe
runtime and hand model in `extension/vendor/mediapipe/` and `extension/models/`, which are
Google's, under the Apache License 2.0: see
[`extension/vendor/mediapipe/NOTICE`](extension/vendor/mediapipe/NOTICE) and its
[`LICENSE`](extension/vendor/mediapipe/LICENSE).

The gesture design, thresholds and synthetic test hands follow
[HoloTouch](https://github.com/justanotherinternetguy/HoloTouch) by team HAASHtag (Hendry, Ariana,
Arthur and Song Han), which was published without a license.

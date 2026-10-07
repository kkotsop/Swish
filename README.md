# Swish 🏀

A personal iPhone web app (PWA) that analyses a short basketball clip and returns a Stories-style technique report. v1 covers **shooting form**; more moves plug in as "move profiles" on the same pipeline.

Pose analysis runs **on the phone** (MediaPipe Pose, WASM). No server, no per-use cost, and video never leaves the device or gets stored.

See the product spec this was built from: [`SWISH_SPEC.md`](SWISH_SPEC.md) (§ numbers below refer to it).

## Run it on your iPhone

Camera access needs **HTTPS**, so the easiest route is GitHub Pages:

1. Merge to `main`. In the repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. The *Deploy to GitHub Pages* workflow runs the tests and publishes the site (about 1 minute). Your URL is `https://<user>.github.io/Swish/`.
3. Open that URL in **Safari** on the iPhone → **Share → Add to Home Screen**. Launch Swish from the home screen icon.
4. First launch: allow the camera. (If you tapped *Don't Allow*: Settings → Apps → Safari → Camera, or delete and re-add the home-screen app.)

Run locally on a computer (camera works on `localhost`):

```bash
python3 -m http.server 8000      # then open http://localhost:8000
node tests/run.mjs               # unit tests (no dependencies)
```

## Using it

Profile → move → camera guide (animated humanoids show where to put the phone; **side** or **front** view, Skip any time) → **Upload** (first option; from Photos, then trim to ≤ 5 s) or **Record** (the camera permission is only requested after you tap Record → Open camera; 3/5/10 s countdown with beeps, 5 s clip) → quality pre-check → analysis (live preview shows the tracked player in a green box with the skeleton) → report you swipe **up/down** like Stories. The score is saved to the profile; **Progress** shows per-metric trends.

Filming tips: phone upright (portrait) at hip height about 3 m away, shooter side-on **or** facing the phone, whole body in frame, good light, nobody else in the shot. Side and front are detected automatically from the shoulders; the side view measures angles (release, set elbow, knee dip, balance, follow-through), the front view measures elbow alignment, sideways balance and off hand. Release height, tempo and off hand work from both. Clips must be **60 fps or higher** (iPhone: Settings → Camera → Record Video → 1080p HD at 60 fps, or use slow-mo 120/240 fps and upload).

## What's where

| Path | Purpose |
|---|---|
| `js/shooting.js` | Shot isolation (load → set → release → landing), auto handedness, the 8 metrics, scoring |
| `js/precheck.js` | Quality checks with specific messages; main-subject selection and the multiple-people rule |
| `js/pose.js` | MediaPipe wrapper, frame stepping, fps measurement, key-frame grabs |
| `js/capture.js` | Camera, countdown/beeps, fixed-length recording |
| `js/report.js`, `js/skeleton.js` | Stories report, skeleton overlay with shooting arm highlighted |
| `js/coaching.js` | What / why / how-to-improve copy and personalised advice (template + optional LLM) |
| `js/store.js`, `js/progress.js` | Local storage (profiles, scores only) and progress charts |
| `config/settings.json` | **Editable** reference ranges, metric weights, quality thresholds, LLM proxy URL |
| `tools/calibrate.html` | Offline reference-calibration mode (below) |
| `proxy/worker.js` | Optional Cloudflare Worker that keeps the Groq key off the phone |
| `vendor/`, `models/` | MediaPipe runtime + pose model, bundled so the app works offline |
| `tests/` | Synthetic-shooter tests for the analysis |

## Tuning

**Weights and ranges** live in `config/settings.json` and take effect on reload, with no rebuild. Bump `VERSION` in `sw.js` only if you change app code. Each range is `good: [min, max]` plus a `tolerance` (how far outside still counts as *borderline*). Metric score = 100 inside the range, 50 at the edge of the tolerance, 0 at twice that.

**Reference calibration (§6).** The shipped ranges are textbook **placeholders**. To replace them:

1. Serve the app (`python3 -m http.server 8000`) and open `http://localhost:8000/tools/calibrate.html`.
2. Select ~8 reference clips (2 clips × 4 players, side-on, ≥ 60 fps, portrait).
3. It runs the same pose + metric code, shows each clip's values and proposes ranges = observed range + buffer.
4. Paste the JSON into `moves.shooting.ranges` in `config/settings.json`.

**Personalised advice (§2).** Out of the box the advice is template sentences with your numbers (works offline). To use a small LLM instead, deploy `proxy/worker.js` (instructions at the top of the file; the Groq key is a Worker secret, never in client code) and set `llm.proxyUrl`. Only metric numbers are sent. If the proxy fails, the app silently falls back to templates.

## Metrics (shooting, equal weight by default)

**Side view:** Release angle (0–90°, from the wrist's fastest upward move) · Forward drift · Elbow angle at set · Knee dip (deepest bend) · Release height (fingertip when the ball leaves the hand, estimated; the ball is not tracked) · Follow-through (good from 40°) · Tempo · Off hand. **Front view:** Elbow alignment · Sideways drift · Release height · Tempo · Off hand. Each has a status (good / borderline / needs work), a value, and a high/medium/low tracking-confidence dot from landmark visibility.

## Known limits and things to check on a real iPhone

- **Placeholder ranges** until you calibrate; treat early scores as relative, not absolute.
- Elbow alignment (flare) is only measured from the front, and angle-based metrics only from the side, because each is unreliable from the other view. Camera angles in between (about 45°) may be classed as either.
- Ball tracking is approximated from the wrist, as per the spec.
- Shot isolation scores the **highest** wrist peak in the clip; if you shoot several times in one clip, the best-extended one is used.
- The player is only accepted if the pose looks like a real, reasonably large person (upright body, good joint visibility, at least ~30% of the frame height). Balls, hoops and tiny far-away figures are ignored; if nobody qualifies you get a specific message.
- Frame rate is measured by playing the clip (needs Safari 15.4+); if it can't be measured the check is skipped. Variable-frame-rate slow-mo clips can report odd numbers; if a valid clip is rejected, re-export it at a fixed rate.
- Recorded clips use the camera's reported frame rate. Most iPhones give 60 fps in Safari when asked; if yours reports 30 you'll get a clear message.
- Analysis steps through the clip by seeking and runs the pose model per frame at `analysisFps` (default 30; set 60 in `config/settings.json` for finer timing at roughly twice the processing time). The next frame is decoded while the current one is processed, and the model is preloaded at app start. The screen shows frame count and time remaining.
- Saved data lives in the browser's local storage on that phone/profile. Clearing Safari data or removing the app erases history (cloud sync is the spec's phase 2).

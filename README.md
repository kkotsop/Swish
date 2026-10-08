# Swish 🏀

A personal iPhone web app (PWA) that analyses a short basketball clip and returns a Stories-style technique report. v1 covers **shooting form**; more moves plug in as "move profiles" on the same pipeline.

Pose analysis runs **on the phone** (MediaPipe Pose, WASM). No server, no per-use cost, and video never leaves the device or gets stored.

See the product spec this was built from: [`SWISH_SPEC.md`](SWISH_SPEC.md) (§ numbers below refer to it).

## Run it on your iPhone

Works best on iOS 17.2 or newer (Safari); older versions still work but lose some animation and colour details. Installing to the home screen and offline use need **HTTPS**, so the easiest route is GitHub Pages:

1. Merge to `main`. In the repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. The *Deploy to GitHub Pages* workflow runs the tests and publishes the site (about 1 minute). Your URL is `https://<user>.github.io/Swish/`.
3. Open that URL in **Safari** on the iPhone → **Share → Add to Home Screen**. Launch Swish from the home screen icon.
4. Choosing a video asks for access to your Photos (or the camera, if you pick Take Video) only when you tap the button.

**Updating.** App code is fetched network-first (the offline copy is used only when the network fails), so a new deploy shows on the next launch. A new version only takes over once every app file has downloaded; if the code still fails to start, Swish shows a Reload button instead of an empty screen. The pose model and runtime are kept across updates in their own cache. If the old look sticks, close the app fully and open it again. The deploy workflow copies an explicit list of folders (`.github/workflows/pages.yml`); a new top-level folder must be added there or it will be missing from the live site.

Run locally on a computer:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
node tests/run.mjs               # unit tests (no dependencies)
```

## Using it

One player profile (name and optional photo, saved once) → a swipeable carousel of moves (only **Shooting form** is live; Jab step, Layups and Crossover are greyed out as coming soon) → one **film** screen: one animated player loops between the **side** and **front** views (each labelled) to show where to put the phone, three quick checks, then **Choose a video**. On iPhone that button offers Take Video, Photo Library and Choose File, so recording is covered too; longer clips are trimmed to ≤ 5 s. The clip's first frame stays on screen with one progress bar that carries on from reading the video into the analysis (live preview shows the tracked player in a green box with the skeleton) → a report you swipe **up/down** like Stories: the score, then every metric as a card grouped by category (**Shot mechanics**, **Legs & balance**, **Timing**) (picture cropped to the player, your number against its target zone, how to improve, why it matters), each fitting on one screen. The last page summarises the session (overall, strongest, work on, change since last time). Each score is saved to the profile; **Progress** (top bar, next to your profile circle) shows per-metric trends and has a **Clear all entries** button (two taps, no undo). Tap your profile circle on the home screen to change your name or photo.

**Levels, weekly streak, celebrations.** On home your level sits next to your name with the streak as a plain number (flame icon), and a strip of videos per week for the last 8 weeks sits below; tap the level for a timeline of all levels (done, you are here, ahead). Levels: Noobie 1 · Rookie 2 · Hooper 4 · Baller 7 · Shooter 11 · All-Star 17 · Elite 26 videos, where at most 3 videos a week count (regular practice beats one big upload); at one session a week Elite takes about 6 months. A week (Monday to Sunday) counts when it has at least one analysed video; every 4 weeks in a row earns a rest week (hold up to 2, shown as moons on the strip) that is used automatically on a missed week. Your 1st video, 5th video and each level-up get a full-screen celebration; the last report page shows your level at the top right. Level and streak are worked out (`js/journey.js`) from a separate practice log, so **Clear all entries** on Progress wipes the scores and charts but keeps your level and streak. There are no reminders or notifications.

Filming tips: shooter side-on **or** facing the phone, whole body in frame, good light, nobody else in the shot. Phone held upright (portrait) and about 3 m away is ideal, but landscape and filming from further back (even from the stands) are accepted: if the player is small in the frame, Swish zooms in on them before running the pose model. Side and front are detected automatically from the shoulders; the side view measures angles (release, set elbow, knee dip, balance, follow-through), the front view measures elbow alignment, sideways balance and off hand. Release height, tempo and off hand work from both. 60 fps or higher is best (iPhone: Settings → Camera → Record Video → 1080p HD at 60 fps, or use slow-mo 120/240 fps and upload), but Swish is forgiving: slower, darker, smaller, landscape or crowded clips are still analysed, with a note and lower confidence on the numbers.

## What's where

| Path | Purpose |
|---|---|
| `js/app.js` | Screens and navigation: profile, home carousel, film (looping guide + video picker), trim, analysis, error, report, progress |
| `js/ui.js` | DOM helpers, screen mounting (focus management), toast, top bar, avatar |
| `js/guide.js` | Animated player in kit inside a phone screen, side or front view (SVG + SMIL) |
| `styles.css` | All styling and design tokens; see [`DESIGN.md`](DESIGN.md) |
| `sw.js` | Service worker: offline shell, network-first app code, cached images and model |
| `js/shooting.js` | Shot isolation (load → set → release → landing), auto handedness, the 8 metrics, scoring |
| `js/precheck.js` | Quality checks with specific messages; main-subject selection and the multiple-people rule |
| `js/pose.js` | MediaPipe wrapper, frame stepping, fps measurement, key-frame grabs |
| `js/report.js`, `js/skeleton.js` | Stories report (score meter, target-zone bars, player-centred crops, scroll cascade), skeleton overlay with shooting arm highlighted |
| `js/motion.js` | Spring physics: press feedback on every control |
| `js/icons.js`, `js/tokens.js` | One icon set and the matte basketball; design tokens read from `styles.css` for canvas and SVG |
| `swish-icons/` | App icons, plus `court.jpg` (backdrop, sharp on home) and `court-soft.jpg` (pre-blurred copy for every other screen) |
| `PRODUCT.md`, `DESIGN.md` | Product context and the design system, for anyone (or any agent) changing the UI |
| `js/coaching.js` | What / why / how-to-improve copy and personalised advice (template + optional LLM) |
| `js/journey.js`, `js/celebrate.js` | Level, weekly streak, rest weeks and milestones from the saved sessions (pure, tested); the full-screen celebration |
| `js/store.js`, `js/progress.js` | Local storage (profiles, scores only) and progress charts |
| `config/settings.json` | **Editable** reference ranges, metric weights, quality thresholds, LLM proxy URL |
| `tools/calibrate.html` | Offline reference-calibration mode (below) |
| `proxy/worker.js` | Optional Cloudflare Worker that keeps the Groq key off the phone |
| `vendor/`, `models/` | MediaPipe runtime + pose model, bundled so the app works offline |
| `tests/` | Synthetic-shooter tests for the analysis |

## Tuning

**Weights and ranges** live in `config/settings.json` and take effect on reload, with no rebuild. Bump `VERSION` in `sw.js` when you add, rename or remove app files, so the offline copy is rebuilt. Each range is `good: [min, max]` plus a `tolerance` (how far outside still counts as *borderline*). Metric score = 100 inside the range, 50 at the edge of the tolerance, 0 at twice that.

**Reference calibration (§6).** The shipped ranges are textbook **placeholders**. To replace them:

1. Serve the app (`python3 -m http.server 8000`) and open `http://localhost:8000/tools/calibrate.html`.
2. Select ~8 reference clips (2 clips × 4 players, side-on, ≥ 60 fps).
3. It runs the same pose + metric code, shows each clip's values and proposes ranges = observed range + buffer.
4. Paste the JSON into `moves.shooting.ranges` in `config/settings.json`.

**Personalised advice (§2).** Out of the box the advice is template sentences with your numbers (works offline). To use a small LLM instead, deploy `proxy/worker.js` (instructions at the top of the file; the Groq key is a Worker secret, never in client code) and set `llm.proxyUrl`. Only metric numbers are sent. The proxy only answers your own site (`ALLOWED` at the top of the file: `https://kkotsop.github.io` and `http://localhost:8000`; add any other address you host Swish on) and passes only the expected metric fields to the model. If the proxy fails, the app silently falls back to templates.

## Metrics (shooting, equal weight by default)

**Side view:** Release angle (0–90°, the direction the wrist travels over the last 0.15 s of the push, up to the moment the arm straightens and the ball leaves) · Forward drift · Elbow angle at set · Knee dip (deepest bend) · Release height (fingertip when the ball leaves the hand, estimated; the ball is not tracked) · Follow-through (how far the fingers snap down in the 0.4 s after the release; good from 40°) · Tempo (load to release; anything quick counts as good, only a slow shot is flagged) · Leg-to-arm timing (gap between the legs finishing their push and the arm finishing its extension) · Off hand. **Front view:** Elbow alignment · Sideways drift · Release height · Tempo · Leg-to-arm timing · Stance width (how far apart the feet are: in shoulder widths from the front, estimated from depth in shin lengths from the side, where it always shows low confidence; too close is penalised harder than too wide) · Off hand. Each has a status (good / borderline / needs improvement), a value, and high/medium/low tracking confidence from landmark visibility (shown as signal bars). The overall score is labelled Good from 70, Borderline from 50, Needs improvement below that; the same cut-offs drive the score meter.

## Known limits and things to check on a real iPhone

- **Placeholder ranges** until you calibrate; treat early scores as relative, not absolute.
- Elbow alignment (flare) is only measured from the front, and angle-based metrics only from the side, because each is unreliable from the other view. Camera angles in between (about 45°) may be classed as either.
- Ball tracking is approximated from the wrist, as per the spec.
- Shot isolation scores the **highest** wrist peak in the clip; if you shoot several times in one clip, the best-extended one is used.
- Swish only refuses a clip when it cannot find a person at all (or not even a rough shot). Dark, small, landscape, low-frame-rate or crowded clips are analysed anyway: a note appears on the score slide and every metric's tracking confidence drops one step. When the shot itself is doubtful, all metrics show low confidence. Balls, hoops and tiny figures are still ignored when picking the player.
- Frame rate is measured by playing the clip off-screen (needs Safari 15.4+); if it can't be measured the check is skipped. Only clips under about 10 fps are refused. iPhone Safari may not decode a clip until it is played, so Swish nudges it with a silent play/pause and gives up with a clear message after 20 s. While a picked clip is read and analysed, its first frame stays on screen so the hand-over between screens does not flash. Variable-frame-rate slow-mo clips can report odd numbers; if a valid clip is rejected, re-export it at a fixed rate.
- Analysis plays the clip and analyses frames as they appear, slowing the video down automatically so the model keeps up (seeking frame by frame is very slow on iPhone, so it is only a fallback). Frames are analysed at `analysisFps` (default 30; set 60 in `config/settings.json` for finer timing at roughly twice the processing time). Key-frame pictures and the replay are captured during that same pass, so the report never has to seek the video again. The model (about 19 MB) is preloaded once you are on the film screen or pick a video, not at app start, so it does not slow down launching; the very first analysis on mobile data waits for that download. The screen shows frame count and time remaining.
- The report's key frames are grabbed at up to 960 px and cropped to the player. The looping replay reuses the frames the pose model saw (about 290×512 for a portrait clip), so it is softer than the key frames.
- The look uses frosted glass over the court photo. Only the home cards blur live (`backdrop-filter`); every other screen sits on a pre-blurred copy of the photo, which is much cheaper on an iPhone. Surfaces go solid with **Increase Contrast** (Settings → Accessibility → Display & Text Size); browsers that support the reduced-transparency setting also get solid surfaces (iPhone Safari currently does not). With Reduce Motion, springs, the scroll cascade and pop-ins become simple fades and presses react without a bounce.
- Saved data lives in the browser's local storage on that phone/profile. Clearing Safari data or removing the app erases history (cloud sync is the spec's phase 2).

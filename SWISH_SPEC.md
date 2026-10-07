# Swish — Product & Technical Spec (v1)

A personal iPhone web app (PWA) that analyses short basketball clips and returns a concise, Stories-style technique report. Starting with **shooting form**; other moves are added later as new "move profiles" on the same pipeline.

> **Builder note:** the product owner does not write code. Everything is built and iterated by AI. Prefer simple, readable code, a small dependency set, and clear instructions for running and testing on an iPhone.

---

## 1. Goals and non-goals

**Goals**
- Record or upload a short clip, get an instant, visual technique report on the phone.
- Fully on-device pose analysis: no server, no per-use cost, video never leaves the phone.
- Teach, not just score: every metric explains what it is, why it matters, and how to improve.
- Track improvement over time, per move.

**Non-goals (v1)**
- Native iOS app, App Store release.
- Accounts, login, cloud sync (planned for phase 2).
- Export/share, person-vs-person comparison, session archiving, deleting sessions, side-by-side clip comparison, notifications/reminders.
- Ball tracking (approximate from wrist position in v1; optional detector in a later phase).

---

## 2. Platform and architecture

- **Web app installed to the iPhone home screen** (PWA). App name: **Swish**. Home-screen icon: a cartoon basketball dropping through a red hoop and net on a light grey (#E5E5E5) background. Icon files are supplied in `swish-icons/` (`apple-touch-icon.png` 180×180, `icon-192.png`, `icon-512.png`, `icon-1024.png`); reference them in the web app manifest and as the iOS apple-touch-icon. Icons are square, opaque, with no baked-in rounded corners (iOS applies its own mask).
- **Pose estimation:** MediaPipe Pose (browser/WASM build), running on-device.
- **No backend in v1.** All profiles, scores and reference ranges stored locally on the phone (IndexedDB/localStorage). Videos are processed then deleted; they are never stored.
- **Personalised advice text:** small open model (e.g. Llama via Groq) called with the metric numbers only (no video). The API key must not be hard-coded in client code; use a tiny proxy or clearly document the tradeoff. **Fallback:** template sentences with the numbers plugged in, so the app works without the LLM.
- Expect ~5–15 s to process a 5 s clip on a recent iPhone; show a progress state.
- Target: Safari on iPhone. Note iOS quirks (variable-frame-rate slo-mo clips, camera permission behaviour in PWAs) and test early.

---

## 3. User flow

1. **Choose profile** (name + optional photo; local only, no login).
2. **Choose move** (v1: Shooting form).
3. **Camera placement guide** — short looping animation showing where to stand and where to put the phone, plus which phone orientation to use. Shown every time, with a **Skip** button.
4. **Capture** — either:
   - **Record:** tap Record → countdown (3 / 5 / 10 s, selectable) → records ~5 s → stops automatically.
   - **Upload:** pick a video from the photo library → validate → trim to a 5 s window with a scrubber.
5. **Quality pre-check** (before heavy processing) — see §5.
6. **Analysis** — pose estimation, isolate the relevant movement, compute metrics.
7. **Report** — Stories-style swipeable report (§7).
8. **Save score** to the profile's history for that move (video discarded).
9. **Retry** — from any error screen, user can go straight back to record/trim.
10. **Progress view** — per-move trend (§8).

---

## 4. Capture details

**Record**
- Countdown with a large on-screen number.
- **Audio cues:** a beep every second during the countdown, a distinct beep when recording starts, a beep when recording stops. Recording stops automatically after the fixed window.
- Prefer a fixed 60 fps capture mode (avoid variable-frame-rate slo-mo on iOS).

**Upload**
- Read metadata (frame rate, duration, resolution).
- If below 60 fps: block with a specific message (e.g. "This clip is 30 fps. Please use a clip recorded at 60 fps or higher.").
- Trim screen: scrubber with two handles to choose the 5 s window.

**Orientation (per move)**
- Each move profile declares its required orientation: **shooting = portrait**, **jab = landscape** (others decided per move).
- The placement guide shows the correct orientation (rotating phone icon).
- Detect current device orientation; if wrong, prompt: "Please rotate your phone to portrait for this move."

**Permissions**
- Explicitly request camera (and microphone only if needed) and photo-library access with clear, friendly explanations. Test the permission flow early on a real iPhone.

---

## 5. Quality pre-check (runs before analysis)

Each failure has its **own specific, actionable message** — never a generic "bad quality" error.

| Check | Example message |
|---|---|
| Frame rate < 60 fps | "This clip is 30 fps; we need 60 fps or higher for accurate tracking." |
| No person tracked clearly in most frames | "We couldn't get a clear view of you. Make sure you're fully in frame and well lit." |
| Too dark | "This clip is too dark to analyse. Try recording with more light." |
| Wrong orientation | "Please rotate your phone to portrait for this move." |
| Ambiguous multiple people | "We detected more than one person. Make sure you're alone in the shot." |

**Multiple-people rule (phase 1):** ignore small or peripheral people (e.g. someone in the background or at the edge). Only raise the warning if a second person is also large and central, so it's genuinely unclear who the subject is. The main subject = largest, most central, most consistently tracked figure.

---

## 6. Analysis

**Isolate the movement.** Don't assume the whole clip is the move. Detect the actual shooting motion (load → set point → release → landing) within the clip, ignoring catching, hesitation or dead time. This is the trickiest part of the pipeline; give it real attention. Later moves (jab, pump fake) need their own phase detectors.

**Handedness (auto-detected per clip).** Build handedness-aware from the start (left- and right-handed shooters, and other players will use it too). Do **not** store a fixed dominant hand on the profile, because some players shoot with either hand. Instead, detect the shooting hand in each clip (e.g. the wrist that rises above the shoulder and releases the ball, with the other hand as the guide hand) and mirror the metric logic accordingly. Store the detected hand with each session, and show it in the report (§7). If detection is ambiguous (low confidence), say so on the report rather than guessing silently.

**Camera angle.** Shooting analysis assumes a **side-on** view.

### Shooting-form metrics (8, equal weight)

Each metric is independently scored with a status (good / borderline / needs work), a value, and a confidence level.

1. **Release angle** — direction of ball travel at release, from wrist velocity over the last few frames before release. Good ≈ 45–55° upward (initial placeholder; replace with reference-derived ranges). *Priority issue for the owner: pushes the ball forward instead of up.*
2. **Forward drift / balance** — horizontal displacement of hips/torso from takeoff to landing, relative to leg/shin length; also landing timing relative to release (jumping forward while the ball is still in the hand is worse). *Priority issue for the owner: jumps forward and lands out of balance.*
3. **Elbow angle at set point** — at the highest held-ball moment; roughly 80–100° (placeholder).
4. **Knee dip depth** — knee flexion on the load before the jump.
5. **Elbow alignment** — elbow stays roughly under the wrist through the motion rather than flaring out or drifting ahead of the shoulder.
6. **Release height** — where the ball leaves the hand relative to the player's height.
7. **Follow-through** — wrist angle just after release (snapped down, fingers pointing toward the floor).
8. **Shot tempo** — time from catch/load to release.

**Scoring**
- Headline score = equal-weighted combination of the 8 metrics.
- Weights must be **configurable** (config file/setting), so they can be changed later without a rebuild.

**Confidence indicator**
- Each metric gets a subtle high / medium / low tracking-confidence marker (e.g. a small dot or tiny label in a corner of the card), based on pose-landmark visibility/confidence in the relevant frames. Must not clutter the design.

### Thresholds from reference clips
- Do not rely on generic textbook numbers alone. Ship an **offline reference-calibration script/mode** that runs the same pose + metrics code on reference clips and writes the resulting ranges to an editable settings file.
- Reference set per move: **2 clips from each of 4 different players = ~8 clips**, mixing styles/sessions, clean side-on, ≥60 fps.
- Good range = observed range **plus a buffer** (small samples shouldn't make thresholds overly strict).
- Ranges live in a small editable config so they can be tuned after real-world testing.

---

## 7. Report (Instagram Stories / Reels style)

Audience includes teenagers, so the look must be modern, bold and social-media-native.

- Full-screen, swipeable slides, **dark background**, bold chunky type, big numbers, smooth transitions, optional light haptics on good scores.
- **Slide 1 — Scorecard:** big headline score + chips for **all 8 metrics** (good ones green, needs-work ones in a punchy accent colour), each with value and status. Clearly show which hand was detected as the shooting hand (e.g. a "Right hand" / "Left hand" badge). On the skeleton key-frame slides, highlight the shooting arm and hand so it's visible on the image.
- **Following slides — one per flagged issue:** large key frame with the **skeleton overlay** drawn at the exact moment of the problem, a short bold caption naming the issue and the fix.
- Concise by default; no wall of text.
- **Every metric (good or bad) has a card with four parts:**
  1. **Name**
  2. **What it measures** (plain language)
  3. **Why it matters** (consequence if off)
  4. **How to improve** — personalised to the user's actual number (e.g. "Your release angle is 28°; aim for 45–55°. Drive up through your legs and release at the top of the jump instead of pushing with your arm.")
- Subtle confidence marker on each metric (§6).

---

## 8. Data, profiles and progress

- **Profiles:** local only — name + optional photo. No sign-up or login in v1.
- **Stored per session:** timestamp, move, profile, shooting hand detected, headline score, per-metric scores/values. **Video is never stored.**
- **Progress view:** per move, per profile — line per metric over time plus an overall score trend, so the user can see if they're improving or regressing. Moves are tracked separately (shooting form never mixes with layups, etc.).
- **Phase 2 (later):** Google sign-in with cloud sync (e.g. Firebase or Google Drive) so history works across devices.

---

## 9. Move roadmap

1. **Shooting form** (v1; side-on, portrait).
2. Both layups (overhand, underhand).
3. Jab (landscape), then jab-and-reverse between legs and the Iverson fake (ball detection helps here).

Each move = a **profile** defining: required orientation, phase detection, metric definitions, reference ranges, and coaching copy. The pipeline, report and progress screens are shared.

---

## 10. Suggested build order

1. App shell: PWA install, profile screen, move picker, placeholder icon/name.
2. Camera permissions + record with countdown and beeps; upload with fps check and trim.
3. MediaPipe in the browser on a clip + skeleton overlay drawing.
4. Quality pre-checks with specific messages.
5. Shot isolation + the 8 shooting metrics (iterate on real clips).
6. Reference-calibration script and config for ranges and weights.
7. Stories-style report with scorecard, issue slides, confidence markers.
8. Personalised advice (template first, then small LLM via Groq).
9. Local history + per-move progress view.
10. Polish: camera-placement animation, orientation prompts, transitions, haptics.

---

## 11. Open questions / deferred

- Exact reference ranges (to come from the reference clips).
- Where to host the tiny LLM proxy (or whether to start template-only).
- Phase 2: Google sign-in and cloud sync.

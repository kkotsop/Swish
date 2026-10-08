# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Plain static JS PWA (no framework, no build step), deployed on GitHub Pages, works offline on iPhone Safari. Confirmed by the user as fixed.

## Users
The owner and their circle (friends and teammates). They use it on an iPhone at the court or gym, mostly one-handed, in bright or dim light, often right after taking shots.

## Product Purpose
Swish analyses a short basketball clip on-device (MediaPipe Pose, WASM) and returns a Stories-style technique report. v1 covers shooting form; more moves plug in as move profiles. Success: a player films a shot, understands what to fix, and sees their score improve over time.

## Positioning
Pose analysis runs entirely on the phone: no server, no per-use cost, video never leaves the device or is stored. Every metric teaches (what it is, why it matters, how to fix it) rather than only scoring.

## Operating Context
Record (countdown with beeps, 5 s clip) or upload from Photos (trim to 5 s), a forgiving quality check (notes and lower confidence rather than rejections), on-device analysis with live tracking preview, then a vertical swipe report. Scores are saved per profile in local storage; Progress shows per-metric trends. 60 fps or higher is best but not required.

## Capabilities and Constraints
- Flow: one profile (saved once), a moves carousel (only shooting form is live; jab step, layups and crossover are shown as coming soon), one film screen (placement guide with side/front toggle, then upload or record), trim, pre-check, analysis, a Stories-style report, progress.
- The user prefers simple screens, short copy and visible checks over sentences.
- Metrics, thresholds and scoring logic live in config/settings.json and js/shooting.js; analysis behaviour is not part of the visual redesign.
- Status vocabulary: Good, Borderline, Needs improvement (overall score: Good from 70, Borderline from 50); confidence high/medium/low.
- Reference ranges are placeholders until calibrated.

## Brand Commitments
- Name: Swish.
- Home-screen icon stays: cartoon basketball dropping through a red hoop and net on light grey (#E5E5E5), files in swish-icons/.
- The user dislikes the current look and wants something modern, in the language of 2026 social media rather than dated.

## Evidence on Hand
Real app code, the icon set in swish-icons/, SWISH_SPEC.md, and synthetic-shooter tests. No real player footage, testimonials or benchmarks are on hand; none may be fabricated.

## Product Principles
1. Teach, don't just score.
2. Private by default: nothing leaves the phone.
3. Specific, actionable feedback over generic messages.
4. Fast to the report: minimal steps between a shot and the answer.

## Accessibility & Inclusion
Must hold up one-handed outdoors on a phone: legible in bright light, adequate touch targets, zoom not blocked, reduced-motion respected, status never conveyed by colour alone.

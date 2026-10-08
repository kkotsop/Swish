# Swish design system

How the app looks and moves, so changes stay consistent. Tokens live in `styles.css` (`:root`); canvas and SVG read them through `js/tokens.js`.

## Look

- **Backdrop:** a pastel court photo (`swish-icons/court.jpg`) behind every screen. It is sharp on home; every other screen shows a pre-blurred copy (`court-soft.jpg`) under a dark scrim, so text stays readable and nothing blurs at runtime.
- **Surfaces:** frosted glass. Translucent dark tints (`--s1`, `--s2`, `--s3`) with a lit top edge and a hairline. Only the home cards, home top-bar buttons and the details sheet use live `backdrop-filter`. Increase Contrast makes surfaces solid on iPhone.
- **Unavailable things** are greyed glass (grayscale backdrop, faint text, a "Coming soon" pill), never hidden.

## Colour

| Token | Value | Use |
|---|---|---|
| `--blue` (court teal) | `#0f7a96` | Primary buttons, progress bars, selection. White text on it passes AA. |
| `--pink` (court pink) | `#f2a3bf` | Accents: upload tile, check marks, the overall progress chart |
| `--good` / `--warn` / `--bad` | `#7bf0a8` / `#ffd84a` / `#ff7b66` | Status only: labels, chip dots, meter segments, deltas |
| `--hot` | `#ff4fa3` | The shooting arm in skeleton overlays |
| `--text` / `--text-2` | `#f6f6f9` / `#d0d3df` | Primary and secondary text |

Rules: status colour always comes with an icon and a word (Good, Borderline, Needs improvement). No coloured full-screen fields, no gradient text, no side-stripe borders.

## Type

Apple system font (SF Pro). Sizes: 13, 15, 17, 22, 28, 40, plus 72 (progress) and 96 (score). Large type is tracked tighter (down to -0.04em), small type slightly looser (+0.01em). Numbers use tabular figures.

## Shape and spacing

Radii `--r-sm` 14, `--r-md` 20, `--r-lg` 28, plus pills. Spacing `--gap-1`…`--gap-5` (4, 8, 12, 16, 24). Touch targets at least 44 px; buttons are 48 px pills.

## Motion

- **Press:** every control sinks to 95% on touch and springs back with a small bounce (`initPress` in `js/motion.js`).
- **Springs** (`spring()`) use Apple's response/damping model; the details sheet follows the finger, rubber-bands at the top and flicks away using projected momentum.
- **Report:** slides cascade as you scroll (lower elements trail), media and meter markers pop in with a sampled spring curve, the score counts up.
- **Reduced motion:** the scroll cascade, pop-ins and the sheet spring become short fades, presses scale without a bounce, the score shows its final value at once and the guide animation stops on its release frame. The carousel's gentle size change follows your finger, so it stays.

## Components

Glass card (`.panel`, `.chip`, `.fact`), pill button (`.btn`, `.btn.alt`, `.btn.ghost`), segmented toggle (`.seg`), status label (`.flag`), score meter and target-zone bar (`.meter`, `.meter.zones`), check pills (`.tips`), moves carousel (`.carousel`, `.move`), bottom sheet (`.sheet`), Stories report (`.stories`, `.slide`, `.bars`).

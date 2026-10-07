// Camera-placement guide: an animated humanoid shooting inside a phone screen, seen from the side or the front.
// Pure SVG with SMIL animation.

import { reducedMotion } from './tokens.js';

// Player kit: skin, a blue jersey, dark shorts, white sneakers, a pink shooting-arm sleeve.
const SKIN = '#d9a07a', SKIN_DIM = '#b98562', JERSEY = '#f6f6f9', SHORTS = '#1b2233', TRIM = '#1f9bbd', BAND = '#f2a3bf', SHOE = '#f6f6f9', SOLE = '#8e94ad', HAIR = '#2a1a12', JOINT = '#22242e', ARM = '#ff4fa3', BALL = '#d2691e', BALL_LINE = '#3a1c08';
const DUR = '3.6s';
// Key times of the shot: stand, stand, dip, set, jump/release, follow-through, landing, stand.
const KT = '0;.12;.35;.5;.6;.7;.85;1';

const rot = (vals) => `<animateTransform attributeName="transform" type="rotate" values="${vals.map((a) => `${a} 0 0`).join(';')}" keyTimes="${KT}" dur="${DUR}" repeatCount="indefinite"/>`;
const move = (ys) => `<animateTransform attributeName="transform" type="translate" values="${ys.map((y) => `0 ${y}`).join(';')}" keyTimes="${KT}" dur="${DUR}" repeatCount="indefinite"/>`;
const fade = (vals) => `<animate attributeName="opacity" values="${vals.join(';')}" keyTimes="${KT}" dur="${DUR}" repeatCount="indefinite"/>`;

/** A limb segment hanging down from its joint at (0,0); `child` is drawn at the far end. */
const seg = (len, w, fill, anim, child = '') =>
  `<g>${anim}<rect x="${-w / 2}" y="${-w / 2}" width="${w}" height="${len + w}" rx="${w / 2}" fill="${fill}"/>${child ? `<g transform="translate(0 ${len})">${child}</g>` : ''}</g>`;

const ballInHand = (anim) => `<g>${anim}<circle cx="0" cy="8" r="7.5" fill="${BALL}" stroke="${BALL_LINE}" stroke-width="1.2"/><path d="M-7.5 8 H7.5 M0 0.5 V15.5" stroke="${BALL_LINE}" stroke-width="1" fill="none"/></g>`;
const BALL_FADE = fade([1, 1, 1, 1, 0, 0, 0, 1]);
const BODY_Y = [0, 0, 9, 0, -16, -8, 2, 0];

const sneaker = (side) => `<g transform="translate(${side ? 0 : 0} 0)"><rect x="${side ? -3 : -5}" y="-3" width="${side ? 16 : 11}" height="8" rx="3.5" fill="${SHOE}"/><rect x="${side ? -3 : -5}" y="3" width="${side ? 16 : 11}" height="2.5" rx="1.2" fill="${SOLE}"/><rect x="${side ? 4 : 0}" y="-1" width="3" height="1.6" rx=".8" fill="${TRIM}"/></g>`;
const head = (face) => `<g><circle r="8" fill="${SKIN}"/><path d="M-8 -1 A8 8 0 0 1 8 -1 L8 -3 A8 8 0 0 0 -8 -3 Z" fill="${HAIR}"/><rect x="-8.4" y="-4.6" width="16.8" height="3.4" rx="1.7" fill="${BAND}"/>${face ? '<circle cx="3.2" cy="1.2" r="1" fill="#22242e"/>' : '<circle cx="-2.6" cy="1.4" r="1" fill="#22242e"/><circle cx="2.6" cy="1.4" r="1" fill="#22242e"/>'}</g>`;

function sideHuman() {
  const leg = (fill, thigh, shin) => seg(26, 7, fill, rot(thigh), seg(26, 6.5, fill, rot(shin), sneaker(true)));
  const hand = (fill) => `<circle cx="0" cy="1" r="3.4" fill="${fill}"/>`;
  const arm = (fill, ua, fa, ball) => `<g transform="translate(0 -27)">${seg(17, 5.5, fill, rot(ua), seg(16, 5, fill, rot(fa), hand(SKIN) + (ball ? ballInHand(BALL_FADE) : '')))}</g>`;
  return `<g>${move(BODY_Y)}
    ${leg(SKIN_DIM, [0, 0, -34, -12, 2, 2, -8, 0], [0, 0, 58, 20, 0, 0, 14, 0])}
    <rect x="-7.5" y="-34" width="15" height="36" rx="6" fill="${JERSEY}"/><rect x="-7.5" y="-34" width="15" height="3" rx="1.5" fill="${TRIM}" opacity=".9"/>
    ${leg(SKIN, [0, 0, -38, -14, 0, 0, -10, 0], [0, 0, 62, 22, 0, 0, 16, 0])}
    <rect x="-8.5" y="-4" width="17" height="15" rx="4" fill="${SHORTS}"/><rect x="-8.5" y="-4" width="17" height="2" fill="${TRIM}" opacity=".85"/>
    <g transform="translate(2 -42)">${head(true)}</g>
    ${arm(SKIN_DIM, [-40, -40, -35, -45, -30, -10, -10, -40], [-90, -90, -95, -120, -60, -20, -20, -90], false)}
    ${arm(ARM, [-40, -40, -35, -60, -150, -150, -140, -40], [-95, -95, -100, -125, -8, 22, 30, -95], true)}
  </g>`;
}

function frontHuman() {
  const leg = (s) => `<g transform="translate(${s * 5} 0)">${seg(26, 7, SKIN, rot([0, 0, s * -22, s * -8, 0, 0, s * -6, 0]), seg(26, 6.5, SKIN, rot([0, 0, s * 38, s * 14, 0, 0, s * 10, 0]), sneaker(false)))}</g>`;
  const hand = `<circle cx="0" cy="1" r="3.4" fill="${SKIN}"/>`;
  const arm = (s, fill, ua, fa, ball) => `<g transform="translate(${s * 12} -27)">${seg(17, 5.5, fill, rot(ua), seg(16, 5, fill, rot(fa), hand + (ball ? ballInHand(BALL_FADE) : '')))}</g>`;
  return `<g>${move(BODY_Y)}
    ${leg(-1)}${leg(1)}
    <rect x="-12" y="-34" width="24" height="37" rx="8" fill="${JERSEY}"/><rect x="-12" y="-34" width="24" height="3" rx="1.5" fill="${TRIM}" opacity=".9"/>
    <text x="0" y="-12" text-anchor="middle" font-size="13" font-weight="800" fill="#0f7a96" font-family="-apple-system, system-ui, sans-serif">7</text>
    <rect x="-12.5" y="-3" width="25" height="15" rx="4" fill="${SHORTS}"/><rect x="-12.5" y="-3" width="25" height="2" fill="${TRIM}" opacity=".85"/>
    <g transform="translate(0 -42)">${head(false)}</g>
    ${arm(1, SKIN_DIM, [10, 10, 10, -5, -20, -10, -10, 10], [140, 140, 140, 110, 170, 40, 30, 140], false)}
    ${arm(-1, ARM, [-10, -10, -10, 20, 165, 165, 120, -10], [-140, -140, -140, 160, 8, 8, -20, -140], true)}
  </g>`;
}

function phoneScreen(view) {
  const side = view === 'side';
  const flight = side
    ? `<circle r="6" fill="${BALL}" stroke="${BALL_LINE}" stroke-width="1"><animateMotion dur="${DUR}" repeatCount="indefinite" path="M64 56 Q76 24 88 70" keyPoints="0;0;0;0;0;1;1;1" keyTimes="${KT}" calcMode="linear"/>${fade([0, 0, 0, 0, 1, 1, 0, 0])}</circle>`
    : `<circle r="6" fill="${BALL}" stroke="${BALL_LINE}" stroke-width="1"><animateMotion dur="${DUR}" repeatCount="indefinite" path="M50 52 L44 22" keyPoints="0;0;0;0;0;1;1;1" keyTimes="${KT}" calcMode="linear"/><animate attributeName="r" values="6;6;6;6;6;15;15;6" keyTimes="${KT}" dur="${DUR}" repeatCount="indefinite"/>${fade([0, 0, 0, 0, 1, 1, 0, 0])}</circle>`;
  return `<svg class="hm hm-screen" viewBox="0 0 130 214" role="img" aria-label="What the phone sees: a player shooting, filmed ${side ? 'from the side' : 'from the front'}">
    <defs><linearGradient id="hmSky${view}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f4a60"/><stop offset="1" stop-color="#1d7c99"/></linearGradient></defs>
    <rect x="3" y="3" width="124" height="208" rx="18" fill="#0d0e13" stroke="#ffffff" stroke-opacity=".85" stroke-width="3"/>
    <rect x="9" y="9" width="112" height="196" rx="12" fill="url(#hmSky${view})"/>
    <rect x="9" y="180" width="112" height="25" fill="#e7a2bd"/><rect x="9" y="180" width="112" height="2" fill="#ffffff"/>
    <rect x="46" y="11" width="38" height="5" rx="2.5" fill="#0d0e13"/>
    ${side ? '<g transform="translate(96 62)"><rect x="6" y="-14" width="3" height="40" rx="1.5" fill="#b8b8c8"/><rect x="-6" y="-14" width="14" height="22" rx="2" fill="#e9e9f2" stroke="#ff7b66" stroke-width="1.5"/><path d="M-18 8 H-2" stroke="#ff7b66" stroke-width="3" stroke-linecap="round"/></g>' : ''}
    <g transform="translate(${side ? 44 : 65} 128)">${side ? sideHuman() : frontHuman()}</g>
    ${flight}
    <path d="M22 36 v-10 h10 M108 36 v-10 h-10 M22 196 v10 h10 M108 196 v10 h-10" fill="none" stroke="#7bf0a8" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

/** Returns a DOM element with the map + phone panels for a view ('side' | 'front'). */
export function guideSvg(view = 'side') {
  const wrap = document.createElement('div');
  wrap.className = 'guide-hero';
  wrap.innerHTML = phoneScreen(view);
  if (reducedMotion()) wrap.querySelectorAll('svg').forEach((svg) => { try { svg.pauseAnimations(); svg.setCurrentTime(2.2); } catch { /* not supported */ } }); // park on the release frame
  return wrap;
}

/** Back-compat helper used by older code paths. */
export const placementSvg = (orientation) => guideSvg(orientation === 'landscape' ? 'front' : 'side');

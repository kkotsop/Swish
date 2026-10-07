// Camera-placement guide: animated humanoids show where to put the phone and what it will see.
// Two panels per view: a top-down map (where to stand / where to put the phone) and a phone screen
// showing the humanoid shooting, seen from the side or from the front. Pure SVG with SMIL animation.

const BODY = '#cfd6e6', DIM = '#8e97ad', JOINT = '#20202b', VISOR = '#ff6a1a', ARM = '#ff3d8b';
const DUR = '3.6s';
// Key times of the shot: stand, stand, dip, set, jump/release, follow-through, landing, stand.
const KT = '0;.12;.35;.5;.6;.7;.85;1';

const rot = (vals) => `<animateTransform attributeName="transform" type="rotate" values="${vals.map((a) => `${a} 0 0`).join(';')}" keyTimes="${KT}" dur="${DUR}" repeatCount="indefinite"/>`;
const move = (ys) => `<animateTransform attributeName="transform" type="translate" values="${ys.map((y) => `0 ${y}`).join(';')}" keyTimes="${KT}" dur="${DUR}" repeatCount="indefinite"/>`;
const fade = (vals) => `<animate attributeName="opacity" values="${vals.join(';')}" keyTimes="${KT}" dur="${DUR}" repeatCount="indefinite"/>`;

/** A limb segment hanging down from its joint at (0,0); `child` is drawn at the far end. */
const seg = (len, w, fill, anim, child = '') =>
  `<g>${anim}<rect x="${-w / 2}" y="${-w / 2}" width="${w}" height="${len + w}" rx="${w / 2}" fill="${fill}"/>${child ? `<g transform="translate(0 ${len})">${child}</g>` : ''}<circle r="${w * 0.62}" fill="${JOINT}"/></g>`;

const ballInHand = (anim) => `<g>${anim}<circle cx="0" cy="8" r="7.5" fill="#ff6a1a" stroke="#7a2c00" stroke-width="1.2"/><path d="M-7.5 8 H7.5 M0 0.5 V15.5" stroke="#7a2c00" stroke-width="1" fill="none"/></g>`;
const BALL_FADE = fade([1, 1, 1, 1, 0, 0, 0, 1]);
const BODY_Y = [0, 0, 9, 0, -16, -8, 2, 0];

function sideHuman() {
  const foot = `<rect x="-3" y="-2" width="15" height="6" rx="3" fill="${BODY}"/>`;
  const leg = (fill, thigh, shin) => seg(26, 7, fill, rot(thigh), seg(26, 6.5, fill, rot(shin), foot));
  const hand = (fill) => `<circle cx="0" cy="1" r="3.4" fill="${fill}"/>`;
  const arm = (fill, ua, fa, ball) => `<g transform="translate(0 -27)">${seg(17, 5.5, fill, rot(ua), seg(16, 5, fill, rot(fa), hand(fill) + (ball ? ballInHand(BALL_FADE) : '')))}</g>`;
  return `<g>${move(BODY_Y)}
    ${leg(DIM, [0, 0, -34, -12, 2, 2, -8, 0], [0, 0, 58, 20, 0, 0, 14, 0])}
    <rect x="-7" y="-33" width="14" height="35" rx="7" fill="${BODY}"/>
    <g transform="translate(2 -42)"><circle r="8" fill="${BODY}"/><rect x="0" y="-3.5" width="9" height="6" rx="3" fill="${VISOR}"/><rect x="-1" y="-13" width="2" height="6" rx="1" fill="${JOINT}"/><circle cy="-14" r="2" fill="${VISOR}"/></g>
    ${arm(DIM, [-40, -40, -35, -45, -30, -10, -10, -40], [-90, -90, -95, -120, -60, -20, -20, -90], false)}
    ${leg(BODY, [0, 0, -38, -14, 0, 0, -10, 0], [0, 0, 62, 22, 0, 0, 16, 0])}
    ${arm(ARM, [-40, -40, -35, -60, -150, -150, -140, -40], [-95, -95, -100, -125, -8, 22, 30, -95], true)}
  </g>`;
}

function frontHuman() {
  const foot = `<rect x="-5" y="-2" width="10" height="5" rx="2.5" fill="${BODY}"/>`;
  const leg = (s) => `<g transform="translate(${s * 5} 0)">${seg(26, 7, BODY, rot([0, 0, s * -22, s * -8, 0, 0, s * -6, 0]), seg(26, 6.5, BODY, rot([0, 0, s * 38, s * 14, 0, 0, s * 10, 0]), foot))}</g>`;
  const hand = (fill) => `<circle cx="0" cy="1" r="3.4" fill="${fill}"/>`;
  const arm = (s, fill, ua, fa, ball) => `<g transform="translate(${s * 12} -27)">${seg(17, 5.5, fill, rot(ua), seg(16, 5, fill, rot(fa), hand(fill) + (ball ? ballInHand(BALL_FADE) : '')))}</g>`;
  return `<g>${move(BODY_Y)}
    ${leg(-1)}${leg(1)}
    <rect x="-11" y="-33" width="22" height="35" rx="9" fill="${BODY}"/>
    <g transform="translate(0 -42)"><circle r="8" fill="${BODY}"/><rect x="-6" y="-3" width="12" height="6" rx="3" fill="${VISOR}"/><rect x="-1" y="-13" width="2" height="6" rx="1" fill="${JOINT}"/><circle cy="-14" r="2" fill="${VISOR}"/></g>
    ${arm(1, DIM, [10, 10, 10, -5, -20, -10, -10, 10], [140, 140, 140, 110, 170, 40, 30, 140], false)}
    ${arm(-1, ARM, [-10, -10, -10, 20, 165, 165, 120, -10], [-140, -140, -140, 160, 8, 8, -20, -140], true)}
  </g>`;
}

function phoneScreen(view) {
  const side = view === 'side';
  const flight = side
    ? `<circle r="6" fill="#ff6a1a" stroke="#7a2c00" stroke-width="1"><animateMotion dur="${DUR}" repeatCount="indefinite" path="M64 56 Q76 24 88 70" keyPoints="0;0;0;0;0;1;1;1" keyTimes="${KT}" calcMode="linear"/>${fade([0, 0, 0, 0, 1, 1, 0, 0])}</circle>`
    : `<circle r="6" fill="#ff6a1a" stroke="#7a2c00" stroke-width="1"><animateMotion dur="${DUR}" repeatCount="indefinite" path="M50 52 L44 22" keyPoints="0;0;0;0;0;1;1;1" keyTimes="${KT}" calcMode="linear"/><animate attributeName="r" values="6;6;6;6;6;15;15;6" keyTimes="${KT}" dur="${DUR}" repeatCount="indefinite"/>${fade([0, 0, 0, 0, 1, 1, 0, 0])}</circle>`;
  return `<svg class="hm hm-screen" viewBox="0 0 130 214" role="img" aria-label="What the phone sees: a player shooting, filmed ${side ? 'from the side' : 'from the front'}">
    <defs><linearGradient id="hmSky${view}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26324a"/><stop offset="1" stop-color="#3b4d6b"/></linearGradient></defs>
    <rect x="3" y="3" width="124" height="208" rx="18" fill="#101018" stroke="#ffffff" stroke-opacity=".85" stroke-width="3"/>
    <rect x="9" y="9" width="112" height="196" rx="12" fill="url(#hmSky${view})"/>
    <rect x="9" y="180" width="112" height="25" fill="#4a3a2a"/><rect x="9" y="180" width="112" height="2" fill="#6a553d"/>
    <rect x="46" y="11" width="38" height="5" rx="2.5" fill="#101018"/>
    ${side ? '<g transform="translate(96 62)"><rect x="6" y="-14" width="3" height="40" rx="1.5" fill="#b8b8c8"/><rect x="-6" y="-14" width="14" height="22" rx="2" fill="#e9e9f2" stroke="#ff5a36" stroke-width="1.5"/><path d="M-18 8 H-2" stroke="#ff5a36" stroke-width="3" stroke-linecap="round"/></g>' : ''}
    <g transform="translate(${side ? 44 : 65} 128)">${side ? sideHuman() : frontHuman()}</g>
    ${flight}
    <path d="M22 36 v-10 h10 M108 36 v-10 h-10 M22 196 v10 h10 M108 196 v10 h-10" fill="none" stroke="#2ee59d" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

function mapSvg(view) {
  const side = view === 'side';
  const player = side ? { x: 95, y: 62 } : { x: 70, y: 100 };
  const hoop = side ? { x: 208, y: 62 } : { x: 208, y: 100 };
  const phone = side ? { x: 95, y: 150 } : { x: 168, y: 52 };
  const cone = side ? 'M95 150 L80 80 L110 80 Z' : 'M168 52 L92 88 L96 112 Z';
  const lineTo = side ? { x: 95, y: 82 } : { x: 108, y: 90 };
  const label = side ? { x: 106, y: 122 } : { x: 112, y: 70 };
  return `<svg class="hm hm-map" viewBox="0 0 230 190" role="img" aria-label="Top-down map: ${side ? 'phone to the side of the player, about 3 metres away' : 'phone in front of the player, about 3 metres away, a little off the line to the basket'}">
    <rect x="1" y="1" width="228" height="188" rx="16" fill="#17171f"/>
    <text x="14" y="22" fill="#9a9aab" font-size="10" font-weight="800" letter-spacing="1">TOP VIEW</text>
    <g transform="translate(${hoop.x} ${hoop.y})"><rect x="-4" y="-18" width="6" height="36" rx="3" fill="#ff5a36"/><circle cx="-10" cy="0" r="7" fill="none" stroke="#ff5a36" stroke-width="2.5"/><text x="-12" y="34" text-anchor="end" fill="#9a9aab" font-size="9" font-weight="800">BASKET</text></g>
    <line x1="${player.x + 12}" y1="${player.y}" x2="${hoop.x - 22}" y2="${hoop.y}" stroke="#ff6a1a" stroke-width="2" stroke-dasharray="5 5"><animate attributeName="stroke-dashoffset" values="0;-20" dur="1s" repeatCount="indefinite"/></line>
    <g transform="translate(${player.x} ${player.y})"><ellipse rx="8" ry="15" fill="${BODY}"/><circle cx="6" r="6" fill="${VISOR}"/></g>
    <path d="${cone}" fill="#2ee59d" opacity=".18"/>
    <line x1="${phone.x}" y1="${phone.y + (side ? -16 : 0)}" x2="${lineTo.x}" y2="${lineTo.y}" stroke="#2ee59d" stroke-width="2" stroke-dasharray="5 5"><animate attributeName="stroke-dashoffset" values="0;-20" dur="1s" repeatCount="indefinite"/></line>
    <g transform="translate(${phone.x} ${phone.y})"><rect x="-10" y="-15" width="20" height="30" rx="5" fill="#20202b" stroke="#fff" stroke-width="2.5"/><circle cy="-9" r="2" fill="#fff"/></g>
    <text x="${label.x}" y="${label.y}" fill="#2ee59d" font-size="11" font-weight="900">~3 m</text>
    <text x="115" y="182" text-anchor="middle" fill="#9a9aab" font-size="9.5" font-weight="800">PHONE UPRIGHT (PORTRAIT)</text>
  </svg>`;
}

/** Returns a DOM element with the map + phone panels for a view ('side' | 'front'). */
export function guideSvg(view = 'side') {
  const wrap = document.createElement('div');
  wrap.className = 'guide-pair';
  wrap.innerHTML = mapSvg(view) + phoneScreen(view);
  return wrap;
}

/** Back-compat helper used by older code paths. */
export const placementSvg = (orientation) => guideSvg(orientation === 'landscape' ? 'front' : 'side');

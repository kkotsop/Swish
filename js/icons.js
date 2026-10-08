// One icon set: 24px grid, 2px round stroke, currentColor.
const P = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  dash: '<path d="M6 12h12"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/>',
  upload: '<path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14"/>',
  record: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M5 19v-8M12 19V5M19 19v-5"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  retry: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  play: '<path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor"/>',
  shoot: '<circle cx="7" cy="17" r="3"/><path d="M9.5 14.5C11 8 15 5.5 19 6.5M15.5 3.5l3.5 3-3 3.5"/>',
  jab: '<ellipse cx="8.5" cy="8" rx="2.6" ry="4.2"/><ellipse cx="15.5" cy="16" rx="2.6" ry="4.2"/>',
  layup: '<path d="M19 19c-6 0-10-4-10.5-12M4.5 10.5L8.5 6.5l4 4"/><circle cx="18" cy="6" r="2.5"/>',
  cross: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8"/>',
};
export const STATUS_ICON = { good: 'check', borderline: 'dash', 'needs-work': 'alert', unknown: 'dash' };

export function icon(name, size = 24) {
  const s = document.createElement('span');
  s.className = 'ico';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  return s;
}

/** A matte, pebbled basketball: flat leather colour, dark seams that spin, no gloss. */
export function ballSvg() {
  const w = document.createElement('span');
  w.setAttribute('aria-hidden', 'true');
  w.innerHTML = `<svg class="ball" viewBox="0 0 100 100">
    <defs>
      <pattern id="bPebble" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r=".7" fill="#000" opacity=".16"/><circle cx="3.7" cy="3.7" r=".7" fill="#000" opacity=".16"/></pattern>
      <radialGradient id="bEdge" cx="50%" cy="50%" r="50%"><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
      <clipPath id="bClip"><circle cx="50" cy="50" r="46"/></clipPath>
    </defs>
    <circle cx="50" cy="50" r="46" fill="#c4622a"/>
    <circle cx="50" cy="50" r="46" fill="url(#bPebble)"/>
    <g clip-path="url(#bClip)"><g class="seams" fill="none" stroke="#231208" stroke-width="2.4" stroke-linecap="round">
      <path d="M50 2v96M2 50h96"/><path d="M20 12c14 14 14 62 0 76"/><path d="M80 12c-14 14-14 62 0 76"/>
    </g></g>
    <circle cx="50" cy="50" r="46" fill="url(#bEdge)"/>
  </svg>`;
  return w;
}

/** Loading animation: a basketball is thrown in an arc, swishes through the net, and it repeats. */
export function throwSvg() {
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = '2.4s';
  const KT = '0;.62;.82;1';
  const motion = still ? '' : `<animateMotion dur="${DUR}" repeatCount="indefinite" path="M26 128 Q104 -46 178 74 L178 112" keyPoints="0;.7;1;1" keyTimes="${KT}" calcMode="linear"/>
      <animate attributeName="opacity" values="1;1;1;0;0" keyTimes="0;.6;.82;.93;1" dur="${DUR}" repeatCount="indefinite"/>`;
  const spin = still ? '' : `<animateTransform attributeName="transform" type="rotate" values="0;540" dur="${DUR}" repeatCount="indefinite"/>`;
  const swish = still ? '' : `<animateTransform attributeName="transform" type="scale" values="1 1;1 1;1.08 1.22;.97 .92;1 1;1 1" keyTimes="0;.6;.7;.78;.9;1" dur="${DUR}" repeatCount="indefinite"/>`;
  const w = document.createElement('span');
  w.setAttribute('aria-hidden', 'true');
  w.className = 'throw';
  w.innerHTML = `<svg viewBox="0 0 240 150" width="220" height="138">
    <ellipse cx="120" cy="143" rx="92" ry="5" fill="#000" opacity=".28"/>
    <rect x="203" y="14" width="8" height="66" rx="3" fill="#fff" opacity=".85"/>
    <rect x="199" y="30" width="4" height="48" rx="2" fill="#fff" opacity=".5"/>
    <g transform="translate(0 76)"><g>${swish}<g transform="translate(0 -76)" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".92">
      <path d="M158 77 L166 112 M170 78 L172 113 M182 78 L184 113 M194 77 L190 112 M158 77 L194 77"/>
      <path d="M161 92 L193 92 M164 104 L190 104 M158 77 L172 113 M170 77 L184 113 M182 77 L190 112 M170 77 L158 77 M182 77 L166 112 M194 77 L172 113"/>
    </g></g></g>
    <ellipse cx="176" cy="76" rx="20" ry="5.5" fill="none" stroke="#ff7b66" stroke-width="3.4"/>
    <g>${motion}<g>${spin}
      <circle r="11.5" fill="#c4622a"/>
      <g fill="none" stroke="#231208" stroke-width="1.5" stroke-linecap="round"><path d="M0 -11.5 V11.5 M-11.5 0 H11.5"/><path d="M-7 -9 C-3 -4 -3 4 -7 9 M7 -9 C3 -4 3 4 7 9"/></g>
    </g></g>
  </svg>`;
  return w;
}

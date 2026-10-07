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

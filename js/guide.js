// Looping camera-placement animation (top-down view) with a rotating phone icon.
export function placementSvg(orientation = 'portrait') {
  const land = orientation === 'landscape';
  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <svg class="guide-svg" viewBox="0 0 320 230" role="img" aria-label="Stand side-on to the basket with the phone about 3 metres away">
    <rect x="262" y="40" width="8" height="46" rx="3" fill="#ff5a36"/><circle cx="256" cy="63" r="9" fill="none" stroke="#ff5a36" stroke-width="3"/>
    <text x="238" y="102" fill="#9a9aab" font-size="11" font-weight="800">BASKET</text>
    <line class="dash" x1="160" y1="63" x2="248" y2="63" stroke="#ff6a1a" stroke-width="2"/>
    <g class="shooter"><ellipse cx="160" cy="63" rx="9" ry="22" fill="#fff"/><circle cx="168" cy="63" r="8" fill="#ffd23f"/></g>
    <circle class="ball" cx="176" cy="60" r="6" fill="#ff6a1a"/>
    <line class="dash" x1="160" y1="150" x2="160" y2="92" stroke="#2ee59d" stroke-width="2"/>
    <text x="168" y="130" fill="#2ee59d" font-size="12" font-weight="900">~3 m</text>
    <g class="${land ? 'land' : ''}" transform="translate(160 178)">
      <g class="phone-rot"><rect x="-17" y="-28" width="34" height="56" rx="7" fill="#20202b" stroke="#fff" stroke-width="3"/><circle cx="0" cy="-19" r="3" fill="#fff"/></g>
    </g>
    <text x="160" y="222" text-anchor="middle" fill="#9a9aab" font-size="12" font-weight="800">PHONE ${land ? 'LANDSCAPE' : 'PORTRAIT'}</text>
  </svg>`;
  return wrap.firstElementChild;
}

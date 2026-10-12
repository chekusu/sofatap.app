// Original vector "posters" for the fictional films in the demo's TV library.
// They are drawn for this simulation only: no real film art, no external images.
// Backgrounds come from the .poster--N gradients in styles.css.

const svg = (body) => `<svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${body}</svg>`;

export const POSTERS = [
  // 1 Northern lights over a ridge
  svg('<path d="M-5 52C30 20 60 58 95 30s55 6 70-8" fill="none" stroke="#98E9C4" stroke-width="9" opacity=".45"/><path d="M-5 60C35 34 70 64 105 42s45 0 60-10" fill="none" stroke="#7FD4E8" stroke-width="5" opacity=".5"/><circle cx="24" cy="16" r="1.2" fill="#fff"/><circle cx="70" cy="10" r="1" fill="#fff"/><circle cx="128" cy="18" r="1.3" fill="#fff"/><path d="M0 100V78l26-16 22 12 30-22 26 18 22-10 34 20v20z" fill="#0B1416"/>'),
  // 2 Harbour at dusk
  svg('<circle cx="80" cy="56" r="20" fill="#FFD39A"/><path d="M0 62h160v38H0z" fill="#3B2A4F"/><path d="M14 70h40M70 76h60M30 84h50M96 90h44" stroke="#FFB27A" stroke-width="2.5" stroke-linecap="round" opacity=".7"/><path d="M108 62l6-20 2 20zM100 62h24l-4 6h-16z" fill="#1B1426"/>'),
  // 3 Paper moon
  svg('<circle cx="98" cy="42" r="26" fill="#F3E9C6"/><circle cx="88" cy="36" r="4" fill="#E2D5A8"/><circle cx="106" cy="52" r="6" fill="#E2D5A8"/><path d="M18 74c10-8 26-8 34 0 8-6 22-6 28 2H18z" fill="#2E4470"/><circle cx="30" cy="20" r="1.2" fill="#fff"/><circle cx="140" cy="80" r="1" fill="#fff"/>'),
  // 4 Desert line
  svg('<circle cx="122" cy="30" r="12" fill="#FFF1D6"/><path d="M0 70c30-16 60-16 90-2s50 10 70 2v30H0z" fill="#E3A86B"/><path d="M0 84c40-14 70-10 100 0s44 6 60 0v16H0z" fill="#C7844F"/><path d="M20 66l4-14 4 14" fill="none" stroke="#5A3A22" stroke-width="2"/>'),
  // 5 City after rain
  svg('<path d="M8 100V44h22v56zM36 100V28h26v72zM68 100V52h20v48zM94 100V20h28v80zM128 100V48h26v52z" fill="#162130"/><g fill="#FFD27A"><rect x="13" y="52" width="4" height="4"/><rect x="21" y="64" width="4" height="4"/><rect x="42" y="36" width="4" height="4"/><rect x="50" y="56" width="4" height="4"/><rect x="100" y="30" width="4" height="4"/><rect x="110" y="48" width="4" height="4"/><rect x="134" y="58" width="4" height="4"/></g><g fill="#98E9C4"><rect x="74" y="60" width="4" height="4"/><rect x="100" y="70" width="4" height="4"/><rect x="142" y="74" width="4" height="4"/></g><path d="M0 96h160" stroke="#98E9C4" stroke-width="2" opacity=".35"/>'),
  // 6 Into the fern
  svg('<path d="M80 104C78 70 64 44 40 24" fill="none" stroke="#B9F2C9" stroke-width="2.5"/><g fill="#5FBF7F" opacity=".9"><ellipse cx="62" cy="64" rx="16" ry="5" transform="rotate(-30 62 64)"/><ellipse cx="54" cy="46" rx="14" ry="4.5" transform="rotate(-40 54 46)"/><ellipse cx="82" cy="70" rx="14" ry="4.5" transform="rotate(20 82 70)"/><ellipse cx="72" cy="52" rx="12" ry="4" transform="rotate(10 72 52)"/></g><path d="M118 104c2-24 10-42 26-56" fill="none" stroke="#7FD49B" stroke-width="2" opacity=".6"/>'),
  // 7 Lantern festival
  svg('<g fill="#FFB25C"><circle cx="30" cy="34" r="9"/><circle cx="62" cy="24" r="7"/><circle cx="96" cy="40" r="10"/><circle cx="128" cy="22" r="8"/><circle cx="114" cy="66" r="6"/><circle cx="46" cy="68" r="6"/></g><g fill="#FFE2B0" opacity=".8"><circle cx="30" cy="34" r="4"/><circle cx="96" cy="40" r="4.5"/><circle cx="128" cy="22" r="3.5"/></g><path d="M0 92h160v8H0z" fill="#2A0E14"/>'),
  // 8 Slow tide
  svg('<path d="M0 46c20-10 40-10 60 0s40 10 60 0 30-8 40-4v58H0z" fill="#3FA7A0" opacity=".7"/><path d="M0 62c20-8 40-8 60 0s40 8 60 0 30-6 40-2v40H0z" fill="#2B7F86"/><path d="M0 80c20-6 40-6 60 0s40 6 60 0 30-4 40-2v22H0z" fill="#1C5C66"/><circle cx="36" cy="22" r="8" fill="#E9FBF4" opacity=".85"/>'),
  // 9 Last train home
  svg('<path d="M0 70h160" stroke="#C9B6FF" stroke-width="1.5" opacity=".6"/><rect x="28" y="56" width="92" height="14" rx="5" fill="#1D1533"/><g fill="#FFE7A3"><rect x="36" y="60" width="8" height="5" rx="1"/><rect x="50" y="60" width="8" height="5" rx="1"/><rect x="64" y="60" width="8" height="5" rx="1"/><rect x="78" y="60" width="8" height="5" rx="1"/><rect x="92" y="60" width="8" height="5" rx="1"/></g><circle cx="118" cy="63" r="2.5" fill="#fff"/><circle cx="132" cy="20" r="10" fill="#EDE4FF" opacity=".8"/><path d="M0 76h160v24H0z" fill="#140E24"/>'),
];

export const DEMO_TILE_COUNT = POSTERS.length;

/** The library grid items; titles come from demo.film1 … demo.film9. */
export function renderDemoTiles(strings) {
  return POSTERS.map((art, i) => {
    const title = strings[`demo.film${i + 1}`];
    return `                        <li class="tile" data-hit="tile" data-index="${i}"><span class="poster poster--${i + 1}">${art}</span><span class="tile__title">${title}</span><span class="tile__badges"><i class="badge badge--list"></i><i class="badge badge--seen"></i></span></li>`;
  }).join('\n');
}

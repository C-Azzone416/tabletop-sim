"use client";

// Bulb positions/colors along the string-light wire, alternating between
// two seat hues so the blink animation reads as two interleaved circuits.
const BULBS: Array<{ x: number; y: number; color: string }> = [
  { x: 150, y: 66, color: "var(--cab-red)" },
  { x: 260, y: 76, color: "var(--cab-sun)" },
  { x: 380, y: 70, color: "var(--cab-grass)" },
  { x: 500, y: 52, color: "var(--cab-sky)" },
  { x: 610, y: 64, color: "var(--cab-red)" },
  { x: 720, y: 72, color: "var(--cab-sun)" },
  { x: 840, y: 58, color: "var(--cab-grass)" },
  { x: 950, y: 55, color: "var(--cab-sky)" },
  { x: 1070, y: 66, color: "var(--cab-red)" },
];

const MEEPLES: Array<{ x: number; y: number; gradient: string }> = [
  { x: 420, y: 500, gradient: "grs-meeple-red" },
  { x: 560, y: 510, gradient: "grs-meeple-sky" },
  { x: 650, y: 504, gradient: "grs-meeple-grass" },
  { x: 760, y: 514, gradient: "grs-meeple-sun" },
  { x: 600, y: 508, gradient: "grs-meeple-grape" },
];

export function GameRoomScene() {
  return (
    <svg
      viewBox="0 0 1200 780"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <style>{`
          @keyframes bulb-on { 0%, 45% { opacity: 1; } 50%, 95% { opacity: 0.4; } 100% { opacity: 1; } }
          @keyframes bulb-off { 0%, 45% { opacity: 0.4; } 50%, 95% { opacity: 1; } 100% { opacity: 0.4; } }
          .grs-bulb:nth-child(odd) { animation: bulb-on 2s ease-in-out infinite; }
          .grs-bulb:nth-child(even) { animation: bulb-off 2s ease-in-out infinite; }
        `}</style>

        <linearGradient id="grs-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-wall-top)" />
          <stop offset="1" stopColor="var(--scene-wall-bottom)" />
        </linearGradient>
        <linearGradient id="grs-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-floor-far)" />
          <stop offset="1" stopColor="var(--scene-floor-near)" />
        </linearGradient>
        <linearGradient id="grs-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-wood-light)" />
          <stop offset="1" stopColor="var(--scene-wood-dark)" />
        </linearGradient>
        <radialGradient id="grs-lampglow" cx="0.5" cy="0.5" r="0.9">
          <stop offset="0" stopColor="var(--scene-lamp-glow)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--scene-lamp-glow)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="grs-tabletop" cx="0.42" cy="0.32" r="0.75">
          <stop offset="0" stopColor="var(--scene-table-top-1)" />
          <stop offset="0.6" stopColor="var(--scene-table-top-2)" />
          <stop offset="1" stopColor="var(--scene-table-top-3)" />
        </radialGradient>
        <linearGradient id="grs-tableside" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-table-side-top)" />
          <stop offset="1" stopColor="var(--scene-table-side-bottom)" />
        </linearGradient>
        <filter id="grs-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="var(--scene-shadow-ink)" floodOpacity="0.35" />
        </filter>
        <filter id="grs-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>

        {/* one gradient per seat hue — a shared gradient can't be recolored
            per <use> instance, since <stop> lives outside the use's shadow
            tree and never sees a custom property set on the <use> itself */}
        <linearGradient id="grs-meeple-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-meeple-red-light)" />
          <stop offset="1" stopColor="var(--scene-meeple-red-dark)" />
        </linearGradient>
        <linearGradient id="grs-meeple-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-meeple-sky-light)" />
          <stop offset="1" stopColor="var(--scene-meeple-sky-dark)" />
        </linearGradient>
        <linearGradient id="grs-meeple-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-meeple-sun-light)" />
          <stop offset="1" stopColor="var(--scene-meeple-sun-dark)" />
        </linearGradient>
        <linearGradient id="grs-meeple-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-meeple-grass-light)" />
          <stop offset="1" stopColor="var(--scene-meeple-grass-dark)" />
        </linearGradient>
        <linearGradient id="grs-meeple-grape" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-meeple-grape-light)" />
          <stop offset="1" stopColor="var(--scene-meeple-grape-dark)" />
        </linearGradient>
        {/* body path has no fill of its own — it inherits whatever `fill` the
            <use> element sets, so one symbol serves every seat color */}
        <symbol id="grs-meeple" viewBox="-16 -30 32 60">
          <ellipse cx="0" cy="27" rx="13" ry="4" fill="var(--scene-contact-shadow)" opacity="0.22" />
          <path d="M-13,26 Q-14,6 -5,3 Q-9,-6 -9,-13 Q-9,-24 0,-24 Q9,-24 9,-13 Q9,-6 5,3 Q14,6 13,26 Q0,32 -13,26 Z" />
          <ellipse cx="-4" cy="-16" rx="3.4" ry="2.4" fill="#fff" opacity="0.55" />
        </symbol>
      </defs>

      <rect width="1200" height="780" fill="url(#grs-wall)" />

      {/* windows, soft-lit, blurred to sit behind the scene */}
      <g filter="url(#grs-blur)" opacity="0.9">
        <rect x="90" y="90" width="190" height="250" rx="14" fill="var(--scene-window-frame)" />
        <rect x="100" y="100" width="170" height="230" rx="10" fill="var(--scene-window-glow)" opacity="0.5" />
        <rect x="930" y="90" width="190" height="250" rx="14" fill="var(--scene-window-frame)" />
        <rect x="940" y="100" width="170" height="230" rx="10" fill="var(--scene-window-glow)" opacity="0.5" />
      </g>

      {/* wall / floor boundary — the room's one hard horizon line */}
      <rect y="466" width="1200" height="6" fill="var(--scene-horizon)" />
      <rect y="472" width="1200" height="308" fill="url(#grs-floor)" />
      {/* floorboards, fanning slightly toward the viewer for depth */}
      <g stroke="var(--scene-horizon)" strokeOpacity="0.3" strokeWidth="2">
        <line x1="60" y1="472" x2="-40" y2="780" />
        <line x1="260" y1="472" x2="200" y2="780" />
        <line x1="460" y1="472" x2="440" y2="780" />
        <line x1="660" y1="472" x2="680" y2="780" />
        <line x1="860" y1="472" x2="920" y2="780" />
        <line x1="1060" y1="472" x2="1160" y2="780" />
        <line x1="1240" y1="472" x2="1360" y2="780" />
      </g>

      {/* pendant lamp */}
      <line x1="600" y1="10" x2="600" y2="120" stroke="var(--scene-lamp-cord)" strokeWidth="3" />
      <path d="M540,120 Q600,175 660,120 Z" fill="var(--scene-lamp-shade)" filter="url(#grs-soft)" />
      <ellipse cx="600" cy="132" rx="32" ry="9" fill="var(--scene-lamp-shade-rim)" />
      <ellipse cx="600" cy="205" rx="150" ry="90" fill="url(#grs-lampglow)" />

      {/* string lights */}
      <path
        d="M110,58 Q320,95 520,52 Q720,90 920,48 Q1050,72 1140,56"
        stroke="var(--scene-string-wire)"
        strokeWidth="2.5"
        fill="none"
      />
      {BULBS.map((b, i) => (
        <g key={i}>
          <line x1={b.x} y1={b.y - 2} x2={b.x} y2={b.y + 5} stroke="var(--scene-string-wire)" strokeWidth="3" />
          <circle className="grs-bulb" cx={b.x} cy={b.y + 12} r="9" fill={b.color} />
        </g>
      ))}

      {/* whole table + seating cluster, pulled forward off the wall/floor seam */}
      <g transform="translate(0,48)">
        {/* back chair — behind the table, only the back shows above the tabletop */}
        <g transform="translate(520,410)" filter="url(#grs-soft)">
          <rect x="0" y="-58" width="10" height="86" rx="4" fill="url(#grs-wood)" />
          <rect x="86" y="-58" width="10" height="86" rx="4" fill="url(#grs-wood)" />
          <rect x="-3" y="-64" width="102" height="15" rx="5" fill="url(#grs-wood)" />
          <rect x="1" y="-30" width="94" height="9" rx="3" fill="url(#grs-wood)" />
        </g>

        {/* left + right chairs, feet grounded on the floor — back posts run tall, legs run long */}
        {[120, 984].map((cx) => (
          <g key={cx} transform={`translate(${cx},560)`}>
            <ellipse cx="52" cy="134" rx="74" ry="15" fill="var(--scene-contact-shadow)" opacity="0.3" />
            <g filter="url(#grs-soft)">
              <rect x="0" y="-96" width="13" height="140" rx="5" fill="url(#grs-wood)" />
              <rect x="92" y="-96" width="13" height="140" rx="5" fill="url(#grs-wood)" />
              <rect x="-3" y="-102" width="112" height="16" rx="5" fill="url(#grs-wood)" />
              <rect x="1" y="-56" width="104" height="9" rx="3" fill="url(#grs-wood)" />
              <rect x="-3" y="26" width="112" height="18" rx="6" fill="url(#grs-wood)" />
              <rect x="4" y="44" width="14" height="90" rx="4" fill="url(#grs-wood)" />
              <rect x="87" y="44" width="14" height="90" rx="4" fill="url(#grs-wood)" />
            </g>
          </g>
        ))}

        {/* table's own contact shadow, cast onto the floor */}
        <ellipse cx="600" cy="705" rx="300" ry="36" fill="var(--scene-contact-shadow)" opacity="0.32" />

        {/* table — four real tapered legs under a shallow apron, not a fused pedestal */}
        <g filter="url(#grs-soft)">
          <path d="M494,600 L484,700 L500,700 L512,604 Z" fill="url(#grs-wood)" />
          <path d="M706,604 L718,700 L734,700 L724,600 Z" fill="url(#grs-wood)" />
          <path d="M342,580 L328,688 L348,688 L364,584 Z" fill="url(#grs-wood)" />
          <path d="M856,584 L872,688 L892,688 L878,580 Z" fill="url(#grs-wood)" />
          <path d="M330,555 L330,596 Q600,626 870,596 L870,555 Z" fill="url(#grs-tableside)" />
          <ellipse cx="600" cy="555" rx="340" ry="98" fill="url(#grs-tabletop)" />
        </g>

        {/* cards */}
        <g transform="translate(470,510) rotate(-14)" filter="url(#grs-soft)">
          <rect width="46" height="64" rx="6" fill="var(--scene-card-face)" />
          <rect x="5" y="5" width="36" height="54" rx="4" fill="var(--cab-red)" opacity="0.75" />
        </g>
        <g transform="translate(500,518) rotate(8)" filter="url(#grs-soft)">
          <rect width="46" height="64" rx="6" fill="var(--scene-card-face)" />
          <rect x="5" y="5" width="36" height="54" rx="4" fill="var(--cab-sky)" opacity="0.75" />
        </g>

        {/* dice */}
        <g transform="translate(700,522) rotate(18)" filter="url(#grs-soft)">
          <rect width="28" height="28" rx="6" fill="var(--scene-card-face)" />
          <circle cx="9" cy="9" r="2.6" fill="var(--scene-die-pip)" />
          <circle cx="19" cy="19" r="2.6" fill="var(--scene-die-pip)" />
          <circle cx="14" cy="14" r="2.6" fill="var(--scene-die-pip)" />
        </g>
        <g transform="translate(735,528) rotate(-12)" filter="url(#grs-soft)">
          <rect width="28" height="28" rx="6" fill="var(--scene-die-accent-bg)" />
          <circle cx="7" cy="7" r="2.6" fill="var(--scene-die-accent-pip)" />
          <circle cx="21" cy="7" r="2.6" fill="var(--scene-die-accent-pip)" />
          <circle cx="7" cy="21" r="2.6" fill="var(--scene-die-accent-pip)" />
          <circle cx="21" cy="21" r="2.6" fill="var(--scene-die-accent-pip)" />
        </g>

        {/* meeples */}
        {MEEPLES.map((m, i) => (
          <use
            key={i}
            href="#grs-meeple"
            x={m.x}
            y={m.y}
            width="30"
            height="56"
            fill={`url(#${m.gradient})`}
            filter="url(#grs-soft)"
          />
        ))}
      </g>
    </svg>
  );
}

"use client";

export function GameRoomScene() {
  return (
    <svg
      viewBox="0 0 1200 800"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Background wall */}
      <rect width="1200" height="800" fill="#3d2b1f" />
      <rect width="1200" height="550" fill="#f5e6d0" />

      {/* Wainscoting / lower wall */}
      <rect y="400" width="1200" height="150" fill="#e8d5b8" />
      <rect y="395" width="1200" height="8" fill="#c4a882" rx="2" />

      {/* Floor */}
      <rect y="550" width="1200" height="250" fill="#8b6914" />
      {/* Floor boards */}
      {[0, 150, 300, 450, 600, 750, 900, 1050].map((x) => (
        <line
          key={x}
          x1={x}
          y1="550"
          x2={x}
          y2="800"
          stroke="#7a5c10"
          strokeWidth="2"
        />
      ))}

      {/* Left window */}
      <g>
        <rect x="80" y="100" width="200" height="260" rx="8" fill="#87ceeb" />
        <rect
          x="80"
          y="100"
          width="200"
          height="260"
          rx="8"
          fill="none"
          stroke="#c4a882"
          strokeWidth="12"
        />
        {/* Window cross */}
        <line
          x1="180"
          y1="100"
          x2="180"
          y2="360"
          stroke="#c4a882"
          strokeWidth="6"
        />
        <line
          x1="80"
          y1="230"
          x2="280"
          y2="230"
          stroke="#c4a882"
          strokeWidth="6"
        />
        {/* Soft light glow */}
        <rect
          x="86"
          y="106"
          width="88"
          height="118"
          fill="#fffbe6"
          opacity="0.3"
        />
        {/* Left curtain */}
        <path d="M60,90 Q80,90 85,100 L85,380 Q75,370 60,380 Z" fill="#b44" opacity="0.85" />
        <path d="M60,90 Q70,200 65,380" stroke="#922" strokeWidth="2" fill="none" />
        {/* Right curtain */}
        <path d="M300,90 Q280,90 275,100 L275,380 Q285,370 300,380 Z" fill="#b44" opacity="0.85" />
        <path d="M300,90 Q290,200 295,380" stroke="#922" strokeWidth="2" fill="none" />
      </g>

      {/* Right window */}
      <g>
        <rect x="920" y="100" width="200" height="260" rx="8" fill="#87ceeb" />
        <rect
          x="920"
          y="100"
          width="200"
          height="260"
          rx="8"
          fill="none"
          stroke="#c4a882"
          strokeWidth="12"
        />
        <line
          x1="1020"
          y1="100"
          x2="1020"
          y2="360"
          stroke="#c4a882"
          strokeWidth="6"
        />
        <line
          x1="920"
          y1="230"
          x2="1120"
          y2="230"
          stroke="#c4a882"
          strokeWidth="6"
        />
        <rect
          x="926"
          y="106"
          width="88"
          height="118"
          fill="#fffbe6"
          opacity="0.3"
        />
        <path d="M900,90 Q920,90 925,100 L925,380 Q915,370 900,380 Z" fill="#b44" opacity="0.85" />
        <path d="M900,90 Q910,200 905,380" stroke="#922" strokeWidth="2" fill="none" />
        <path d="M1140,90 Q1120,90 1115,100 L1115,380 Q1125,370 1140,380 Z" fill="#b44" opacity="0.85" />
        <path d="M1140,90 Q1130,200 1135,380" stroke="#922" strokeWidth="2" fill="none" />
      </g>

      {/* CSS animations for alternating string lights */}
      <defs>
        <style>{`
          @keyframes bulb-on {
            0%, 45% { opacity: 1; }
            50%, 95% { opacity: 0.4; }
            100% { opacity: 1; }
          }
          @keyframes bulb-off {
            0%, 45% { opacity: 0.4; }
            50%, 95% { opacity: 1; }
            100% { opacity: 0.4; }
          }
          .bulb-0, .bulb-2, .bulb-4, .bulb-6, .bulb-8 { animation: bulb-on 2s ease-in-out infinite; }
          .bulb-1, .bulb-3, .bulb-5, .bulb-7 { animation: bulb-off 2s ease-in-out infinite; }
        `}</style>
      </defs>

      {/* Pendant lamp — larger, hung lower */}
      <line x1="600" y1="0" x2="600" y2="120" stroke="#333" strokeWidth="3" />
      <path d="M545,120 Q600,165 655,120 Z" fill="#f4a460" />
      <ellipse cx="600" cy="130" rx="30" ry="8" fill="#e8943a" />
      {/* Light glow */}
      <ellipse cx="600" cy="170" rx="200" ry="120" fill="#fff8dc" opacity="0.12" />

      {/* String lights — bulbs on the wire path */}
      <path
        d="M100,60 Q300,90 500,55 Q700,85 900,50 Q1050,75 1150,60"
        stroke="#555"
        strokeWidth="2"
        fill="none"
        id="string-path"
      />
      {/* Bulbs — hanging from the wire. Y = computed wire position at each X */}
      {[
        { x: 150, y: 65 },
        { x: 250, y: 73 },
        { x: 370, y: 72 },
        { x: 500, y: 55 },
        { x: 610, y: 66 },
        { x: 720, y: 69 },
        { x: 840, y: 60 },
        { x: 950, y: 57 },
        { x: 1080, y: 68 },
      ].map((pos, i) => {
        const colors = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#ff6b6b"];
        return (
          <g key={i}>
            {/* Connector — always visible, solid */}
            <line x1={pos.x} y1={pos.y - 2} x2={pos.x} y2={pos.y + 5} stroke="#444" strokeWidth="3" />
            {/* Bulb — animates independently */}
            <circle className={`bulb-${i}`} cx={pos.x} cy={pos.y + 12} r="9" fill={colors[i]} />
          </g>
        );
      })}

      {/* Chairs — 3 scaled-up chairs, pushed back from table */}
      {/* Left chair */}
      <g transform="translate(140, 540)">
        {/* Back posts */}
        <rect x="0" y="-60" width="12" height="90" rx="4" fill="#6b4226" />
        <rect x="88" y="-60" width="12" height="90" rx="4" fill="#6b4226" />
        {/* Back rail */}
        <rect x="-2" y="-65" width="104" height="14" rx="4" fill="#8b5e3c" />
        {/* Mid rail */}
        <rect x="2" y="-35" width="96" height="8" rx="3" fill="#8b5e3c" />
        {/* Seat */}
        <rect x="0" y="24" width="100" height="16" rx="5" fill="#a0714a" />
        {/* Front legs */}
        <rect x="4" y="40" width="12" height="55" rx="3" fill="#6b4226" />
        <rect x="84" y="40" width="12" height="55" rx="3" fill="#6b4226" />
      </g>
      {/* Right chair */}
      <g transform="translate(960, 540)">
        <rect x="0" y="-60" width="12" height="90" rx="4" fill="#6b4226" />
        <rect x="88" y="-60" width="12" height="90" rx="4" fill="#6b4226" />
        <rect x="-2" y="-65" width="104" height="14" rx="4" fill="#8b5e3c" />
        <rect x="2" y="-35" width="96" height="8" rx="3" fill="#8b5e3c" />
        <rect x="0" y="24" width="100" height="16" rx="5" fill="#a0714a" />
        <rect x="4" y="40" width="12" height="55" rx="3" fill="#6b4226" />
        <rect x="84" y="40" width="12" height="55" rx="3" fill="#6b4226" />
      </g>
      {/* Back chair (behind table, back visible above) */}
      <g transform="translate(520, 420)">
        <rect x="0" y="-45" width="12" height="72" rx="4" fill="#6b4226" />
        <rect x="88" y="-45" width="12" height="72" rx="4" fill="#6b4226" />
        <rect x="-2" y="-50" width="104" height="14" rx="4" fill="#8b5e3c" />
        <rect x="2" y="-25" width="96" height="8" rx="3" fill="#8b5e3c" />
        <rect x="0" y="22" width="100" height="16" rx="5" fill="#a0714a" />
      </g>

      {/* Table — 4 corner legs, all matching tabletop wood tone */}
      <rect x="350" y="610" width="14" height="70" rx="3" fill="#a0522d" />
      <rect x="836" y="610" width="14" height="70" rx="3" fill="#a0522d" />
      <rect x="500" y="625" width="14" height="55" rx="3" fill="#a0522d" />
      <rect x="686" y="625" width="14" height="55" rx="3" fill="#a0522d" />
      {/* Table top */}
      <ellipse cx="600" cy="560" rx="340" ry="100" fill="#a0522d" />
      <ellipse cx="600" cy="550" rx="340" ry="100" fill="#cd853f" />
      <ellipse cx="600" cy="545" rx="320" ry="90" fill="#deb887" />

      {/* Cards on table */}
      <g transform="translate(480, 510) rotate(-15)">
        <rect width="40" height="56" rx="4" fill="white" stroke="#ddd" strokeWidth="1" />
        <rect x="4" y="4" width="32" height="48" rx="2" fill="#e74c3c" opacity="0.3" />
      </g>
      <g transform="translate(500, 515) rotate(5)">
        <rect width="40" height="56" rx="4" fill="white" stroke="#ddd" strokeWidth="1" />
        <rect x="4" y="4" width="32" height="48" rx="2" fill="#3498db" opacity="0.3" />
      </g>

      {/* Dice */}
      <g transform="translate(700, 520) rotate(20)">
        <rect width="24" height="24" rx="4" fill="white" stroke="#ccc" strokeWidth="1" />
        <circle cx="8" cy="8" r="2.5" fill="#333" />
        <circle cx="16" cy="16" r="2.5" fill="#333" />
        <circle cx="12" cy="12" r="2.5" fill="#333" />
      </g>
      <g transform="translate(730, 525) rotate(-10)">
        <rect width="24" height="24" rx="4" fill="#ffe4e1" stroke="#ccc" strokeWidth="1" />
        <circle cx="6" cy="6" r="2.5" fill="#c0392b" />
        <circle cx="18" cy="6" r="2.5" fill="#c0392b" />
        <circle cx="6" cy="18" r="2.5" fill="#c0392b" />
        <circle cx="18" cy="18" r="2.5" fill="#c0392b" />
      </g>

      {/* Meeples */}
      {/* Red meeple */}
      <g transform="translate(420, 490)">
        <path d="M0,28 L8,8 Q12,0 16,8 L24,28 Z" fill="#e74c3c" />
        <circle cx="12" cy="6" r="6" fill="#e74c3c" />
      </g>
      {/* Blue meeple */}
      <g transform="translate(550, 500)">
        <path d="M0,28 L8,8 Q12,0 16,8 L24,28 Z" fill="#3498db" />
        <circle cx="12" cy="6" r="6" fill="#3498db" />
      </g>
      {/* Green meeple */}
      <g transform="translate(650, 495)">
        <path d="M0,28 L8,8 Q12,0 16,8 L24,28 Z" fill="#2ecc71" />
        <circle cx="12" cy="6" r="6" fill="#2ecc71" />
      </g>
      {/* Yellow meeple — bright yellow, no outline */}
      <g transform="translate(760, 505)">
        <path d="M0,28 L8,8 Q12,0 16,8 L24,28 Z" fill="#fde047" />
        <circle cx="12" cy="6" r="6" fill="#fde047" />
      </g>
      {/* Purple meeple (standing on table) */}
      <g transform="translate(600, 500)">
        <path d="M0,28 L8,8 Q12,0 16,8 L24,28 Z" fill="#9b59b6" />
        <circle cx="12" cy="6" r="6" fill="#9b59b6" />
      </g>

      {/* Plant in corner — tall floor plant, grounded on floor */}
      <g transform="translate(40, 350)">
        {/* Pot sits on floor (floor is at y=550, pot bottom at y=350+200=550) */}
        <path d="M10,200 L25,140 L75,140 L90,200 Z" fill="#c0392b" />
        <rect x="18" y="132" width="64" height="14" rx="4" fill="#d35400" />
        {/* Trunk */}
        <rect x="42" y="60" width="16" height="80" rx="4" fill="#5d4037" />
        {/* Leaves */}
        <ellipse cx="50" cy="40" rx="35" ry="40" fill="#27ae60" />
        <ellipse cx="28" cy="20" rx="24" ry="30" fill="#2ecc71" />
        <ellipse cx="72" cy="22" rx="24" ry="30" fill="#2ecc71" />
        <ellipse cx="50" cy="-5" rx="18" ry="26" fill="#27ae60" />
        <ellipse cx="35" cy="55" rx="18" ry="20" fill="#229954" />
        <ellipse cx="65" cy="55" rx="18" ry="20" fill="#229954" />
      </g>

      {/* Warm overlay for cozy feel */}
      <rect width="1200" height="800" fill="#f4a460" opacity="0.05" />
    </svg>
  );
}

import React from 'react';

export interface GoldCoinProps {
  size?: number;
  className?: string;
  glowing?: boolean;
}

export const GoldCoinIllustration: React.FC<GoldCoinProps> = ({
  size = 64,
  className = '',
  glowing = false,
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {glowing && (
        <div
          className="absolute -inset-3 rounded-full bg-amber-400/35 blur-md pointer-events-none"
          aria-hidden="true"
        />
      )}
      <svg
        viewBox="0 0 120 120"
        className="w-full h-full drop-shadow-[0_6px_12px_rgba(0,0,0,0.65)]"
        role="img"
        aria-label="Gold Sovereign Coin"
      >
        <defs>
          <radialGradient id="coinGoldGrad" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FFF3B0" />
            <stop offset="35%" stopColor="#FBBF24" />
            <stop offset="75%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#92400E" />
          </radialGradient>
          <linearGradient id="coinRimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="50%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#FEF3C7" />
          </linearGradient>
          <linearGradient id="coinInnerRecess" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#B45309" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#FDE68A" />
          </linearGradient>
        </defs>

        {/* Outer milled coin rim */}
        <circle cx="60" cy="60" r="54" fill="url(#coinRimGrad)" stroke="#78350F" strokeWidth="2.5" />
        <circle
          cx="60"
          cy="60"
          r="49"
          fill="url(#coinGoldGrad)"
          stroke="#FEF3C7"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* Recessed inner medallion */}
        <circle cx="60" cy="60" r="41" fill="url(#coinInnerRecess)" stroke="#78350F" strokeWidth="1.5" />

        {/* Embossed Parlor Star & Crown Emblem */}
        <path
          d="M60 27 L67.5 44.5 L86.5 46.5 L72.2 59.2 L76.2 78 L60 68.2 L43.8 78 L47.8 59.2 L33.5 46.5 L52.5 44.5 Z"
          fill="#FEF3C7"
          stroke="#92400E"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="60" cy="56" r="7" fill="#D97706" stroke="#FEF3C7" strokeWidth="1.5" />

        {/* Specular highlight */}
        <path
          d="M28 36 A42 42 0 0 1 78 22"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
    </div>
  );
};

export interface ParlorHatProps {
  hatIndex: number; // 0, 1, or 2
  isLifted: boolean;
  isSelected?: boolean;
  isHovered?: boolean;
  className?: string;
}

export const HAT_META = [
  {
    id: 0,
    name: 'Left Hat',
    title: 'The Silk Topper',
    ribbonLabel: 'Crimson Silk Band',
    shortcut: '1',
  },
  {
    id: 1,
    name: 'Center Hat',
    title: 'The Grand Bowler',
    ribbonLabel: 'Amber Velvet Band',
    shortcut: '2',
  },
  {
    id: 2,
    name: 'Right Hat',
    title: 'The Emerald Fedora',
    ribbonLabel: 'Royal Gold Band',
    shortcut: '3',
  },
];

export const ParlorHatIllustration: React.FC<ParlorHatProps> = ({
  hatIndex,
  isLifted,
  isSelected = false,
  isHovered = false,
  className = '',
}) => {
  // Different ribbon colors for subtle distinction while keeping a cohesive parlor aesthetic
  const ribbonColors = [
    { main: '#B91C1C', highlight: '#EF4444', dark: '#7F1D1D', buckle: '#FBBF24' }, // Hat 1: Crimson ribbon
    { main: '#D97706', highlight: '#FBBF24', dark: '#92400E', buckle: '#FEF3C7' }, // Hat 2: Amber gold ribbon
    { main: '#047857', highlight: '#10B981', dark: '#064E3B', buckle: '#FBBF24' }, // Hat 3: Emerald silk ribbon
  ];
  const ribbon = ribbonColors[hatIndex % 3];

  return (
    <div
      className={`relative select-none transition-transform duration-200 ease-out will-change-transform ${className}`}
      style={{
        transform: isLifted
          ? 'translateY(-82px) rotate(-6deg)'
          : isHovered
          ? 'translateY(-10px) scale(1.02)'
          : 'translateY(0px) scale(1)',
      }}
    >
      <svg
        viewBox="0 0 220 175"
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label={HAT_META[hatIndex]?.title || `Hat ${hatIndex + 1}`}
      >
        <defs>
          <linearGradient id={`hatBody-${hatIndex}`} x1="15%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="30%" stopColor="#1E293B" />
            <stop offset="75%" stopColor="#0F172A" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <linearGradient id={`hatBrim-${hatIndex}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0F172A" />
            <stop offset="28%" stopColor="#334155" />
            <stop offset="50%" stopColor="#475569" />
            <stop offset="72%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <linearGradient id={`hatRibbon-${hatIndex}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={ribbon.dark} />
            <stop offset="35%" stopColor={ribbon.highlight} />
            <stop offset="70%" stopColor={ribbon.main} />
            <stop offset="100%" stopColor={ribbon.dark} />
          </linearGradient>
        </defs>

        {/* Crown silhouette based on hatIndex */}
        {hatIndex === 0 && (
          /* Hat 1: Classic Magician's Silk Top Hat (flared crown) */
          <g>
            <path
              d="M52 34 C52 22, 168 22, 168 34 L158 132 L62 132 Z"
              fill={`url(#hatBody-${hatIndex})`}
              stroke={isSelected ? '#FBBF24' : '#475569'}
              strokeWidth={isSelected ? '3' : '1.5'}
            />
            {/* Top crown ellipse */}
            <ellipse
              cx="110"
              cy="34"
              rx="58"
              ry="12"
              fill="#1E293B"
              stroke="#64748B"
              strokeWidth="1.2"
            />
            {/* Silk sheen highlight on left side of cylinder */}
            <path
              d="M68 42 L73 115"
              stroke="#94A3B8"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.28"
            />
          </g>
        )}

        {hatIndex === 1 && (
          /* Hat 2: Rounded Victorian Bowler / Derby Hat */
          <g>
            <path
              d="M56 132 C52 54, 74 26, 110 26 C146 26, 168 54, 164 132 Z"
              fill={`url(#hatBody-${hatIndex})`}
              stroke={isSelected ? '#FBBF24' : '#475569'}
              strokeWidth={isSelected ? '3' : '1.5'}
            />
            {/* Dome specular highlight */}
            <path
              d="M72 78 C76 50, 92 38, 112 36"
              fill="none"
              stroke="#94A3B8"
              strokeWidth="4.5"
              strokeLinecap="round"
              opacity="0.3"
            />
          </g>
        )}

        {hatIndex === 2 && (
          /* Hat 3: Indented Parlor Fedora / Trilby */
          <g>
            <path
              d="M58 132 L66 44 C76 28, 95 40, 110 38 C125 40, 144 28, 154 44 L162 132 Z"
              fill={`url(#hatBody-${hatIndex})`}
              stroke={isSelected ? '#FBBF24' : '#475569'}
              strokeWidth={isSelected ? '3' : '1.5'}
            />
            {/* Center pinch crease */}
            <path
              d="M84 44 Q110 62 136 44"
              fill="none"
              stroke="#0F172A"
              strokeWidth="3"
              opacity="0.65"
            />
            <path
              d="M74 56 L69 114"
              stroke="#94A3B8"
              strokeWidth="3.5"
              strokeLinecap="round"
              opacity="0.28"
            />
          </g>
        )}

        {/* Hat Silk Ribbon Band */}
        <path
          d="M60 112 Q110 120 160 112 L162 131 Q110 139 58 131 Z"
          fill={`url(#hatRibbon-${hatIndex})`}
          stroke="#0F172A"
          strokeWidth="1"
        />

        {/* Brass Hat Buckle on Ribbon */}
        <rect
          x="101"
          y="113"
          width="18"
          height="18"
          rx="3"
          fill="none"
          stroke={ribbon.buckle}
          strokeWidth="3"
        />
        <line
          x1="110"
          y1="115"
          x2="110"
          y2="129"
          stroke={ribbon.buckle}
          strokeWidth="2"
        />

        {/* Wide Sculpted Hat Brim resting on the table */}
        <ellipse
          cx="110"
          cy="134"
          rx="86"
          ry="19"
          fill={`url(#hatBrim-${hatIndex})`}
          stroke={isSelected ? '#FBBF24' : '#64748B'}
          strokeWidth={isSelected ? '3' : '1.8'}
        />

        {/* Inner brim lip highlight */}
        <path
          d="M34 134 Q110 151 186 134"
          fill="none"
          stroke="#CBD5E1"
          strokeWidth="1.5"
          opacity="0.45"
        />

        {/* Number Medallion on the Crown */}
        <circle
          cx="110"
          cy="78"
          r="15"
          fill="#0F172A"
          stroke={isSelected ? '#FBBF24' : '#475569'}
          strokeWidth="1.8"
        />
        <text
          x="110"
          y="83"
          textAnchor="middle"
          fill={isSelected ? '#FBBF24' : '#F4F1EA'}
          fontSize="15"
          fontWeight="700"
          fontFamily="JetBrains Mono, monospace"
        >
          {hatIndex + 1}
        </text>
      </svg>
    </div>
  );
};

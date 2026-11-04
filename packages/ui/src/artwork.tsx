import React from 'react';
import { PLAYER_TOKENS, type BoardPackId, type TokenId } from '@capital-city/shared';

export function CapitalCityLogo({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient
          id="cc-logo-bg"
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#0F2942" />
          <stop offset="100%" stopColor="#071020" />
        </linearGradient>
        <linearGradient
          id="cc-logo-accent"
          x1="12"
          y1="52"
          x2="52"
          y2="12"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#14B8A6" />
          <stop offset="60%" stopColor="#2DD4BF" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill="url(#cc-logo-bg)"
        stroke="#2DD4BF"
        strokeOpacity="0.45"
        strokeWidth="2"
      />
      <path d="M14 48V30L22 25V48H14Z" fill="#1E3A5F" />
      <path d="M25 48V18L36 12V48H25Z" fill="url(#cc-logo-accent)" />
      <path d="M39 48V24L50 29V48H39Z" fill="#F59E0B" fillOpacity="0.9" />
      <path d="M10 49H54" stroke="#5EEAD4" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="31" cy="21" r="2" fill="#06101E" />
      <circle cx="31" cy="28" r="2" fill="#06101E" />
      <circle cx="31" cy="35" r="2" fill="#06101E" />
    </svg>
  );
}

export function PlayerTokenAvatar({
  tokenId,
  size = 32,
  active = false,
  label,
}: {
  tokenId: TokenId;
  size?: number;
  active?: boolean;
  label?: string;
}) {
  const meta = PLAYER_TOKENS.find((t) => t.id === tokenId) ?? PLAYER_TOKENS[0];

  const renderGlyph = () => {
    switch (tokenId) {
      case 'skyline-tower':
        return (
          <path
            d="M16 5L21 10V26H11V10L16 5ZM14 13H18M14 17H18M14 21H18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'luxury-yacht':
        return (
          <path
            d="M6 21L10 25H23L26 20H15L19 9L11 18H6ZM7 27C10 26 13 28 16 27C19 26 22 28 25 27"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'maglev-train':
        return (
          <path
            d="M7 19C7 13 12 9 20 9H25V21H7V19ZM11 14H17M8 25H25"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'cyber-drone':
        return (
          <path
            d="M12 13H20L22 16L20 19H12L10 16L12 13ZM6 10H11M21 10H26M6 22H11M21 22H26M9 10L12 13M23 10L20 13M9 22L12 19M23 22L20 19"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'solar-roadster':
        return (
          <path
            d="M6 19L9 13H20L25 17L26 21H6V19ZM10 22A2 2 0 1 0 10 26A2 2 0 1 0 10 22ZM22 22A2 2 0 1 0 22 26A2 2 0 1 0 22 22Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'emerald-vault':
        return (
          <path
            d="M8 8H24V24H8V8ZM16 12A4 4 0 1 0 16 20A4 4 0 1 0 16 12ZM16 14V18M14 16H18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'orbital-shuttle':
        return (
          <path
            d="M16 5C20 9 21 15 21 21L25 24V26L19 24H13L7 26V24L11 21C11 15 12 9 16 5ZM16 13V17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'crown-compass':
        return (
          <path
            d="M16 6A10 10 0 1 0 16 26A10 10 0 1 0 16 6ZM19 13L17 17L13 19L15 15L19 13Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
    }
  };

  return (
    <span
      title={label ?? meta.name}
      aria-label={label ?? meta.name}
      style={{
        width: size,
        height: size,
        backgroundColor: meta.accent,
        borderColor: meta.color,
        boxShadow: active
          ? `0 0 0 2px #060B16, 0 0 14px ${meta.color}`
          : '0 2px 6px rgba(0,0,0,0.45)',
      }}
      className="inline-flex items-center justify-center rounded-full border-2 text-white transition-transform select-none shrink-0"
    >
      <svg
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        {renderGlyph()}
      </svg>
    </span>
  );
}

export function BoardCenterArtwork({ packId }: { packId: BoardPackId }) {
  if (packId === 'riviera-district') {
    return (
      <svg
        viewBox="0 0 360 150"
        className="w-full max-w-[320px] h-auto opacity-90"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="riv-sun"
            x1="180"
            y1="15"
            x2="180"
            y2="115"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="55%" stopColor="#FB7185" />
            <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <circle cx="180" cy="78" r="46" fill="url(#riv-sun)" opacity="0.75" />
        <path
          d="M40 112C95 96 145 124 200 108C255 92 290 118 330 106"
          stroke="#38BDF8"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M60 126C115 112 165 136 220 122C265 110 295 128 320 120"
          stroke="#2DD4BF"
          strokeWidth="2"
          strokeOpacity="0.7"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M126 108V62L136 50L146 62V108" fill="#0F273D" stroke="#FDE68A" strokeWidth="1.8" />
        <path d="M214 108V72H248V108" fill="#0F273D" stroke="#38BDF8" strokeWidth="1.8" />
        <path d="M168 106L182 70L198 106H168Z" fill="#F8FAFC" fillOpacity="0.9" />
      </svg>
    );
  }

  if (packId === 'nova-frontier') {
    return (
      <svg
        viewBox="0 0 360 150"
        className="w-full max-w-[320px] h-auto opacity-90"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="nova-ring"
            x1="60"
            y1="20"
            x2="300"
            y2="130"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="50%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#E879F9" />
          </linearGradient>
        </defs>
        <ellipse
          cx="180"
          cy="78"
          rx="118"
          ry="34"
          stroke="url(#nova-ring)"
          strokeWidth="2.5"
          fill="none"
          transform="rotate(-11 180 78)"
        />
        <circle cx="180" cy="75" r="28" fill="#171136" stroke="#22D3EE" strokeWidth="2" />
        <circle cx="180" cy="75" r="11" fill="#E879F9" fillOpacity="0.85" />
        <path
          d="M108 122L122 68H138L148 122M212 122L224 58H240L252 122"
          stroke="#38BDF8"
          strokeOpacity="0.75"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 360 150"
      className="w-full max-w-[320px] h-auto opacity-90"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="ast-glow"
          x1="180"
          y1="12"
          x2="180"
          y2="132"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#0F172A" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path
        d="M72 126V78H98V126M106 126V54L132 42V126M142 126V64H166V126M174 126V22L202 34V126M212 126V58H242V126M250 126V74L282 64V126"
        stroke="url(#ast-glow)"
        strokeWidth="2.2"
        fill="#0B162C"
      />
      <path d="M52 126H308" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
      <circle cx="188" cy="40" r="3" fill="#F59E0B" />
    </svg>
  );
}

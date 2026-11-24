import { useId } from 'react';
import type { CardArt as CardArtKind } from '@/lib/cards/content';

/**
 * Иллюстрации на лицевой стороне карты (нарисованы для AlemPrep, свои).
 * Подписи на рисунках (v, F, a, m) — физические обозначения, не язык интерфейса.
 */
const STARS = (
  <g fill="#fff">
    <circle cx="30" cy="30" r="1.6" />
    <circle cx="96" cy="64" r="1.2" />
    <circle cx="330" cy="40" r="1.8" />
    <circle cx="300" cy="190" r="1.4" />
    <circle cx="60" cy="190" r="1.6" />
    <circle cx="150" cy="22" r="1.2" />
    <circle cx="214" cy="200" r="1.2" />
  </g>
);

function Inertia({ id, label }: { id: string; label: string }) {
  return (
    <svg viewBox="0 0 360 220" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={`${id}b`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#EFFFF8" />
          <stop offset=".4" stopColor="#2BC98F" />
          <stop offset="1" stopColor="#075239" />
        </radialGradient>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2BC98F" stopOpacity="0" />
          <stop offset="1" stopColor="#A6F4D0" stopOpacity=".8" />
        </linearGradient>
      </defs>
      {STARS}
      <circle cx="318" cy="70" r="15" fill="#E8B931" />
      <ellipse cx="318" cy="70" rx="28" ry="7" fill="none" stroke="#F6E7B0" strokeWidth="3" transform="rotate(-18 318 70)" />
      <path d="M30 118L226 98V128L30 134Z" fill={`url(#${id}t)`} />
      <path d="M60 80H150M90 160H190M30 148H100" stroke="#A6F4D0" strokeOpacity=".45" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="240" cy="113" r="32" fill={`url(#${id}b)`} />
      <circle cx="240" cy="113" r="32" fill="none" stroke="#A6F4D0" strokeOpacity=".5" strokeWidth="2" />
      <path d="M210 40H290" stroke="#FF8A3D" strokeWidth="6" strokeLinecap="round" />
      <path d="M286 27L312 40L286 53Z" fill="#FF8A3D" />
      <text x="210" y="28" fill="#FFB27F" fontSize="19" fontWeight="700">
        v = const
      </text>
    </svg>
  );
}

function Force({ id, label }: { id: string; label: string }) {
  return (
    <svg viewBox="0 0 360 220" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3BE0A5" />
          <stop offset="1" stopColor="#0B6B4B" />
        </linearGradient>
      </defs>
      <path d="M0 132H360" stroke="#A6F4D0" strokeOpacity=".7" strokeWidth="2" />
      <path d="M0 144H360M0 160H360M0 182H360M0 214H360" stroke="#A6F4D0" strokeOpacity=".25" strokeWidth="2" />
      <path
        d="M180 132L-80 220M180 132L-10 220M180 132L80 220M180 132L180 220M180 132L280 220M180 132L370 220M180 132L440 220"
        stroke="#A6F4D0"
        strokeOpacity=".25"
        strokeWidth="2"
      />
      <g fill="#fff">
        <circle cx="40" cy="30" r="1.5" />
        <circle cx="110" cy="70" r="1.2" />
        <circle cx="320" cy="60" r="1.6" />
        <circle cx="270" cy="24" r="1.2" />
      </g>
      <path d="M146 96H116M150 112H104M146 126H122" stroke="#A6F4D0" strokeOpacity=".5" strokeWidth="3" strokeLinecap="round" />
      <rect x="166" y="88" width="132" height="44" rx="10" fill={`url(#${id}b)`} stroke="#A6F4D0" strokeWidth="2.5" />
      <rect x="200" y="54" width="62" height="34" rx="8" fill="#E8B931" />
      <text x="231" y="79" textAnchor="middle" fill="#2b1c00" fontSize="22" fontWeight="800">
        m
      </text>
      <circle cx="198" cy="142" r="15" fill="#07100C" stroke="#A6F4D0" strokeWidth="3" />
      <circle cx="266" cy="142" r="15" fill="#07100C" stroke="#A6F4D0" strokeWidth="3" />
      <circle cx="198" cy="142" r="4" fill="#E8B931" />
      <circle cx="266" cy="142" r="4" fill="#E8B931" />
      <path d="M20 110H124" stroke="#FF8A3D" strokeWidth="8" strokeLinecap="round" />
      <path d="M120 94L152 110L120 126Z" fill="#FF8A3D" />
      <text x="56" y="92" fill="#FFB27F" fontSize="22" fontWeight="800">
        F
      </text>
      <path d="M190 30H300" stroke="#A6F4D0" strokeWidth="5" strokeLinecap="round" />
      <path d="M296 18L320 30L296 42Z" fill="#A6F4D0" />
      <text x="326" y="38" fill="#A6F4D0" fontSize="20" fontWeight="800">
        a
      </text>
    </svg>
  );
}

function Action({ id, label }: { id: string; label: string }) {
  return (
    <svg viewBox="0 0 360 220" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#B7E8D2" />
        </linearGradient>
      </defs>
      <g fill="#fff">
        <circle cx="30" cy="34" r="1.6" />
        <circle cx="90" cy="180" r="1.3" />
        <circle cx="330" cy="46" r="1.8" />
        <circle cx="296" cy="196" r="1.4" />
        <circle cx="180" cy="26" r="1.2" />
        <circle cx="52" cy="110" r="1.2" />
      </g>
      <circle cx="180" cy="200" r="46" fill="#17503D" />
      <rect x="66" y="92" width="22" height="46" rx="8" fill="#8CC9AF" />
      <rect x="84" y="80" width="64" height="72" rx="22" fill={`url(#${id}s)`} />
      <circle cx="116" cy="62" r="25" fill={`url(#${id}s)`} />
      <ellipse cx="122" cy="62" rx="15" ry="12" fill="#0C0E0D" />
      <ellipse cx="119" cy="58" rx="5" ry="3" fill="#A6F4D0" />
      <path d="M146 104H182" stroke="#E8F7F0" strokeWidth="14" strokeLinecap="round" />
      <rect x="272" y="92" width="22" height="46" rx="8" fill="#E5A15F" />
      <rect x="212" y="80" width="64" height="72" rx="22" fill={`url(#${id}s)`} />
      <circle cx="244" cy="62" r="25" fill={`url(#${id}s)`} />
      <ellipse cx="238" cy="62" rx="15" ry="12" fill="#0C0E0D" />
      <ellipse cx="235" cy="58" rx="5" ry="3" fill="#FFB27F" />
      <path d="M214 104H178" stroke="#E8F7F0" strokeWidth="14" strokeLinecap="round" />
      <rect x="90" y="124" width="52" height="8" rx="4" fill="#2BC98F" />
      <rect x="218" y="124" width="52" height="8" rx="4" fill="#FF8A3D" />
      <path d="M120 186H36" stroke="#FF8A3D" strokeWidth="6" strokeLinecap="round" />
      <path d="M42 174L18 186L42 198Z" fill="#FF8A3D" />
      <text x="62" y="172" fill="#FFB27F" fontSize="19" fontWeight="800">
        −F
      </text>
      <path d="M240 186H324" stroke="#2BC98F" strokeWidth="6" strokeLinecap="round" />
      <path d="M318 174L342 186L318 198Z" fill="#2BC98F" />
      <text x="270" y="172" fill="#A6F4D0" fontSize="19" fontWeight="800">
        F
      </text>
    </svg>
  );
}

/** Запасная картинка для карточки без своей иллюстрации. */
function Orbit({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 360 220" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      {STARS}
      <g fill="none" stroke="#E8B931" strokeOpacity=".6" strokeWidth="2">
        <ellipse cx="180" cy="110" rx="120" ry="40" transform="rotate(30 180 110)" />
        <ellipse cx="180" cy="110" rx="120" ry="40" transform="rotate(-30 180 110)" />
        <ellipse cx="180" cy="110" rx="120" ry="40" transform="rotate(90 180 110)" />
      </g>
      <circle cx="180" cy="110" r="12" fill="#2BC98F" />
      <circle cx="268" cy="150" r="7" fill="#E8B931" />
      <circle cx="90" cy="70" r="7" fill="#A6F4D0" />
      <circle cx="180" cy="22" r="7" fill="#FF8A3D" />
    </svg>
  );
}

export function CardArt({ art, label }: { art?: CardArtKind; label: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (art === 'inertia') return <Inertia id={id} label={label} />;
  if (art === 'force') return <Force id={id} label={label} />;
  if (art === 'action') return <Action id={id} label={label} />;
  return <Orbit label={label} />;
}

/** Атом-орбиты для обратной стороны. */
export function CardOrbit() {
  return (
    <svg viewBox="0 0 320 320" aria-hidden="true">
      <g fill="none" stroke="#E8B931" strokeOpacity=".5" strokeWidth="1.6">
        <ellipse cx="160" cy="160" rx="150" ry="52" transform="rotate(30 160 160)" />
        <ellipse cx="160" cy="160" rx="150" ry="52" transform="rotate(-30 160 160)" />
        <ellipse cx="160" cy="160" rx="150" ry="52" transform="rotate(90 160 160)" />
      </g>
      <circle cx="160" cy="160" r="9" fill="#2BC98F" />
      <circle cx="296" cy="214" r="6" fill="#E8B931" />
      <circle cx="40" cy="106" r="6" fill="#A6F4D0" />
      <circle cx="160" cy="14" r="6" fill="#FF8A3D" />
    </svg>
  );
}

// Futkrill's flat vector pieces (spec: docs/superpowers/specs/2026-10-18-clean-revamp-design.md): the two-tone wordmark,
// the ball, a badge per tier, the streak flame, small icons, and the faint stadium behind every page. No pixel art.

import { useId } from "react";

import { tierInfo } from "@/lib/tiers.ts";

/** FUT in navy, KRILL in gold. One accessible image named "Futkrill". */
export function Logo({ className = "logo" }: { className?: string }) {
  return (
    <span role="img" aria-label="Futkrill" className={className}>
      <span className="fut" aria-hidden="true">FUT</span><span className="krill" aria-hidden="true">KRILL</span>
    </span>
  );
}

const PENTAGON = (cx: number, cy: number, r: number, rot: number) =>
  Array.from({ length: 5 }, (_, k) => {
    const a = ((rot + 72 * k) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

/** A football: white panels shaded from the top left, dark pentagons, seams between them. */
export function Ball({ size = 56, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const inner = Array.from({ length: 5 }, (_, k) => -90 + 72 * k);
  return (
    <svg className={className} width={size} height={size} viewBox="-50 -50 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-shade`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#eef1f6" />
          <stop offset="1" stopColor="#c9d1dd" />
        </radialGradient>
        <clipPath id={`${id}-clip`}><circle r="47" /></clipPath>
      </defs>
      <circle r="47" fill={`url(#${id}-shade)`} />
      <g clipPath={`url(#${id}-clip)`} fill="#2a3550" stroke="#2a3550" strokeWidth="1.4" strokeLinejoin="round">
        <polygon points={PENTAGON(0, 0, 13, -90)} />
        {inner.map((a) => {
          const r = (a * Math.PI) / 180;
          const ox = Math.cos(r + Math.PI / 5) * 47, oy = Math.sin(r + Math.PI / 5) * 47;
          return (
            <g key={a}>
              <polygon points={PENTAGON(ox, oy, 13, a + 36 + 180)} />
              <line x1={Math.cos(r) * 13} y1={Math.sin(r) * 13} x2={Math.cos(r) * 33} y2={Math.sin(r) * 33} fill="none" strokeWidth="1.1" />
            </g>
          );
        })}
      </g>
      <circle r="47" fill="none" stroke="#b9c2cf" strokeWidth="1.5" />
      <ellipse cx="-14" cy="-20" rx="13" ry="8" fill="#ffffff" opacity="0.7" transform="rotate(-30 -14 -20)" />
    </svg>
  );
}

const GLYPHS: Record<number, React.ReactNode> = {
  1: <><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M9 3l3 4 3-4" /><path d="M9 21h6" /></>,
  2: <><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4" /><path d="M17 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4M8 20h8" /></>,
  3: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9l5 3-5 3z" fill="currentColor" /></>,
  4: <><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z" /><path d="M14 7v10" strokeDasharray="2 2" /></>,
  5: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M6 7l3 3M9 7l-3 3" /><circle cx="16" cy="15" r="1.8" /><path d="M8 16c2-4 4-6 7-7M15 9h-2.5M15 9v2.5" /></>,
  6: <path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="currentColor" />,
  7: <><path d="M4 17l-1-10 5 4 4-7 4 7 5-4-1 10z" fill="currentColor" /><path d="M4 20h16" /></>,
};

/** A tier's badge: its glyph in white on a disc of its colour. */
export function TierBadge({ tier, size = 40, className }: { tier: number; size?: number; className?: string }) {
  const info = tierInfo(tier);
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={info.name}>
      <circle cx="20" cy="20" r="20" fill={info.color} />
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="#ffffff" strokeOpacity="0.35" />
      <g transform="translate(8 8)" color="#ffffff" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {GLYPHS[tier]}
      </g>
    </svg>
  );
}

/** The streak flame: orange outside, gold inside; grey when it has gone out. */
export function Flame({ size = 28, out = false }: { size?: number; out?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size * 0.8} height={size} viewBox="0 0 20 25" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-f`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={out ? "#7c8494" : "#e2571b"} />
          <stop offset="1" stopColor={out ? "#b6bcc8" : "#f59e0b"} />
        </linearGradient>
      </defs>
      <path d="M10 1c1.5 4.5 8 7 8 14a8 8 0 0 1-16 0c0-3.6 2.2-6 3.6-8 .2 2.4 1.3 3.6 2.6 3.6C8.2 7 8.6 4 10 1z" fill={`url(#${id}-f)`} />
      <path d="M10 13c1 2.2 3.6 3.2 3.6 6a3.6 3.6 0 0 1-7.2 0c0-1.8 1.2-3 2.1-3.9.2 1 .8 1.5 1.3 1.5-.3-1.3 0-2.4.2-3.6z"
            fill={out ? "#d4d8e0" : "#fde68a"} />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function Arrow() {
  return (
    <svg className="arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

/** The ball resting on the centre spot, with the centre circle round it: the foot of the home screen. */
export function CentreSpot() {
  return (
    <div className="centre-spot" aria-hidden="true">
      <svg className="centre-circle" viewBox="0 0 720 140" preserveAspectRatio="none">
        <ellipse cx="360" cy="70" rx="340" ry="56" fill="none" stroke="#ffffff" strokeWidth="5" />
        <ellipse cx="360" cy="70" rx="340" ry="56" fill="none" stroke="#dfe5ee" strokeWidth="1.5" transform="translate(0 3)" />
      </svg>
      <span className="centre-shadow" />
      <Ball size={64} className="centre-ball" />
    </div>
  );
}

// A U-shaped band of stands across the backdrop: from the left edge, sagging to `mid` in the middle, up to the right.
const arc = (side: number, mid: number) => `M -120 ${side} Q 800 ${2 * mid - side} 1720 ${side}`;
const band = (top: [number, number], bottom: [number, number]) =>
  `${arc(top[0], top[1])} L 1720 ${bottom[0]} Q 800 ${2 * bottom[1] - bottom[0]} -120 ${bottom[0]} Z`;

/** The faint stadium behind every page: tiers of empty stands in soft greys, floodlights in the top corners, the pitch
 *  with its lines fading into the light. Static. */
export function Backdrop() {
  const tiers: [[number, number], [number, number]][] = [
    [[175, 372], [300, 440]], [[322, 452], [430, 515]], [[450, 526], [545, 580]], [[562, 590], [640, 630]],
  ];
  const bands: [[number, number], [number, number]][] = [[[300, 440], [322, 452]], [[430, 515], [450, 526]], [[545, 580], [562, 590]]];
  const lamps = (cx: number, cy: number) => Array.from({ length: 12 }, (_, i) => [cx + (i % 4) * 22 - 33, cy + Math.floor(i / 4) * 20 - 20]);
  return (
    <svg className="backdrop-art" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="bd-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9eef6" /><stop offset="0.55" stopColor="#f6f8fb" /><stop offset="1" stopColor="#eef2f5" />
        </linearGradient>
        <linearGradient id="bd-tier" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dde3eb" /><stop offset="1" stopColor="#eaeef4" />
        </linearGradient>
        <linearGradient id="bd-pitch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8eee9" /><stop offset="1" stopColor="#f3f6f4" />
        </linearGradient>
        <radialGradient id="bd-glow"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></radialGradient>
        <radialGradient id="bd-veil" cx="50%" cy="48%" r="60%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" /><stop offset="0.6" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id="bd-soft"><feGaussianBlur stdDeviation="2.2" /></filter>
      </defs>
      <rect width="1600" height="1000" fill="url(#bd-sky)" />
      <g filter="url(#bd-soft)">
        <path d={band([60, 280], [150, 350])} fill="#d7dde6" />
        <path d={band([150, 350], [175, 372])} fill="#c9d1dc" />
        {Array.from({ length: 30 }, (_, i) => {                               // lamps along the roof's edge
          const u = (i + 0.5) / 30, x = -120 + 1840 * u;
          const y = (1 - u) * (1 - u) * 162 + 2 * u * (1 - u) * (2 * 361 - 162) + u * u * 162;
          return <circle key={i} cx={x} cy={y} r="3" fill="#ffffff" />;
        })}
        {tiers.map(([t, b], i) => <path key={`t${i}`} d={band(t, b)} fill="url(#bd-tier)" />)}
        {tiers.flatMap(([t, b], i) => Array.from({ length: 4 }, (_, k) => {    // rows of seats
          const f = (k + 1) / 5;
          return <path key={`r${i}-${k}`} d={arc(t[0] + (b[0] - t[0]) * f, t[1] + (b[1] - t[1]) * f)} fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="1.5" />;
        }))}
        {bands.map(([t, b], i) => <path key={`b${i}`} d={band(t, b)} fill="#cfd6e0" />)}
        <path d={band([640, 630], [658, 640])} fill="#d3dae3" />
        <path d={`${arc(658, 640)} L 1720 1000 L -120 1000 Z`} fill="url(#bd-pitch)" />
        {[0, 1, 2, 3, 4].map((k) => {                                         // mowing stripes, wider near the camera
          const y0 = 650 + 22 * k * k + 12 * k, y1 = y0 + 10 + 14 * k;
          return <rect key={k} x="-120" y={y0} width="1840" height={y1 - y0} fill="#e2e9e3" opacity="0.6" />;
        })}
        <g stroke="#ffffff" strokeWidth="4" fill="none" strokeLinecap="round">
          <path d="M 800 650 L 800 1000" />
          <path d="M 300 652 L -160 1000" />
          <path d="M 1300 652 L 1760 1000" />
          <path d="M 300 652 L 1300 652" strokeWidth="3" />
        </g>
      </g>
      {[[110, 130], [1490, 130]].map(([cx, cy]) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r="150" fill="url(#bd-glow)" opacity="0.9" />
          <path d={`M ${cx} ${cy + 40} L ${cx + (cx < 800 ? 60 : -60)} 300`} stroke="#d5dce5" strokeWidth="6" />
          {lamps(cx, cy).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8" fill="#ffffff" stroke="#e3e8ef" strokeWidth="2" />)}
        </g>
      ))}
      <rect width="1600" height="1000" fill="url(#bd-veil)" />
    </svg>
  );
}

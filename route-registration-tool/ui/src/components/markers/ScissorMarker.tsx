export default function ScissorMarker() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 120 80"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g>
        {/* Arms connecting handles to pivot */}
        <path
          d="M45 28 L58 40 L45 52"
          fill="none"
          stroke="black"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* Top blade */}
        <path fill="black" d="M58 40 L95 25 L98 30 L58 43 Z" />

        {/* Bottom blade */}
        <path fill="black" d="M58 40 L95 55 L98 50 L58 37 Z" />

        {/* Handles */}
        <circle cx="45" cy="28" r="8" fill="black" />
        <circle cx="45" cy="52" r="8" fill="black" />

        {/* Pivot screw (White for contrast) */}
        <circle cx="58" cy="40" r="3" fill="white" />
      </g>
    </svg>
  )
}

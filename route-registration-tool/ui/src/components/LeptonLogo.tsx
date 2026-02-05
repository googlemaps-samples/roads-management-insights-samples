// Add this new component for the Lepton Software logo
const LeptonLogo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg
    viewBox="0 0 32 32"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Gradient definitions */}
    <defs>
      <linearGradient id="leptonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3B82F6" />
        <stop offset="100%" stopColor="#1E40AF" />
      </linearGradient>
      <linearGradient id="particleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#60A5FA" />
        <stop offset="100%" stopColor="#3B82F6" />
      </linearGradient>
    </defs>

    {/* Main L shape */}
    <path
      d="M8 6 L8 22 L20 22 L20 18 L12 18 L12 6 Z"
      fill="url(#leptonGradient)"
    />

    {/* Particle/orbital rings representing lepton */}
    <circle
      cx="20"
      cy="12"
      r="6"
      stroke="url(#particleGradient)"
      strokeWidth="1.5"
      fill="none"
      opacity="0.7"
    />

    <circle
      cx="20"
      cy="12"
      r="3"
      stroke="url(#particleGradient)"
      strokeWidth="1"
      fill="none"
      opacity="0.5"
    />

    {/* Central particle */}
    <circle cx="20" cy="12" r="1.5" fill="url(#particleGradient)" />

    {/* Moving particles */}
    <circle cx="26" cy="12" r="1" fill="#60A5FA" opacity="0.8">
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="0 20 12;360 20 12"
        dur="4s"
        repeatCount="indefinite"
      />
    </circle>

    <circle cx="17" cy="8" r="0.8" fill="#3B82F6" opacity="0.6">
      <animateTransform
        attributeName="transform"
        type="rotate"
        values="0 20 12;-360 20 12"
        dur="6s"
        repeatCount="indefinite"
      />
    </circle>
  </svg>
)

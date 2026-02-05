import React from "react"

interface ReverseRouteIconProps {
  sx?: React.CSSProperties
}

export const ReverseRouteIcon: React.FC<ReverseRouteIconProps> = ({ sx }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    style={sx}
  >
    {/* Up arrow (left) */}
    <path d="M9 8l-3 3h2v5h2v-5h2l-3-3z" />
    {/* Down arrow (right) */}
    <path d="M15 16l3-3h-2v-5h-2v5h-2l3 3z" />
  </svg>
)

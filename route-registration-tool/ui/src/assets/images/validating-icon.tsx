import { SxProps, Theme } from "@mui/material"
import React from "react"

interface ValidatingIconProps {
  sx?: SxProps<Theme>
}

export const ValidatingIcon: React.FC<ValidatingIconProps> = ({ sx }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={sx as React.CSSProperties}
  >
    {/* Solid 3/4 circle */}
    <path
      d="M 21 12 A 9 9 0 1 1 12 3"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      fill="none"
    />
    {/* Dashed 1/4 circle with smaller, more frequent dashes */}
    <path
      d="M 12 3 A 9 9 0 0 1 21 12"
      stroke="currentColor"
      strokeWidth="2"
      strokeDasharray="0.1 3.4"
      strokeLinecap="round"
      fill="none"
    />
    {/* Clock hands */}
    <path
      d="M12 7v5l3 2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

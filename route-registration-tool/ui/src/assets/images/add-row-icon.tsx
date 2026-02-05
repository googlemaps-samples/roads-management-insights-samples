import { SxProps, Theme } from "@mui/material"
import React from "react"

interface AddRowIconProps {
  sx?: SxProps<Theme>
}

export const AddRowIcon: React.FC<AddRowIconProps> = ({ sx }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24px"
    height="24px"
    viewBox="0 0 24 24"
    fill="none"
    style={sx as React.CSSProperties}
  >
    <g id="Edit / Add_Row">
      <path
        id="Vector"
        d="M3 14V15C3 16.1046 3.89543 17 5 17L19 17C20.1046 17 21 16.1046 21 15L21 13C21 11.8954 20.1046 11 19 11H13M10 8H7M7 8H4M7 8V5M7 8V11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
)


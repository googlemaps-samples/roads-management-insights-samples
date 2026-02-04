// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Box, styled } from "@mui/material"
import React from "react"

const HighlightBorder = styled(Box)({
  position: "absolute",
  top: "-6px",
  right: "-6px",
  width: "calc(100% + 12px)",
  height: "calc(100% + 12px)",
  borderRadius: "999px",
  border: "4px solid #4285f4",
  animation:
    "borderPulse 2.5s ease-in-out infinite, borderGlow 4s ease-in-out infinite",
  zIndex: 1,
  pointerEvents: "none",
  "& .arrow-indicator": {
    position: "absolute",
    top: "50%",
    left: "-20px",
    transform: "translateY(-50%)",
    width: "0",
    height: "0",
    borderLeft: "8px solid #4285f4",
    borderTop: "6px solid transparent",
    borderBottom: "6px solid transparent",
    animation: "arrowPulse 2s ease-in-out infinite",
    filter: "drop-shadow(0 2px 4px rgba(66, 133, 244, 0.3))",
  },
  "@keyframes borderPulse": {
    "0%, 100%": {
      transform: "scale(1)",
      opacity: 0.8,
    },
    "50%": {
      transform: "scale(1.05)",
      opacity: 1,
    },
  },
  "@keyframes borderGlow": {
    "0%, 100%": {
      boxShadow: "0 0 10px rgba(66, 133, 244, 0.4)",
    },
    "50%": {
      boxShadow: "0 0 20px rgba(66, 133, 244, 0.8)",
    },
  },
  "@keyframes arrowPulse": {
    "0%, 100%": {
      transform: "translateY(-50%) translateX(0px)",
      opacity: 0.8,
    },
    "50%": {
      transform: "translateY(-50%) translateX(4px)",
      opacity: 1,
    },
  },
})

interface HighlightBorderProps {
  showArrow?: boolean
}

export const HighlightBorderComponent: React.FC<HighlightBorderProps> = ({
  showArrow = true,
}) => {
  return (
    <HighlightBorder>
      {showArrow && (
        <div
          className="arrow-indicator"
          style={{
            borderLeft: "8px solid #4285f4",
            borderTop: "6px solid transparent",
            borderBottom: "6px solid transparent",
          }}
        />
      )}
    </HighlightBorder>
  )
}

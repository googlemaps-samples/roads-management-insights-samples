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

import { Box, Typography } from "@mui/material"

import { shouldShowDelay } from "../deck-gl/helpers"
import { formatDuration } from "../utils/formatters"

interface DelayDisplayProps {
  delayTime?: number
  delayPercentage?: number
  variant?: "default" | "compact"
  showNoDelay?: boolean
}

export const DelayDisplay: React.FC<DelayDisplayProps> = ({
  delayTime = 0,
  delayPercentage = 0,
  variant = "default",
  showNoDelay = true,
}) => {
  const shouldShowDelayValue = shouldShowDelay(delayTime)
  const hasDelay = shouldShowDelayValue

  if (!hasDelay && showNoDelay) {
    return (
      <Typography
        sx={{
          fontSize: variant === "compact" ? "10px" : "11px",
          color: "#4285f4",
          fontWeight: 600,
          fontFamily: '"Google Sans", Roboto, sans-serif',
          lineHeight: variant === "compact" ? "12px" : "14px",
        }}
      >
        No delay
      </Typography>
    )
  }

  if (!hasDelay && !showNoDelay) {
    return null
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        textAlign: "right",
      }}
    >
      <Typography
        sx={{
          fontSize: variant === "compact" ? "10px" : "11px",
          color: "#E94335",
          fontWeight: 600,
          fontFamily: '"Google Sans", Roboto, sans-serif',
          lineHeight: variant === "compact" ? "12px" : "14px",
        }}
      >
        {delayPercentage.toFixed(1)}%
      </Typography>
      <Typography
        sx={{
          fontSize: variant === "compact" ? "9px" : "10px",
          color: "#E94335",
          fontWeight: 500,
          fontFamily: '"Google Sans", Roboto, sans-serif',
          lineHeight: variant === "compact" ? "11px" : "12px",
          opacity: 0.8,
        }}
      >
        (+{formatDuration(delayTime)})
      </Typography>
    </Box>
  )
}

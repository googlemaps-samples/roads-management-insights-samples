// Copyright 2026 Google LLC
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

import { ChevronLeft, ChevronRight } from "@mui/icons-material"
import { Box } from "@mui/material"
import React from "react"

interface FloatingSheetProps {
  children: React.ReactNode
  isExpanded: boolean
  onToggle: () => void
  width?: number
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
}

const FloatingSheet: React.FC<FloatingSheetProps> = ({
  children,
  isExpanded,
  onToggle,
  width = 360,
  className,
  style,
  disabled = false,
}) => {
  return (
    <Box
      className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white flex transition-all duration-300 ${className || ""}`}
      style={{
        width: `${width}px`,
        fontFamily: "'Google Sans', 'Roboto', sans-serif",
        transform: isExpanded ? "translateX(0)" : "translateX(calc(-100%))",
        ...style,
      }}
    >
      {/* Main Panel */}
      <Box
        className="h-full flex flex-col border-r border-gray-200 bg-white"
        sx={{
          width: `${width}px`,
          boxShadow:
            "0 4px 16px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1)",
          position: "relative",
          zIndex: 1000,
        }}
      >
        {children}
      </Box>

      {/* Toggle Button */}
      <Box
        className={`absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2 bg-white border border-l-0 border-b-0 border-t-0 border-gray-300 rounded-r-lg flex items-center justify-center transition-all duration-200 z-[999] pl-4 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        onClick={disabled ? undefined : onToggle}
        sx={{
          width: 40, // w-10 = 40px
          height: 64, // h-16 = 64px
          boxShadow: isExpanded
            ? "0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08)"
            : "0 4px 16px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.15), 0 0 0 2px rgba(66, 133, 244, 0.1)",
          backgroundColor: isExpanded ? "#ffffff" : "#f8f9fa",
          opacity: disabled ? 0.5 : 1,
          "&:hover": disabled
            ? {}
            : {
                backgroundColor: isExpanded ? "#f8f9fa" : "#ffffff",
                boxShadow: isExpanded
                  ? "0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.1)"
                  : "0 6px 20px rgba(0, 0, 0, 0.25), 0 3px 10px rgba(0, 0, 0, 0.2), 0 0 0 3px rgba(66, 133, 244, 0.15)",
              },
        }}
      >
        {isExpanded ? (
          <ChevronLeft
            className="text-gray-600"
            sx={{
              fontSize: 20,
              transition: "transform 0.2s ease",
            }}
          />
        ) : (
          <ChevronRight
            className="text-gray-700"
            sx={{
              fontSize: 22,
              fontWeight: 600,
              transition: "transform 0.2s ease",
            }}
          />
        )}
      </Box>
    </Box>
  )
}

export default FloatingSheet

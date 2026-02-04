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
import React, { ReactNode } from "react"

interface CongestionListProps {
  title?: string
  children: ReactNode
  maxHeight?: string
  variant?: "default" | "live-alert"
}

export const CongestionList = React.forwardRef<
  HTMLDivElement,
  CongestionListProps
>(({ children }, ref) => {
  return (
    <Box
      ref={ref}
      sx={{
        maxHeight: "calc(100vh - 120px - 1.5rem - 100px - 2rem)",
        overflow: "auto",
        padding: "16px",
      }}
    >
      {children}
    </Box>
  )
})

interface CongestionListItemProps {
  children: ReactNode
  isLast?: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  hoverEffect?: boolean
  variant?: "default" | "live-alert"
  isSelected?: boolean
  isHovered?: boolean
  index?: number
  "data-polygon-name"?: string
}

export const CongestionListItem: React.FC<CongestionListItemProps> = ({
  children,
  isLast = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  hoverEffect = true,
  variant = "default",
  isSelected = false,
  isHovered = false,
  index = 0,
  "data-polygon-name": dataPolygonName,
}) => {
  const isLiveAlert = variant === "live-alert"

  return (
    <Box
      sx={{
        p: 1.5,
        mb: isLiveAlert ? (isLast ? 0 : 2) : isLast ? 0 : 0.5,
        backgroundColor: isLiveAlert
          ? isSelected
            ? "#e8f0fe"
            : isHovered
              ? "#e8f0fe"
              : "#f8f9fa"
          : "transparent",
        borderRadius: isLiveAlert ? "16px" : "8px",
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        zIndex: 1,
        opacity: isLiveAlert ? 0 : 1,
        animation: isLiveAlert ? "fadeIn 0.4s ease-out forwards" : "none",
        animationDelay: isLiveAlert ? `${index * 0.1}s` : "0s",
        boxShadow: isLiveAlert
          ? isSelected
            ? "none"
            : "0 2px 8px rgba(0, 0, 0, 0.08)"
          : "none",
        border: isLiveAlert
          ? isSelected
            ? "none"
            : "1px solid #e8eaed"
          : "1px solid #f1f3f4",
        borderTop: isLiveAlert
          ? isSelected
            ? "none"
            : "2px solid #e8eaed"
          : "1px solid #f1f3f4",
        outline: isLiveAlert && isSelected ? "1px solid #1a73e8" : "none",
        outlineOffset: isLiveAlert && isSelected ? "1px" : "0px",
        borderBottom: isLiveAlert
          ? "none"
          : isLast
            ? "none"
            : "1px solid #f1f3f4",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        ...(isLiveAlert && {
          "&:hover": {
            backgroundColor: "#e8f0fe",
            boxShadow: isSelected ? "none" : "0 4px 16px rgba(0, 0, 0, 0.12)",
            zIndex: 2,
          },
        }),
        ...(!isLiveAlert &&
          hoverEffect &&
          onClick && {
            "&:hover": {
              backgroundColor: "#f8f9fa",
              transform: "translateY(-1px)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
              "& .route-name": {
                color: "#1a73e8",
              },
            },
          }),
        "@keyframes fadeIn": {
          from: {
            opacity: 0,
            transform: "translateY(8px)",
          },
          to: {
            opacity: 1,
            transform: "translateY(0)",
          },
        },
      }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={isLiveAlert ? isSelected : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-polygon-name={dataPolygonName}
    >
      {children}
    </Box>
  )
}

interface CongestionItemContentProps {
  children: ReactNode
  variant?: "default" | "live-alert"
}

export const CongestionItemContent: React.FC<CongestionItemContentProps> = ({
  children,
  variant = "default",
}) => {
  if (variant === "live-alert") {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
          marginBottom: "0px",
        }}
      >
        {children}
      </Box>
    )
  }

  return (
    <>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
        }}
      >
        {children}
      </Box>
    </>
  )
}

interface CongestionIconProps {
  color: string
  size?: number
  variant?: "default" | "live-alert"
}

export const CongestionIcon: React.FC<CongestionIconProps> = ({
  color,
  size = 12,
  variant = "default",
}) => {
  if (variant === "live-alert") {
    return (
      <Box
        sx={{
          position: "relative",
          width: "24px",
          height: "24px",
        }}
      >
        {/* Pulsating outer ring */}
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            backgroundColor: "rgba(233, 67, 53, 0.3)",
            animation: "pulse 2s infinite",
            "@keyframes pulse": {
              "0%": {
                transform: "scale(1)",
                opacity: 1,
              },
              "50%": {
                transform: "scale(1.5)",
                opacity: 0.5,
              },
              "100%": {
                transform: "scale(1)",
                opacity: 1,
              },
            },
          }}
        />
        {/* Alert marker center */}
        <Box
          sx={{
            position: "absolute",
            top: "4px",
            left: "4px",
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            backgroundColor: color,
            border: "2px solid #ffffff",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
          }}
        />
      </Box>
    )
  }

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
      }}
    />
  )
}

interface CongestionTextProps {
  primary: string
  secondary?: string
  className?: string
  variant?: "default" | "live-alert"
}

export const CongestionText: React.FC<CongestionTextProps> = ({
  primary,
  secondary,
  className,
  variant = "default",
}) => {
  if (variant === "live-alert") {
    return (
      <Typography
        sx={{
          fontSize: "14px",
          fontWeight: 500,
          color: "#202124",
          fontFamily: '"Google Sans", Roboto, sans-serif',
          lineHeight: "18px",
        }}
      >
        {primary}
        <br />
        <span
          style={{
            fontWeight: 600,
            fontSize: "10px",
            color: "#5f6368",
          }}
        >
          {secondary}
        </span>
      </Typography>
    )
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 0.25,
      }}
    >
      <Typography
        className={className}
        sx={{
          fontSize: "14px",
          color: "#202124",
          fontWeight: 500,
          fontFamily: '"Google Sans", Roboto, Arial, sans-serif',
          transition: "color 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
          letterSpacing: "0.1px",
        }}
      >
        {primary}
      </Typography>
      {secondary && (
        <Typography
          sx={{
            fontSize: "11px",
            color: "#5f6368",
            fontWeight: 400,
            fontFamily: '"Google Sans", Roboto, Arial, sans-serif',
            lineHeight: "14px",
          }}
        >
          {secondary}
        </Typography>
      )}
    </Box>
  )
}

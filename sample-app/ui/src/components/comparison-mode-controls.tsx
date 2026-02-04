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

import CloseIcon from "@mui/icons-material/Close"
import { Box, List, ListItem, Popover, styled, useTheme } from "@mui/material"
import React, { useState } from "react"

import { useAppStore } from "../store"

const ComparisonModeFloatingButton = styled("button")(({ theme }) => ({
  position: "relative", // Changed from fixed to relative since container handles positioning
  padding: "12px 20px",
  borderRadius: "20px",
  background: `linear-gradient(135deg, ${theme.palette.google.blue} 0%, #1a73e8 100%)`,
  color: "white",
  fontSize: "12px",
  fontWeight: 600,
  fontFamily: '"Google Sans", Roboto, sans-serif',
  cursor: "pointer",
  transition: "all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "48px",
  boxShadow: "0 8px 24px rgba(26, 115, 232, 0.25), 0 4px 12px rgba(0,0,0,0.1)",
  border: "1px solid rgba(255, 255, 255, 0.3)",
  zIndex: 998,
  backdropFilter: "blur(8px)",
  "&:before": {
    content: '""',
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: "20px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 100%)",
    opacity: 0,
    transition: "opacity 0.3s ease",
  },
  "&:hover": {
    background: `linear-gradient(135deg, #1a73e8 0%, #1557b0 100%)`,
    transform: "translateY(-2px)",
    boxShadow:
      "0 12px 32px rgba(26, 115, 232, 0.35), 0 6px 16px rgba(0,0,0,0.15)",
    "&:before": {
      opacity: 1,
    },
  },
  "&:active": {
    transform: "translateY(-1px)",
    boxShadow:
      "0 6px 20px rgba(26, 115, 232, 0.3), 0 3px 12px rgba(0,0,0,0.12)",
  },
  "@media (max-width: 768px)": {
    padding: "10px 20px",
    fontSize: "12px",
    minHeight: "40px",
  },
}))

const ComparisonModeItemButton = styled("button")({})

const ButtonContainer = styled("div")(() => ({
  position: "fixed",
  right: "1.5rem",
  top: "calc(64px + 1.5rem)", // Header height + spacing
  display: "flex",
  alignItems: "center",
  gap: "8px", // Space between buttons
  zIndex: 998,
  "@media (max-width: 768px)": {
    right: "0.5rem",
    top: "calc(64px + 0.5rem)",
  },
}))

const ExitComparisonButton = styled("button")(() => ({
  position: "relative", // Changed from fixed to relative since container handles positioning
  padding: "8px",
  borderRadius: "50%", // Make it completely circular
  background: "linear-gradient(135deg, #e94437 0%, #d33426 100%)",
  color: "white",
  fontSize: "12px",
  fontWeight: 600,
  fontFamily: '"Google Sans", Roboto, sans-serif',
  cursor: "pointer",
  transition: "all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "36px", // Fixed smaller size
  width: "36px", // Fixed smaller size
  boxShadow: "0 6px 16px rgba(233, 68, 55, 0.25), 0 3px 8px rgba(0,0,0,0.1)",
  border: "1px solid rgba(255, 255, 255, 0.3)",
  zIndex: 998,
  backdropFilter: "blur(8px)",
  "&:before": {
    content: '""',
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: "50%", // Make pseudo-element circular too
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 100%)",
    opacity: 0,
    transition: "opacity 0.3s ease",
  },
  "&:hover": {
    background: "linear-gradient(135deg, #d33426 0%, #b71c1c 100%)",
    transform: "translateY(-2px) scale(1.05)",
    boxShadow:
      "0 8px 24px rgba(233, 68, 55, 0.35), 0 4px 12px rgba(0,0,0,0.15)",
    "&:before": {
      opacity: 1,
    },
  },
  "&:active": {
    transform: "translateY(-1px) scale(1.02)",
    boxShadow: "0 4px 16px rgba(233, 68, 55, 0.3), 0 2px 8px rgba(0,0,0,0.12)",
  },
  "@media (max-width: 768px)": {
    height: "32px",
    width: "32px",
  },
}))

const ComparisonModeControls = React.memo(() => {
  const usecase = useAppStore((state) => state.usecase)
  const isComparisonMode = useAppStore((state) => state.isComparisonMode)
  const activeComparisonShortcut = useAppStore(
    (state) => state.activeComparisonShortcut,
  )
  const applyComparisonShortcut = useAppStore(
    (state) => state.applyComparisonShortcut,
  )
  const clearComparisonMode = useAppStore((state) => state.clearComparisonMode)

  const [controlsAnchor, setControlsAnchor] = useState<HTMLElement | null>(null)
  const [localActiveComparisonShortcut, setLocalActiveComparisonShortcut] =
    useState<"weekdays-vs-weekends" | "last-week-vs-this-week" | null>(
      activeComparisonShortcut,
    )
  const [localIsExiting, setLocalIsExiting] = useState(false)
  const theme = useTheme()

  React.useEffect(() => {
    setLocalActiveComparisonShortcut(activeComparisonShortcut)
  }, [activeComparisonShortcut])

  React.useEffect(() => {
    if (!isComparisonMode) {
      setLocalIsExiting(false)
    }
  }, [isComparisonMode])

  const handleComparisonShortcut = (
    shortcut: "weekdays-vs-weekends" | "last-week-vs-this-week",
  ) => {
    setLocalActiveComparisonShortcut(shortcut)

    setControlsAnchor(null)

    applyComparisonShortcut(shortcut)
  }

  const handleExitComparison = () => {
    setControlsAnchor(null)

    setLocalActiveComparisonShortcut(null)
    setLocalIsExiting(true)

    clearComparisonMode()
  }

  const handleControlsClick = (event: React.MouseEvent<HTMLElement>) => {
    setControlsAnchor(event.currentTarget)
  }

  const handleControlsClose = () => {
    setControlsAnchor(null)
  }

  const getButtonText = () => {
    if (!localActiveComparisonShortcut) {
      return "Comparison Mode"
    }
    switch (localActiveComparisonShortcut) {
      case "weekdays-vs-weekends":
        return "Weekdays vs Weekends"
      case "last-week-vs-this-week":
        return "Last Week vs This Week"
      default:
        return "Comparison Mode"
    }
  }

  if (usecase !== "route-reliability" || !isComparisonMode || localIsExiting) {
    return null
  }

  return (
    <ButtonContainer>
      <ComparisonModeFloatingButton onClick={handleControlsClick}>
        <span
          style={{
            whiteSpace: "nowrap",
            letterSpacing: "0.5px",
            textShadow: "0 1px 2px rgba(0,0,0,0.1)",
            position: "relative",
            zIndex: 1,
          }}
        >
          {getButtonText()}
        </span>
      </ComparisonModeFloatingButton>

      <ExitComparisonButton onClick={handleExitComparison}>
        <CloseIcon
          sx={{
            fontSize: "16px",
            color: "white",
            position: "relative",
            zIndex: 1,
          }}
        />
      </ExitComparisonButton>

      {/* Comparison Mode Controls Popover */}
      <Popover
        open={Boolean(controlsAnchor)}
        anchorEl={controlsAnchor}
        onClose={handleControlsClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          sx: {
            mt: 1,
            width: "fit-content",
            minWidth: "180px",
            borderRadius: "14px",
            boxShadow:
              "0 8px 32px rgba(0,0,0,0.1), 0 2px 12px rgba(0,0,0,0.06)",
            border: "1px solid rgba(255, 255, 255, 0.9)",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(16px)",
            overflow: "hidden",
            position: "relative",
            "&::before": {
              content: '""',
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "1px",
              background:
                "linear-gradient(90deg, transparent, rgba(26, 115, 232, 0.15), transparent)",
            },
          },
        }}
      >
        <List
          sx={{
            p: "8px",
            gap: "6px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <ListItem disablePadding sx={{ width: "auto" }}>
            <ComparisonModeItemButton
              onPointerDown={() => {
                handleComparisonShortcut("weekdays-vs-weekends")
              }}
              sx={{
                py: 1,
                px: 2,
                fontSize: "11px",
                borderRadius: "20px",
                backgroundColor:
                  localActiveComparisonShortcut === "weekdays-vs-weekends"
                    ? "#1a73e8 !important"
                    : "rgba(248, 249, 250, 0.98)",
                color:
                  localActiveComparisonShortcut === "weekdays-vs-weekends"
                    ? "#ffffff !important"
                    : "#1a1a1a !important",
                border:
                  localActiveComparisonShortcut === "weekdays-vs-weekends"
                    ? "none"
                    : "1px solid rgba(218, 220, 224, 0.9)",
                fontWeight:
                  localActiveComparisonShortcut === "weekdays-vs-weekends"
                    ? 600
                    : 500,
                boxShadow:
                  localActiveComparisonShortcut === "weekdays-vs-weekends"
                    ? "0 3px 12px rgba(26, 115, 232, 0.2), 0 1px 6px rgba(0,0,0,0.06)"
                    : "0 1px 3px rgba(0,0,0,0.04)",
                position: "relative",
                overflow: "hidden",
                width: "fit-content",
                minWidth: "140px",
                cursor: "pointer",
                "&:hover": {
                  backgroundColor:
                    localActiveComparisonShortcut === "weekdays-vs-weekends"
                      ? "#1557b0 !important"
                      : "rgba(240, 242, 247, 0.98)",
                  boxShadow:
                    localActiveComparisonShortcut === "weekdays-vs-weekends"
                      ? "0 6px 20px rgba(26, 115, 232, 0.3), 0 3px 10px rgba(0,0,0,0.12)"
                      : "0 4px 12px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.03)",
                  border:
                    localActiveComparisonShortcut === "weekdays-vs-weekends"
                      ? "none"
                      : `1px solid ${theme.palette.google.blue}25`,
                },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <Box
                  sx={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor:
                      localActiveComparisonShortcut === "weekdays-vs-weekends"
                        ? "rgba(255, 255, 255, 0.9)"
                        : theme.palette.google.blue,
                    boxShadow:
                      localActiveComparisonShortcut === "weekdays-vs-weekends"
                        ? "0 1px 3px rgba(0,0,0,0.1)"
                        : "0 1px 2px rgba(26, 115, 232, 0.2)",
                    border:
                      localActiveComparisonShortcut === "weekdays-vs-weekends"
                        ? "1px solid rgba(255, 255, 255, 0.2)"
                        : "1px solid rgba(26, 115, 232, 0.1)",
                  }}
                />
                <Box
                  sx={{
                    fontSize: "11px",
                    fontWeight: "inherit",
                    lineHeight: 1.1,
                    whiteSpace: "nowrap",
                  }}
                >
                  Weekdays vs Weekends
                </Box>
              </Box>
            </ComparisonModeItemButton>
          </ListItem>
          <ListItem disablePadding sx={{ width: "auto" }}>
            <ComparisonModeItemButton
              onPointerDown={() => {
                handleComparisonShortcut("last-week-vs-this-week")
              }}
              sx={{
                py: 1,
                px: 2,
                fontSize: "11px",
                borderRadius: "20px",
                backgroundColor:
                  localActiveComparisonShortcut === "last-week-vs-this-week"
                    ? "#1a73e8 !important"
                    : "rgba(248, 249, 250, 0.98)",
                color:
                  localActiveComparisonShortcut === "last-week-vs-this-week"
                    ? "#ffffff !important"
                    : "#1a1a1a !important",
                border:
                  localActiveComparisonShortcut === "last-week-vs-this-week"
                    ? "none"
                    : "1px solid rgba(218, 220, 224, 0.9)",
                fontWeight:
                  localActiveComparisonShortcut === "last-week-vs-this-week"
                    ? 600
                    : 500,
                boxShadow:
                  localActiveComparisonShortcut === "last-week-vs-this-week"
                    ? "0 3px 12px rgba(26, 115, 232, 0.2), 0 1px 6px rgba(0,0,0,0.06)"
                    : "0 1px 3px rgba(0,0,0,0.04)",
                position: "relative",
                overflow: "hidden",
                width: "fit-content",
                minWidth: "140px",
                cursor: "pointer",
                "&:hover": {
                  backgroundColor:
                    localActiveComparisonShortcut === "last-week-vs-this-week"
                      ? "#1557b0 !important"
                      : "rgba(240, 242, 247, 0.98)",
                  boxShadow:
                    localActiveComparisonShortcut === "last-week-vs-this-week"
                      ? "0 6px 20px rgba(26, 115, 232, 0.3), 0 3px 10px rgba(0,0,0,0.12)"
                      : "0 4px 12px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.03)",
                  border:
                    localActiveComparisonShortcut === "last-week-vs-this-week"
                      ? "none"
                      : `1px solid ${theme.palette.google.blue}25`,
                },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <Box
                  sx={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor:
                      localActiveComparisonShortcut === "last-week-vs-this-week"
                        ? "rgba(255, 255, 255, 0.9)"
                        : theme.palette.google.blue,
                    boxShadow:
                      localActiveComparisonShortcut === "last-week-vs-this-week"
                        ? "0 1px 3px rgba(0,0,0,0.1)"
                        : "0 1px 2px rgba(26, 115, 232, 0.2)",
                    border:
                      localActiveComparisonShortcut === "last-week-vs-this-week"
                        ? "1px solid rgba(255, 255, 255, 0.2)"
                        : "1px solid rgba(26, 115, 232, 0.1)",
                  }}
                />
                <Box
                  sx={{
                    fontSize: "11px",
                    fontWeight: "inherit",
                    lineHeight: 1.1,
                    whiteSpace: "nowrap",
                  }}
                >
                  Last Week vs This Week
                </Box>
              </Box>
            </ComparisonModeItemButton>
          </ListItem>
        </List>
      </Popover>
    </ButtonContainer>
  )
})

export default ComparisonModeControls

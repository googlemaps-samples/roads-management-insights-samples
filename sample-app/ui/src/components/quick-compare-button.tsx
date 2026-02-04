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

import { Box, List, ListItem, Popover, styled, useTheme } from "@mui/material"
import React, { startTransition, useState } from "react"

import { useAppStore } from "../store"

const QuickCompareFloatingButton = styled("button")(({ theme }) => ({
  position: "fixed",
  right: "1.5rem",
  top: "calc(64px + 1.5rem)", // Header height + spacing
  padding: "12px 20px",
  borderRadius: "12px",
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
    borderRadius: "12px",
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
    right: "0.5rem",
    top: "calc(64px + 0.5rem)",
    padding: "10px 20px",
    fontSize: "12px",
    minHeight: "40px",
  },
}))

const QuickCompareItemButton = styled("button")({})

const QuickCompareButton = React.memo(() => {
  const usecase = useAppStore((state) => state.usecase)
  const isComparisonMode = useAppStore((state) => state.isComparisonMode)
  const activeComparisonShortcut = useAppStore(
    (state) => state.activeComparisonShortcut,
  )
  const applyComparisonShortcut = useAppStore(
    (state) => state.applyComparisonShortcut,
  )

  const [quickCompareAnchor, setQuickCompareAnchor] =
    useState<HTMLElement | null>(null)
  const theme = useTheme()

  const handleComparisonShortcut = (
    shortcut: "weekdays-vs-weekends" | "last-week-vs-this-week",
  ) => {
    setQuickCompareAnchor(null) // Close popover after selection
    startTransition(() => {
      applyComparisonShortcut(shortcut)
    })
  }

  const handleQuickCompareClick = (event: React.MouseEvent<HTMLElement>) => {
    setQuickCompareAnchor(event.currentTarget)
  }

  const handleQuickCompareClose = () => {
    setQuickCompareAnchor(null)
  }

  // Only show for route-reliability use case when not in comparison mode
  if (usecase !== "route-reliability" || isComparisonMode) {
    return null
  }

  return (
    <>
      <QuickCompareFloatingButton onClick={handleQuickCompareClick}>
        <span
          style={{
            whiteSpace: "nowrap",
            letterSpacing: "0.5px",
            textShadow: "0 1px 2px rgba(0,0,0,0.1)",
            position: "relative",
            zIndex: 1,
          }}
        >
          Quick Compare
        </span>
      </QuickCompareFloatingButton>

      {/* Quick Compare Popover */}
      <Popover
        open={Boolean(quickCompareAnchor)}
        anchorEl={quickCompareAnchor}
        onClose={handleQuickCompareClose}
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
            <QuickCompareItemButton
              onPointerDown={() => {
                handleComparisonShortcut("weekdays-vs-weekends")
              }}
              sx={{
                py: 1,
                px: 2,
                fontSize: "11px",
                borderRadius: "10px",
                backgroundColor:
                  activeComparisonShortcut === "weekdays-vs-weekends"
                    ? `linear-gradient(135deg, ${theme.palette.google.blue} 0%, #1a73e8 100%)`
                    : "rgba(248, 249, 250, 0.6)",
                color:
                  activeComparisonShortcut === "weekdays-vs-weekends"
                    ? "#ffffff"
                    : "#374151",
                border:
                  activeComparisonShortcut === "weekdays-vs-weekends"
                    ? "none"
                    : "1px solid rgba(229, 231, 235, 0.6)",
                fontWeight:
                  activeComparisonShortcut === "weekdays-vs-weekends"
                    ? 600
                    : 500,
                // transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow:
                  activeComparisonShortcut === "weekdays-vs-weekends"
                    ? "0 3px 12px rgba(26, 115, 232, 0.2), 0 1px 6px rgba(0,0,0,0.06)"
                    : "0 1px 3px rgba(0,0,0,0.04)",
                position: "relative",
                overflow: "hidden",
                width: "fit-content",
                minWidth: "140px",
                // "&::before": {
                //   content: '""',
                //   position: "absolute",
                //   top: 0,
                //   left: 0,
                //   right: 0,
                //   bottom: 0,
                //   background:
                //     activeComparisonShortcut === "weekdays-vs-weekends"
                //       ? "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)"
                //       : "linear-gradient(135deg, rgba(26, 115, 232, 0.03) 0%, rgba(26, 115, 232, 0.01) 100%)",
                //   opacity:
                //     activeComparisonShortcut === "weekdays-vs-weekends" ? 1 : 0,
                //   transition: "opacity 0.3s ease",
                // },
                "&:hover": {
                  backgroundColor:
                    activeComparisonShortcut === "weekdays-vs-weekends"
                      ? "linear-gradient(135deg, #1a73e8 0%, #1557b0 100%)"
                      : "rgba(248, 249, 250, 0.8)",
                  // transform: "translateY(-2px) scale(1.01)",
                  boxShadow:
                    activeComparisonShortcut === "weekdays-vs-weekends"
                      ? "0 6px 20px rgba(26, 115, 232, 0.3), 0 3px 10px rgba(0,0,0,0.12)"
                      : "0 4px 12px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.03)",
                  border:
                    activeComparisonShortcut === "weekdays-vs-weekends"
                      ? "none"
                      : `1px solid ${theme.palette.google.blue}25`,
                  // "&::before": {
                  //   opacity: 1,
                  // },
                },
                // "&:active": {
                //   transform: "translateY(-1px) scale(1.005)",
                // },
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
                      activeComparisonShortcut === "weekdays-vs-weekends"
                        ? "rgba(255, 255, 255, 0.9)"
                        : theme.palette.google.blue,
                    // transition: "all 0.3s ease",
                    boxShadow:
                      activeComparisonShortcut === "weekdays-vs-weekends"
                        ? "0 1px 3px rgba(0,0,0,0.1)"
                        : "0 1px 2px rgba(26, 115, 232, 0.2)",
                    border:
                      activeComparisonShortcut === "weekdays-vs-weekends"
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
            </QuickCompareItemButton>
          </ListItem>
          <ListItem disablePadding sx={{ width: "auto" }}>
            <QuickCompareItemButton
              onPointerDown={() => {
                handleComparisonShortcut("last-week-vs-this-week")
              }}
              sx={{
                py: 1,
                px: 2,
                fontSize: "11px",
                borderRadius: "10px",
                backgroundColor:
                  activeComparisonShortcut === "last-week-vs-this-week"
                    ? `linear-gradient(135deg, ${theme.palette.google.blue} 0%, #1a73e8 100%)`
                    : "rgba(248, 249, 250, 0.6)",
                color:
                  activeComparisonShortcut === "last-week-vs-this-week"
                    ? "#ffffff"
                    : "#374151",
                border:
                  activeComparisonShortcut === "last-week-vs-this-week"
                    ? "none"
                    : "1px solid rgba(229, 231, 235, 0.6)",
                fontWeight:
                  activeComparisonShortcut === "last-week-vs-this-week"
                    ? 600
                    : 500,
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow:
                  activeComparisonShortcut === "last-week-vs-this-week"
                    ? "0 3px 12px rgba(26, 115, 232, 0.2), 0 1px 6px rgba(0,0,0,0.06)"
                    : "0 1px 3px rgba(0,0,0,0.04)",
                position: "relative",
                overflow: "hidden",
                width: "fit-content",
                minWidth: "140px",
                // "&::before": {
                //   content: '""',
                //   position: "absolute",
                //   top: 0,
                //   left: 0,
                //   right: 0,
                //   bottom: 0,
                //   background:
                //     activeComparisonShortcut === "last-week-vs-this-week"
                //       ? "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)"
                //       : "linear-gradient(135deg, rgba(26, 115, 232, 0.03) 0%, rgba(26, 115, 232, 0.01) 100%)",
                //   opacity:
                //     activeComparisonShortcut === "last-week-vs-this-week"
                //       ? 1
                //       : 0,
                //   transition: "opacity 0.3s ease",
                // },
                "&:hover": {
                  backgroundColor:
                    activeComparisonShortcut === "last-week-vs-this-week"
                      ? "linear-gradient(135deg, #1a73e8 0%, #1557b0 100%)"
                      : "rgba(248, 249, 250, 0.8)",
                  // transform: "translateY(-2px) scale(1.01)",
                  boxShadow:
                    activeComparisonShortcut === "last-week-vs-this-week"
                      ? "0 6px 20px rgba(26, 115, 232, 0.3), 0 3px 10px rgba(0,0,0,0.12)"
                      : "0 4px 12px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.03)",
                  border:
                    activeComparisonShortcut === "last-week-vs-this-week"
                      ? "none"
                      : `1px solid ${theme.palette.google.blue}25`,
                  // "&::before": {
                  //   opacity: 1,
                  // },
                },
                // "&:active": {
                //   transform: "translateY(-1px) scale(1.005)",
                // },
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
                      activeComparisonShortcut === "last-week-vs-this-week"
                        ? "rgba(255, 255, 255, 0.9)"
                        : theme.palette.google.blue,
                    transition: "all 0.3s ease",
                    boxShadow:
                      activeComparisonShortcut === "last-week-vs-this-week"
                        ? "0 1px 3px rgba(0,0,0,0.1)"
                        : "0 1px 2px rgba(26, 115, 232, 0.2)",
                    border:
                      activeComparisonShortcut === "last-week-vs-this-week"
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
            </QuickCompareItemButton>
          </ListItem>
        </List>
      </Popover>
    </>
  )
})

export default QuickCompareButton

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

import {
  ChevronLeft,
  ChevronRight,
  Home,
  UnfoldLess,
  UnfoldMore,
} from "@mui/icons-material"
import { Box, Card, IconButton, Typography } from "@mui/material"
import { styled } from "@mui/material/styles"
import { useMemo } from "react"
import { useNavigate } from "react-router-dom"

import { useAppStore } from "../store"
import { Usecase } from "../types/common"
import DataAnalyticsContent from "./data-analytics-content"
import RealtimeMonitoringContent from "./realtime-monitoring-content"
import RouteReliabilityContent from "./route-reliability-content"

const FloatingContainer = styled(Box)({
  position: "fixed",
  bottom: "1.5rem",
  left: "1.5rem",
  width: "360px",
  zIndex: 11,
  "@media (max-width: 768px)": {
    left: "0.5rem",
    bottom: "0.5rem",
    width: "calc(100vw - 1rem)",
  },
  pointerEvents: "auto",
})

const MainCard = styled(Card)<{ isCollapsed: boolean }>(() => ({
  width: "360px",
  backgroundColor: "transparent",
  borderRadius: "16px",
  border: "none",
  overflow: "visible",
  display: "flex",
  flexDirection: "column",
  transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
  position: "relative",
  height: "auto",
  minHeight: "64px",
  transform: "scale(1)",
  opacity: 1,
}))

const ContentContainer = styled(Box)<{ isCollapsed: boolean }>(
  ({ isCollapsed }) => ({
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
    position: "relative",
    height: isCollapsed ? "0px" : "calc(100vh - 48px - 8rem - 65px)",
    minHeight: "0px",
    opacity: isCollapsed ? 0 : 1,
  }),
)

const CardHeader = styled(Box)<{ isCollapsed: boolean }>(({ isCollapsed }) => ({
  padding: "20px 24px 16px 24px",
  borderBottom: "1px solid #e8eaed",
  backgroundColor: "#ffffff",
  borderTopLeftRadius: "16px",
  borderTopRightRadius: "16px",
  opacity: isCollapsed ? 0 : 1,
  transform: isCollapsed ? "translateY(-10px)" : "translateY(0)",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  transitionDelay: isCollapsed ? "0s" : "0.1s",
}))

const CardBody = styled(Box)<{ isCollapsed: boolean }>(({ isCollapsed }) => ({
  flex: 1,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  height: "100%",
  paddingBottom: "64px",
  opacity: isCollapsed ? 0 : 1,
  transform: isCollapsed ? "translateY(-20px)" : "translateY(0)",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  transitionDelay: isCollapsed ? "0s" : "0.15s",
}))

const ScrollableContent = styled(Box)({
  flex: 1,
  overflow: "auto",
  padding: "16px 24px",
  paddingBottom: "16px", // Reduced padding to minimize white space
  height: "100%",
  "&::-webkit-scrollbar": {
    width: "4px",
  },
  "&::-webkit-scrollbar-track": {
    backgroundColor: "#f8f9fa",
    borderRadius: "2px",
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "#dadce0",
    borderRadius: "2px",
    "&:hover": {
      backgroundColor: "#bdc1c6",
    },
  },
})

const NavigationBar = styled(Box)<{ isCollapsed?: boolean }>(
  ({ isCollapsed }) => ({
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 24px",
    backgroundColor: "#4285F4",
    borderRadius: isCollapsed ? "16px" : "0 0 16px 16px",
    boxShadow: isCollapsed
      ? "0 8px 28px 0 rgba(60, 64, 67, 0.24), 0 4px 12px 0 rgba(60, 64, 67, 0.12)"
      : "none",
    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
    minHeight: "64px",
    flexShrink: 0,
    transform: "scale(1)",
    zIndex: 1,
  }),
)

const NavigationControls = styled(Box)({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexShrink: 0,
})

const HomeButton = styled(IconButton)({
  width: "32px",
  height: "32px",
  backgroundColor: "transparent",
  border: "none",
  color: "#ffffff",
  borderRadius: "8px",
  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  "&:hover": {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    transform: "translateY(-1px) scale(1.05)",
    boxShadow: "0 4px 8px rgba(255, 255, 255, 0.2)",
  },
  "&:active": {
    transform: "translateY(0) scale(1.02)",
    transition: "all 0.1s cubic-bezier(0.4, 0, 0.2, 1)",
  },
})

const CollapseButton = styled(IconButton)<{ disabled?: boolean }>(
  ({ disabled }) => ({
    width: "32px",
    height: "32px",
    backgroundColor: "transparent",
    border: "none",
    color: disabled ? "rgba(255, 255, 255, 0.4)" : "#ffffff",
    borderRadius: "8px",
    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
    cursor: disabled ? "not-allowed" : "pointer",
    "&:hover": {
      backgroundColor: disabled ? "transparent" : "rgba(255, 255, 255, 0.15)",
      transform: disabled ? "none" : "translateY(-1px) scale(1.05)",
      boxShadow: disabled ? "none" : "0 4px 8px rgba(255, 255, 255, 0.2)",
    },
    "&:active": {
      transform: disabled ? "none" : "translateY(0) scale(1.02)",
      transition: "all 0.1s cubic-bezier(0.4, 0, 0.2, 1)",
    },
    "& .MuiSvgIcon-root": {
      color: disabled ? "rgba(255, 255, 255, 0.4)" : "#ffffff",
    },
  }),
)

// All possible sections
const ALL_SECTIONS: Array<{
  key: Usecase
  title: string
  description: string
}> = [
  {
    key: "realtime-monitoring",
    title: "Real-Time Monitoring",
    description: "Get real-time information on traffic conditions",
  },
  {
    key: "data-analytics",
    title: "Data Analytics",
    description: "Get information on data analytics",
  },
  {
    key: "route-reliability",
    title: "Route Reliability Analysis",
    description: "Monitor and Improve Key Transportation Routes",
  },
]

const FloatingPanel = () => {
  const expandPanel = useAppStore((state) => state.expandPanel)
  const collapsePanel = useAppStore((state) => state.collapsePanel)
  const panels = useAppStore((state) => state.panels)
  const usecase = useAppStore((state) => state.usecase)
  const setUsecase = useAppStore((state) => state.setUsecase)
  const availableCities = useAppStore((state) => state.availableCities)

  // Filter sections to only show those that have at least one city supporting them
  const SECTIONS = useMemo(() => {
    const cities = Object.values(availableCities)

    // Skip if we only have the fallback city
    if (cities.length === 1 && cities[0]?.id === "fallback") {
      return []
    }

    const filteredSections = ALL_SECTIONS.filter((section) => {
      return cities.some((city) => city.useCases?.includes(section.key))
    })
    return filteredSections
  }, [availableCities])

  const isExpanded = panels.leftPanel
  const currentSectionIndex = SECTIONS.findIndex(
    (section) => section.key === usecase,
  )
  const currentSection = SECTIONS[currentSectionIndex] ||
    SECTIONS[0] || {
      key: "loading",
      title: "Loading...",
      description: "Loading available use cases",
    }
  const navigate = useNavigate()

  const handleHomeClick = () => {
    navigate("/")
  }

  const handleToggleExpanded = () => {
    if (panels.leftPanel) {
      collapsePanel("leftPanel")
    } else {
      expandPanel("leftPanel")
    }
  }

  const handlePrevUseCase = () => {
    if (SECTIONS.length === 0) return // Guard against empty sections
    const prevIndex =
      (currentSectionIndex - 1 + SECTIONS.length) % SECTIONS.length
    const prevSection = SECTIONS[prevIndex]
    if (prevSection) {
      setUsecase(prevSection.key as Usecase)
    }
  }

  const handleNextUseCase = () => {
    if (SECTIONS.length === 0) return // Guard against empty sections
    const nextIndex = (currentSectionIndex + 1) % SECTIONS.length
    const nextSection = SECTIONS[nextIndex]
    if (nextSection) {
      setUsecase(nextSection.key as Usecase)
    }
  }

  return (
    <FloatingContainer>
      <MainCard isCollapsed={!isExpanded}>
        <ContentContainer isCollapsed={!isExpanded}>
          <CardHeader isCollapsed={!isExpanded}>
            <Typography
              sx={{
                fontSize: "22px",
                fontWeight: 500,
                color: "#202124",
                lineHeight: 1.3,
                mb: 1,
                fontFamily: "Google Sans, sans-serif",
              }}
            >
              {currentSection.title}
            </Typography>
            <Typography
              sx={{
                fontSize: "12px",
                color: "#5f6368",
                fontWeight: 400,
                lineHeight: 1.4,
                fontFamily: "Google Sans, sans-serif",
              }}
            >
              {currentSection.description}
            </Typography>
          </CardHeader>

          <CardBody isCollapsed={!isExpanded}>
            <ScrollableContent>
              {usecase === "realtime-monitoring" ? (
                <RealtimeMonitoringContent />
              ) : usecase === "data-analytics" ? (
                <DataAnalyticsContent />
              ) : (
                <RouteReliabilityContent />
              )}
            </ScrollableContent>
          </CardBody>
        </ContentContainer>

        <NavigationBar isCollapsed={!isExpanded}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flex: 1,
              minWidth: 0,
            }}
          >
            {isExpanded ? (
              <HomeButton
                onClick={handleHomeClick}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  "&:hover": {
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                  },
                  width: "100%",
                  justifyContent: "flex-start",
                }}
              >
                <Home
                  sx={{
                    fontSize: 16,
                    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    "&:hover": {
                      transform: "scale(1.1)",
                      filter: "brightness(1.1)",
                    },
                  }}
                />
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#ffffff",
                    fontFamily: "Google Sans, sans-serif",
                    textTransform: "none",
                  }}
                >
                  Home
                </Typography>
              </HomeButton>
            ) : (
              <HomeButton
                onClick={handleToggleExpanded}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  "&:hover": {
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                  },
                  width: "100%",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#ffffff",
                    fontFamily: "Google Sans, sans-serif",
                    textTransform: "none",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "200px",
                  }}
                >
                  {currentSection.title}
                </Typography>
              </HomeButton>
            )}
          </Box>

          <NavigationControls>
            <>
              <CollapseButton
                onClick={handlePrevUseCase}
                disabled={SECTIONS.length === 0 || currentSectionIndex === 0}
              >
                <ChevronLeft
                  sx={{
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    "&:hover": {
                      transform: "scale(1.1)",
                      filter: "brightness(1.1)",
                    },
                  }}
                />
              </CollapseButton>
              <Typography
                sx={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#ffffff",
                  fontFamily: "Google Sans, sans-serif",
                  minWidth: "24px",
                  textAlign: "center",
                }}
              >
                {SECTIONS.length > 0
                  ? `${currentSectionIndex + 1}/${SECTIONS.length}`
                  : "0/0"}
              </Typography>
              <CollapseButton
                onClick={handleNextUseCase}
                disabled={
                  SECTIONS.length === 0 ||
                  currentSectionIndex === SECTIONS.length - 1
                }
              >
                <ChevronRight
                  sx={{
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    "&:hover": {
                      transform: "scale(1.1)",
                      filter: "brightness(1.1)",
                    },
                  }}
                />
              </CollapseButton>
            </>
            <CollapseButton onClick={handleToggleExpanded}>
              {isExpanded ? (
                <UnfoldLess
                  sx={{
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    "&:hover": {
                      transform: "scale(1.1) translateY(-1px)",
                      filter: "brightness(1.1)",
                    },
                  }}
                />
              ) : (
                <UnfoldMore
                  sx={{
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    "&:hover": {
                      transform: "scale(1.1) translateY(1px)",
                      filter: "brightness(1.1)",
                    },
                  }}
                />
              )}
            </CollapseButton>
          </NavigationControls>
        </NavigationBar>
      </MainCard>
    </FloatingContainer>
  )
}

export default FloatingPanel

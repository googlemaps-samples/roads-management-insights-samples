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

import { InfoOutlined } from "@mui/icons-material"
import { Box, Typography, styled } from "@mui/material"
import { useEffect, useState } from "react"

import { CustomTooltip } from "../../components/custom-tooltip"
import { SelectedRouteDetails } from "../../components/selected-route-details"
import { useAppStore } from "../../store"

// Interface for route delay data from historical stats
interface RouteDelayData {
  routeId: string
  delayTime: number
  delayRatio: number
  staticDuration: number
  averageDuration: number
  delayPercentage: number
  count: number
  peakCongestionHourRange: string
  peakCongestionLevel: number
}

const ScrollableContainer = styled(Box)({
  maxHeight: "calc(100vh - 120px - 1.5rem - 120px - 2rem)",
  overflow: "auto",
  padding: "4px",
  "&::-webkit-scrollbar": {
    width: "6px",
  },
  "&::-webkit-scrollbar-track": {
    backgroundColor: "transparent",
    margin: 0,
    padding: 0,
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: "#dadce0",
    borderRadius: "8px",
    margin: "2px",
    padding: 0,
    border: "1px solid transparent",
    backgroundClip: "content-box",
    minHeight: "40px",
    "&:hover": {
      backgroundColor: "#bdc1c6",
    },
    "&:active": {
      backgroundColor: "#9aa0a6",
    },
  },
  "&::-webkit-scrollbar-corner": {
    backgroundColor: "transparent",
  },
  // Firefox scrollbar styling
  scrollbarWidth: "thin",
  scrollbarColor: "#dadce0 transparent",
})

export const HistoricalContent = () => {
  const historicalData = useAppStore(
    (state) => state.queries.filteredHistoricalData.data,
  )
  const historicalStatus = useAppStore(
    (state) => state.queries.filteredHistoricalData.status,
  )
  const mode = useAppStore((state) => state.mode)
  const shouldUseGreyRoutes = useAppStore((state) => state.shouldUseGreyRoutes)
  const selectedRouteSegment = useAppStore(
    (state) => state.selectedRouteSegment,
  )
  const [shouldShowLoading, setShouldShowLoading] = useState(true)
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false)
  const setSelectedRouteId = useAppStore((state) => state.setSelectedRouteId)

  useEffect(() => {
    // Only show loading initially or when shouldUseGreyRoutes is true and we haven't loaded yet
    if (shouldUseGreyRoutes && !hasInitiallyLoaded) {
      setShouldShowLoading(
        historicalStatus === "pending" || historicalStatus === "loading",
      )
    } else if (hasInitiallyLoaded) {
      // Once we've initially loaded, don't show loading again
      setShouldShowLoading(false)
    }

    // Mark as initially loaded once we get success status
    if (historicalStatus === "success" && !hasInitiallyLoaded) {
      setHasInitiallyLoaded(true)
      setShouldShowLoading(false)
    }
  }, [shouldUseGreyRoutes, historicalStatus, hasInitiallyLoaded])
  if (shouldShowLoading) {
    return (
      <Box sx={{ padding: "16px" }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 4,
            px: 2,
          }}
        >
          <Box
            sx={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "#f1f3f4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 2,
              animation: "spin 1s linear infinite",
              "@keyframes spin": {
                "0%": { transform: "rotate(0deg)" },
                "100%": { transform: "rotate(360deg)" },
              },
            }}
          >
            <Box
              sx={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                backgroundColor: "#1a73e8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />
          </Box>
          <Typography
            sx={{
              fontSize: "14px",
              color: "#5f6368",
              textAlign: "center",
              fontFamily: '"Google Sans", Roboto, sans-serif',
              fontWeight: 500,
              mb: 0.5,
            }}
          >
            Loading historical data...
          </Typography>
        </Box>
      </Box>
    )
  }

  // If we have no historical data and we're not in loading state, return null
  if (!historicalData || !historicalData?.stats?.routeDelays) {
    // If we're in historical mode but have no data and not loading, show empty state
    if (mode === "historical") {
      return (
        <Box sx={{ padding: "16px" }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              py: 4,
              px: 2,
            }}
          >
            <Typography
              sx={{
                fontSize: "14px",
                color: "#5f6368",
                textAlign: "center",
                fontFamily: '"Google Sans", Roboto, sans-serif',
                fontWeight: 500,
              }}
            >
              No historical data available
            </Typography>
          </Box>
        </Box>
      )
    }
    return null
  }

  // Type assertion: The store type is incorrect, actual data is RouteDelayData[]
  const historicalDelayedRoutes = historicalData.stats
    .routeDelays as unknown as RouteDelayData[]

  // Use the state that's populated by the async useEffect
  let delayedRoutes = [...historicalDelayedRoutes]

  // Sort and filter the routes
  delayedRoutes = delayedRoutes
    .sort((a, b) => b.delayRatio - a.delayRatio)
    .filter(
      (route) =>
        route.delayRatio > 1.5 &&
        route.delayTime > 5 &&
        route.staticDuration > 5,
    )
  // Calculate stats from delayed routes
  const totalRoutes = delayedRoutes.length
  const delayedRoutesCount = delayedRoutes.filter(
    (route) => route.delayRatio > 1,
  ).length

  const avgDelayRatio = Math.max(
    1,
    totalRoutes > 0
      ? historicalDelayedRoutes.reduce(
          (sum: number, route: RouteDelayData) =>
            sum + (route.delayRatio > 1 ? route.delayRatio : 1),
          0,
        ) / historicalDelayedRoutes.length
      : 0,
  )

  const avgDelayPercentage = (avgDelayRatio - 1) * 100

  return (
    <Box sx={{ padding: "16px" }}>
      {selectedRouteSegment ? (
        /* Route Analytics View */
        <SelectedRouteDetails
          onBack={() => setSelectedRouteId("")}
          showGraph={true}
        />
      ) : (
        /* Default Stats View */
        <Box>
          <Box sx={{ mb: 1.5 }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "12px",
              }}
            >
              <Box
                sx={{
                  backgroundColor: "#ffffff",
                  borderRadius: "12px",
                  padding: "16px",
                  border: "1px solid #e8eaed",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
                  transition: "box-shadow 0.2s ease",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
                  },
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "8px",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "11px",
                      color: "#5f6368",
                      textTransform: "uppercase",
                      fontFamily: "Google Sans, Roboto, sans-serif",
                      fontWeight: 500,
                      letterSpacing: "0.5px",
                    }}
                  >
                    Average Delay
                  </Typography>
                  <CustomTooltip
                    title="Average percentage increase in travel time compared to normal conditions. Calculated from all routes in the selected time period."
                    arrow
                    placement="top"
                  >
                    <InfoOutlined
                      sx={{
                        fontSize: "10px",
                        color: "#5f6368",
                        cursor: "help",
                        opacity: 0.7,
                        "&:hover": { opacity: 1 },
                      }}
                    />
                  </CustomTooltip>
                </Box>
                <Typography
                  sx={{
                    fontSize: "16px",
                    fontWeight: 500,
                    color: "#ea4335",
                    fontFamily: "Google Sans, sans-serif",
                  }}
                >
                  {avgDelayPercentage.toFixed(1)}%
                </Typography>
              </Box>
              <Box
                sx={{
                  backgroundColor: "#ffffff",
                  borderRadius: "12px",
                  padding: "16px",
                  border: "1px solid #e8eaed",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
                  },
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    marginBottom: "8px",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "11px",
                      color: "#5f6368",
                      textTransform: "uppercase",
                      fontFamily: "Google Sans, Roboto, sans-serif",
                      fontWeight: 500,
                      letterSpacing: "0.5px",
                    }}
                  >
                    Delayed Routes
                  </Typography>
                  <CustomTooltip
                    title="Number of routes experiencing delays above free flow travel times. Routes are considered delayed when travel time exceeds the free flow travel time by more than 50%."
                    arrow
                    placement="top"
                  >
                    <InfoOutlined
                      sx={{
                        fontSize: "10px",
                        color: "#5f6368",
                        cursor: "help",
                        opacity: 0.7,
                        "&:hover": { opacity: 1 },
                      }}
                    />
                  </CustomTooltip>
                </Box>
                <Typography
                  sx={{
                    fontSize: "16px",
                    fontWeight: 500,
                    color: "#ea4335",
                    fontFamily: "Google Sans, sans-serif",
                  }}
                >
                  {delayedRoutesCount}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {/* Route Comparison - Only show when no route is selected */}
      {!selectedRouteSegment && (
        <Box>
          <Box
            sx={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              border: "1px solid #f1f3f4",
              boxShadow:
                "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.12)",
            }}
          >
            {delayedRoutes.length > 0 ? (
              <ScrollableContainer>
                {delayedRoutes.map((route, index) => (
                  <DelayedRoute
                    route={route}
                    index={index}
                    delayedRoutes={delayedRoutes}
                  />
                ))}
              </ScrollableContainer>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  py: 4,
                  px: 2,
                }}
              >
                <Box
                  sx={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    backgroundColor: "#f1f3f4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mb: 2,
                    animation: "spin 1s linear infinite",
                    "@keyframes spin": {
                      "0%": { transform: "rotate(0deg)" },
                      "100%": { transform: "rotate(360deg)" },
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      backgroundColor: "#1a73e8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  />
                </Box>
                <Typography
                  sx={{
                    fontSize: "14px",
                    color: "#5f6368",
                    textAlign: "center",
                    fontFamily: '"Google Sans", Roboto, sans-serif',
                    fontWeight: 500,
                    mb: 0.5,
                  }}
                >
                  No delayed routes found
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  )
}

const DelayedRoute = ({
  route,
  index,
  delayedRoutes,
}: {
  route: RouteDelayData
  index: number
  delayedRoutes: RouteDelayData[]
}) => {
  const setSelectedRouteId = useAppStore((state) => state.setSelectedRouteId)
  const selectedRouteSegment = useAppStore(
    (state) => state.selectedRouteSegment,
  )

  return (
    <Box
      key={route.routeId}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        mb: index < delayedRoutes.length - 1 ? 1 : 0,
        pb: index < delayedRoutes.length - 1 ? 1 : 0,
        borderBottom:
          index < delayedRoutes.length - 1 ? "1px solid #f1f3f4" : "none",
        cursor: "pointer",
        backgroundColor:
          selectedRouteSegment?.routeId === route.routeId
            ? "#e8f0fe"
            : "transparent",
        position: "relative",
        padding: "8px 12px",
        borderRadius: "12px",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        "&:hover": {
          backgroundColor:
            selectedRouteSegment?.routeId === route.routeId
              ? "#e8f0fe"
              : "#f8f9fa",
          transform: "translateY(-1px)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
          "& .route-name": {
            color: "#1a73e8",
          },
        },
      }}
      onClick={async () => {
        setSelectedRouteId(route.routeId)
      }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0, // Allow flex item to shrink below content size
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          {/* Route icon based on delay severity */}
          <CustomTooltip
            title={`Delay severity: ${route.delayRatio >= 1.5 ? "High" : route.delayRatio >= 1.2 ? "Medium" : "Low"}. Based on delay ratio of ${route.delayRatio.toFixed(2)}x normal travel time.`}
            arrow
            placement="top"
          >
            <Box
              sx={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor:
                  route.delayRatio >= 1.5
                    ? "#ea4335"
                    : route.delayRatio >= 1.2
                      ? "#fbbc04"
                      : "#34a853",
                flexShrink: 0,
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
                cursor: "help",
              }}
            />
          </CustomTooltip>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
            }}
          >
            <Typography
              className="route-name"
              sx={{
                fontSize: "14px",
                color: "#202124",
                fontWeight: 500,
                fontFamily: "Google Sans, Roboto, Arial, sans-serif",
                transition: "color 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100%",
                letterSpacing: "0.1px",
              }}
            >
              Route {route.routeId.slice(0, 8).toUpperCase()}
            </Typography>
          </Box>

          {selectedRouteSegment?.routeId === route.routeId && (
            <Box
              sx={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: "#1a73e8",
                animation: "pulse 1s infinite",
                marginLeft: "8px",
              }}
            />
          )}
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 0.5,
          minWidth: "fit-content",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
          }}
        >
          <Typography
            sx={{
              fontSize: "13px",
              color: "#ea4335",
              fontWeight: 500,
              fontFamily: "Google Sans, Roboto, Arial, sans-serif",
              flexShrink: 0,
              letterSpacing: "0.1px",
              textAlign: "right",
            }}
          >
            +{route.delayTime.toFixed(0)}s (
            {Math.round(
              route.delayPercentage ??
                Math.max(0, (route.delayRatio - 1) * 100),
            )}
            %)
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

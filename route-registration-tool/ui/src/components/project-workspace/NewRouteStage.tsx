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

import { Add, Cancel } from "@mui/icons-material"
import PlaceIcon from "@mui/icons-material/Place"
import { Box, Chip, Typography, useTheme } from "@mui/material"
import React from "react"
import { useMemo } from "react"

import {
  PRIMARY_BLUE,
  PRIMARY_RED_GOOGLE,
  PRIMARY_RED_LIGHT,
} from "../../constants/colors"
import { useLayerStore } from "../../stores/layer-store"
import { useProjectWorkspaceStore } from "../../stores/project-workspace-store"
import { formatDistance, useDistanceUnit } from "../../utils/distance-utils"
import { calculateRouteLengthFromPolyline } from "../../utils/polyline-decoder"
import { decodePolylineToGeoJSON } from "../../utils/polyline-decoder"
import { calculateRouteSimilarity } from "../../utils/route-similarity"
import { useResponsiveTypography } from "../../utils/typography-utils"
import Button from "../common/Button"
import RightPanel from "./RightPanel"
import RoutePointsList from "./RoutePointsList"

// Maximum number of waypoints allowed per route (25 waypoints + origin + destination = 27 total)
const MAX_WAYPOINTS = 25

interface NewRouteStageProps {
  className?: string
  style?: React.CSSProperties
  dynamicIslandHeight: number
  onClose: () => void
  onContinue: () => void
}

const NewRouteStage: React.FC<NewRouteStageProps> = ({
  className,
  style,
  dynamicIslandHeight,
  onClose,
  onContinue,
}) => {
  const theme = useTheme()
  const typography = useResponsiveTypography()
  const distanceUnit = useDistanceUnit()
  const individualRoute = useLayerStore((state) => state.individualRoute)
  const removePoint = useLayerStore((state) => state.removePoint)
  const reorderPoints = useLayerStore((state) => state.reorderPoints)
  const swapStartEnd = useLayerStore((state) => state.swapStartEnd)
  const isAddingIndividualWaypoint = useLayerStore(
    (state) => state.isAddingIndividualWaypoint,
  )
  const setAddingIndividualWaypointMode = useLayerStore(
    (state) => state.setAddingIndividualWaypointMode,
  )
  const cancelAddingIndividualWaypoint = useLayerStore(
    (state) => state.cancelAddingIndividualWaypoint,
  )
  const routes = useProjectWorkspaceStore((state) => state.routes)

  // Calculate match percentage if editing an uploaded route
  const matchPercentage = useMemo(() => {
    if (!individualRoute.routeUUID || !individualRoute.generatedRoute) {
      return null
    }

    // Find the route being edited
    const route = routes.find((r) => r.id === individualRoute.routeUUID)
    if (!route || route.type !== "uploaded" || !route.originalRouteGeoJson) {
      return null
    }

    // Decode the generated route polyline
    if (!individualRoute.generatedRoute.encodedPolyline) {
      return null
    }

    try {
      const decodedGeometry = decodePolylineToGeoJSON(
        individualRoute.generatedRoute.encodedPolyline,
      )

      if (decodedGeometry.type === "LineString") {
        const percentage = calculateRouteSimilarity(
          route.originalRouteGeoJson,
          decodedGeometry,
        )
        // calculateRouteSimilarity returns 0-100, so use it directly
        // Ensure it's clamped to valid range (should already be, but be safe)
        const clampedPercentage = Math.max(0, Math.min(100, percentage))

        return clampedPercentage
      }
    } catch (error) {
      console.error("Error calculating match percentage:", error)
    }

    return null
  }, [individualRoute.routeUUID, individualRoute.generatedRoute, routes])

  // Calculate route length from decoded polyline coordinates for accuracy
  // This ensures we always show the calculated value, which is more accurate
  const calculatedRouteLength = useMemo(() => {
    if (!individualRoute.generatedRoute?.encodedPolyline) {
      return null
    }

    return calculateRouteLengthFromPolyline(
      individualRoute.generatedRoute.encodedPolyline,
    )
  }, [individualRoute.generatedRoute?.encodedPolyline])

  // Use calculated length if available (more accurate), otherwise fall back to stored distance
  const routeLength =
    calculatedRouteLength ?? individualRoute.generatedRoute?.distance ?? 0

  const hasValidRoute = Boolean(individualRoute.generatedRoute?.encodedPolyline)
  const canContinue =
    individualRoute.points.length >= 2 &&
    hasValidRoute &&
    !individualRoute.validationError &&
    !individualRoute.isGenerating

  // Custom title component with route name and subtitle info
  const titleComponent = (
    <Box className="flex flex-col gap-1">
      <Typography
        variant="h6"
        component="div"
        title={individualRoute.originalRouteName || "New Route"}
        className="text-lg font-medium text-gray-900 leading-[1.2] overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]"
        sx={{
          fontFamily: '"Google Sans", sans-serif',
        }}
      >
        {individualRoute.originalRouteName || "New Route"}
      </Typography>
      {individualRoute.points.length > 0 && (
        <Box className="flex items-center gap-3">
          <Typography
            variant="body2"
            className="text-[0.813rem] font-medium text-[#5f6368]"
            sx={{
              fontFamily: '"Google Sans", sans-serif',
            }}
          >
            {individualRoute.points.length}{" "}
            {individualRoute.points.length === 1 ? "point" : "points"}
          </Typography>
          {/* <Typography
            variant="body2"
            className="text-[0.813rem] font-medium text-[#5f6368]"
            sx={{
              fontFamily: '"Google Sans", sans-serif',
            }}
          >
            {formatDistance(routeLength || 0, distanceUnit)}
          </Typography> */}
          {matchPercentage !== null && (
            <Chip
              label={`${Math.round(matchPercentage)}% match`}
              size="small"
              sx={{
                height: "20px",
                backgroundColor:
                  matchPercentage >= 80
                    ? "#e8f5e9"
                    : matchPercentage >= 60
                      ? "#fff3e0"
                      : PRIMARY_RED_LIGHT,
                color:
                  matchPercentage >= 80
                    ? "#2e7d32"
                    : matchPercentage >= 60
                      ? "#e65100"
                      : "#c62828",
                "& .MuiChip-label": {
                  padding: "0 6px",
                  fontSize: theme.fontSizes?.helper || "0.75rem",
                  fontWeight: 500,
                  fontFamily: '"Google Sans", sans-serif',
                },
                border: "none",
              }}
            />
          )}
        </Box>
      )}
    </Box>
  )

  // Calculate waypoint count (all points except first and last)
  const waypointCount = Math.max(0, individualRoute.points.length - 2)

  return (
    <RightPanel
      className={className}
      style={style}
      dynamicIslandHeight={dynamicIslandHeight}
      title={titleComponent}
      onClose={onClose}
      footer={
        <Box
          sx={{
            p: 2,
            px: 3,
          }}
        >
          <Button
            variant="contained"
            disabled={!canContinue}
            fullWidth
            size="small"
            onClick={onContinue}
            sx={{
              py: 1,
              fontSize: "0.813rem",
              minHeight: "36px",
            }}
          >
            Continue
          </Button>
        </Box>
      }
    >
      {individualRoute.points.length === 0 ? (
        <Box className="px-5 py-8">
          <Box className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <Box className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-8">
              <PlaceIcon
                className="text-[32px] text-[#5f6368] opacity-60"
                sx={{
                  fontSize: "32px",
                }}
              />
            </Box>
            <Typography
              variant="body1"
              className="text-[0.938rem] font-medium text-[#202124] mb-4"
              sx={{
                fontFamily: '"Google Sans", sans-serif',
              }}
            >
              No points added yet
            </Typography>
            <Typography
              variant="body2"
              className="text-[0.813rem] text-[#5f6368] leading-6 max-w-[240px]"
              sx={{
                fontFamily: '"Google Sans", sans-serif',
              }}
            >
              Click on the map to add your first point and start creating your
              route
            </Typography>
          </Box>
        </Box>
      ) : (
        <>
          {/* Route info section */}
          <Box className="px-5 py-2 border-b border-gray-200">
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1.5,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Typography
                  variant="body1"
                  sx={{
                    fontSize: typography.body.small,
                    color: "#202124",
                    fontWeight: 500,
                    fontFamily: '"Google Sans", sans-serif',
                    letterSpacing: "-0.01em",
                    lineHeight: 1.4,
                  }}
                >
                  {formatDistance(routeLength || 0, distanceUnit)}
                </Typography>
                {/* {matchPercentage !== null && (
                  <Chip
                    label={`${Math.round(matchPercentage)}% match`}
                    size="small"
                    sx={{
                      height: "15px",
                      backgroundColor:
                        matchPercentage >= 80
                          ? "#e8f5e9"
                          : matchPercentage >= 60
                            ? "#fff3e0"
                            : PRIMARY_RED_LIGHT,
                      color:
                        matchPercentage >= 80
                          ? "#2e7d32"
                          : matchPercentage >= 60
                            ? "#e65100"
                            : "#c62828",
                      "& .MuiChip-label": {
                        padding: "0 6px",
                        fontSize: typography.body.xsmall,
                        fontWeight: 500,
                        fontFamily: '"Google Sans", sans-serif',
                      },
                      border: "none",
                    }}
                  />
                )} */}
              </Box>

              {/* Add Waypoint button (shown when route has at least 2 points) */}
              {individualRoute.points.length >= 2 && (
                <span>
                  <Button
                    title={
                      waypointCount >= MAX_WAYPOINTS &&
                      !isAddingIndividualWaypoint
                        ? `Maximum ${MAX_WAYPOINTS} waypoints reached`
                        : isAddingIndividualWaypoint
                          ? "Click to stop adding waypoints"
                          : "Click to add waypoints by clicking on the map"
                    }
                    size="small"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation()
                      if (isAddingIndividualWaypoint) {
                        cancelAddingIndividualWaypoint()
                      } else if (waypointCount < MAX_WAYPOINTS) {
                        setAddingIndividualWaypointMode(true)
                      }
                    }}
                    disabled={
                      waypointCount >= MAX_WAYPOINTS &&
                      !isAddingIndividualWaypoint
                    }
                    startIcon={
                      isAddingIndividualWaypoint ? (
                        <Cancel sx={{ fontSize: typography.body.small }} />
                      ) : (
                        <Add
                          sx={{
                            fontSize: typography.body.small,
                            backgroundColor: (theme) =>
                              waypointCount >= MAX_WAYPOINTS &&
                              !isAddingIndividualWaypoint
                                ? "#e0e0e0"
                                : PRIMARY_BLUE,
                            color:
                              waypointCount >= MAX_WAYPOINTS &&
                              !isAddingIndividualWaypoint
                                ? "#bdbdbd"
                                : "#ffffff",
                            borderRadius: "50%",
                            width: "16px",
                            height: "16px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        />
                      )
                    }
                    sx={{
                      color: isAddingIndividualWaypoint
                        ? PRIMARY_RED_GOOGLE
                        : PRIMARY_BLUE,
                      textTransform: "none",
                      fontSize: typography.body.small,
                      fontWeight: 500,
                      fontFamily: '"Google Sans", sans-serif',
                      minWidth: "auto",
                      boxShadow: "none",
                      padding: "8px",
                      "&:hover": {
                        backgroundColor: "#f1f3f4",
                        boxShadow: "none",
                      },
                      "&.Mui-disabled": {
                        color: "#bdc1c6",
                      },
                      "& .MuiButton-startIcon": {
                        marginRight: "4px",
                        marginLeft: 0,
                      },
                    }}
                  >
                    {isAddingIndividualWaypoint ? "Cancel" : "Add Waypoints"}
                  </Button>
                </span>
              )}
            </Box>
          </Box>

          {/* Route points list */}
          <Box className=" flex flex-col overflow-hidden overflow-x-hidden flex-1">
            <RoutePointsList
              points={individualRoute.points}
              onRemove={removePoint}
              onReorder={reorderPoints}
              onSwapStartEnd={swapStartEnd}
              scrollableMaxHeight={400}
              showReorderButtons={true}
              showDeleteButtons={true}
              showSwapButton={true}
            />
          </Box>
        </>
      )}
    </RightPanel>
  )
}

export default NewRouteStage

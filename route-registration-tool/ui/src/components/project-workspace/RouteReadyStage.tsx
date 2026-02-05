import { CheckCircle, ContentCut, Save } from "@mui/icons-material"
import { Box, Typography } from "@mui/material"
import React from "react"

import { PRIMARY_RED_LIGHT } from "../../constants/colors"
import { convertKmToMiles, useDistanceUnit } from "../../utils/distance-utils"
import RightPanel from "./RightPanel"

interface RouteReadyStageProps {
  className?: string
  style?: React.CSSProperties
  dynamicIslandHeight: number
  routeLength: number
  matchPercentage?: number
  onBack: () => void
  onClose: () => void
  onEnableSegmentation: () => void
  onSave: () => void
}

const RouteReadyStage: React.FC<RouteReadyStageProps> = ({
  className,
  style,
  dynamicIslandHeight,
  routeLength,
  matchPercentage,
  onBack,
  onClose,
  onEnableSegmentation,
  onSave,
}) => {
  const distanceUnit = useDistanceUnit()
  const isRouteOver80Km = routeLength >= 80
  const limitKm = 80
  const limitInUserUnit =
    distanceUnit === "miles" ? convertKmToMiles(limitKm) : limitKm
  const limitDisplay =
    distanceUnit === "miles"
      ? `${limitInUserUnit.toFixed(1)} mi`
      : `${limitKm} km`
  return (
    <RightPanel
      className={className}
      style={style}
      dynamicIslandHeight={dynamicIslandHeight}
      title="Route Finalized"
      showBackButton={true}
      onBack={onBack}
      onClose={onClose}
    >
      <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.5 }}>
        {/* Match Percentage Banner */}
        {matchPercentage !== undefined &&
          (() => {
            const roundedPercentage = Math.round(matchPercentage)
            const isHighMatch = roundedPercentage >= 80
            const isMediumMatch =
              roundedPercentage >= 60 && roundedPercentage < 80

            const backgroundColor = isHighMatch
              ? "#e8f5e9"
              : isMediumMatch
                ? "#fff3e0"
                : PRIMARY_RED_LIGHT
            const textColor = isHighMatch
              ? "#2e7d32"
              : isMediumMatch
                ? "#e65100"
                : "#c62828"

            return (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  padding: "12px 16px",
                  borderRadius: "12px",
                  backgroundColor,
                }}
              >
                <CheckCircle
                  sx={{
                    fontSize: 20,
                    color: textColor,
                    flexShrink: 0,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontFamily: '"Google Sans", sans-serif',
                    fontWeight: 400,
                    color: textColor,
                  }}
                >
                  Route matches Google Network ({roundedPercentage}%).
                </Typography>
              </Box>
            )
          })()}

        {/* Action Cards */}
        <Box
          sx={{
            display: "flex",
            gap: 2,
            flexDirection: "row",
          }}
        >
          {/* Segment Route Card */}
          <Box
            onClick={onEnableSegmentation}
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 1,
              padding: "14px",
              borderRadius: "16px",
              border: "1px solid #e0e0e0",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              transition: "all 0.2s ease",
              "&:hover": {
                backgroundColor: "#e3f2fd",
                borderColor: "#1976d2",
                boxShadow: "0 2px 8px rgba(25, 118, 210, 0.2)",
                "& .segment-icon": {
                  color: "#1976d2",
                },
              },
            }}
          >
            <ContentCut
              className="segment-icon"
              sx={{
                fontSize: 24,
                color: "#5f6368",
                transition: "color 0.2s ease",
              }}
            />
            <Typography
              sx={{
                fontSize: "15px",
                fontFamily: '"Google Sans", sans-serif',
                fontWeight: 500,
                color: "#111827",
                lineHeight: 1.2,
              }}
            >
              Segment Route
            </Typography>
            <Typography
              sx={{
                fontSize: "12px",
                fontFamily: '"Google Sans", sans-serif',
                fontWeight: 400,
                color: "#5f6368",
                lineHeight: 1.3,
              }}
            >
              Split into smaller distances for tracking.
            </Typography>
          </Box>

          {/* Save As Is Card */}
          <Box
            onClick={isRouteOver80Km ? undefined : onSave}
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 1,
              padding: "14px",
              borderRadius: "16px",
              border: isRouteOver80Km
                ? "1px solid #e0e0e0"
                : "1px solid #e0e0e0",
              backgroundColor: isRouteOver80Km ? "#f5f5f5" : "#ffffff",
              cursor: isRouteOver80Km ? "not-allowed" : "pointer",
              opacity: isRouteOver80Km ? 0.6 : 1,
              transition: "all 0.2s ease",
              ...(!isRouteOver80Km && {
                "&:hover": {
                  backgroundColor: "#e3f2fd",
                  borderColor: "#1976d2",
                  boxShadow: "0 2px 8px rgba(25, 118, 210, 0.2)",
                  "& .save-icon": {
                    color: "#1976d2",
                  },
                },
              }),
            }}
          >
            <Save
              className="save-icon"
              sx={{
                fontSize: 24,
                color: isRouteOver80Km ? "#9e9e9e" : "#5f6368",
                transition: "color 0.2s ease",
              }}
            />
            <Typography
              sx={{
                fontSize: "15px",
                fontFamily: '"Google Sans", sans-serif',
                fontWeight: 500,
                color: isRouteOver80Km ? "#9e9e9e" : "#111827",
                lineHeight: 1.2,
              }}
            >
              Save As Is
            </Typography>
            <Typography
              sx={{
                fontSize: "12px",
                fontFamily: '"Google Sans", sans-serif',
                fontWeight: 400,
                color: isRouteOver80Km ? "#9e9e9e" : "#5f6368",
                lineHeight: 1.3,
              }}
            >
              {isRouteOver80Km
                ? `Route exceeds ${limitDisplay} limit`
                : "Save entire route as a single unit."}
            </Typography>
          </Box>
        </Box>
      </Box>
    </RightPanel>
  )
}

export default RouteReadyStage

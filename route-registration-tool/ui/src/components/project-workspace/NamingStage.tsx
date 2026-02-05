import { Box, TextField, Typography, useTheme } from "@mui/material"
import React from "react"

import { calculateSegmentDistance } from "../../stores/layer-store/utils/geo-math"
import Button from "../common/Button"
import TagSelector from "../common/TagSelector"
import RightPanel from "./RightPanel"

interface Segment {
  id: string
  linestringGeoJson?: {
    coordinates: number[][]
  }
  coordinates?: number[][]
  distanceKm?: number
}

interface NamingStageProps {
  className?: string
  style?: React.CSSProperties
  dynamicIslandHeight: number
  routeName: string
  selectedTag: string | null
  newTag: string
  routeNameError: string
  tagError: string
  tags: string[]
  isSaving?: boolean
  routeLengthKm?: number
  isSegmented?: boolean
  segments?: Segment[]
  onBack: () => void
  onClose: () => void
  onRouteNameChange: (value: string) => void
  onTagChange: (value: string | null) => void
  onConfirmSave: () => void
}

const NamingStage: React.FC<NamingStageProps> = ({
  className,
  style,
  dynamicIslandHeight,
  routeName,
  selectedTag,
  newTag,
  routeNameError,
  tagError,
  tags,
  isSaving = false,
  routeLengthKm,
  isSegmented = false,
  segments = [],
  onBack,
  onClose,
  onRouteNameChange,
  onTagChange,
  onConfirmSave,
}) => {
  const theme = useTheme()

  // Validate route length: non-segmented routes >= 80km or segmented routes with any segment > 80km
  const lengthValidationError = React.useMemo(() => {
    if (!isSegmented) {
      // Non-segmented route: check if length >= 80km
      if (routeLengthKm !== undefined && routeLengthKm >= 80) {
        return "Route exceeds 80km limit"
      }
    } else {
      // Segmented route: check if any segment > 80km
      const segmentsOverLimit = segments.filter((segment) => {
        let segmentLength = segment.distanceKm
        if (segmentLength === undefined) {
          // Calculate from coordinates if distanceKm is not available
          const coords =
            segment.linestringGeoJson?.coordinates || segment.coordinates || []
          if (coords.length > 0) {
            segmentLength = calculateSegmentDistance(coords)
          }
        }
        return segmentLength !== undefined && segmentLength > 80
      })

      if (segmentsOverLimit.length > 0) {
        return `${segmentsOverLimit.length} segment${
          segmentsOverLimit.length > 1 ? "s" : ""
        } exceed 80km limit`
      }
    }
    return null
  }, [isSegmented, routeLengthKm, segments])

  const canSave =
    !lengthValidationError &&
    routeName.trim() &&
    !routeNameError &&
    !tagError &&
    !isSaving
  return (
    <RightPanel
      className={className}
      style={style}
      dynamicIslandHeight={dynamicIslandHeight}
      title="Save"
      showBackButton={true}
      onBack={onBack}
      onClose={onClose}
      footer={
        <Box
          sx={{
            p: 2,
            px: 3,
            display: "flex",
            gap: 1,
          }}
        >
          <Button
            onClick={onBack}
            variant="outlined"
            fullWidth
            disabled={isSaving}
            size="small"
            sx={{
              py: 1,
              fontSize: theme.fontSizes.body,
              minHeight: "36px",
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirmSave}
            variant="contained"
            fullWidth
            disabled={!canSave}
            size="small"
            sx={{
              py: 1,
              fontSize: theme.fontSizes.body,
              minHeight: "36px",
            }}
          >
            {isSaving ? "Saving..." : "Confirm"}
          </Button>
        </Box>
      }
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <Box
          className="pretty-scrollbar"
          sx={{ p: 2, overflowY: "auto", overflowX: "hidden", flex: 1 }}
        >
          <Typography
            variant="caption"
            sx={{
              fontSize: theme.fontSizes.caption,
              color: "#5f6368",
              fontFamily: '"Google Sans", sans-serif',
              display: "block",
              mb: 2,
            }}
          >
            Enter a route name and select or create a folder to save your route.
          </Typography>
          <TextField
            label="Route Name"
            fullWidth
            required
            variant="standard"
            value={routeName}
            onChange={(e) => onRouteNameChange(e.target.value)}
            error={!!routeNameError}
            helperText={routeNameError}
            sx={{ mb: 2.5 }}
            inputProps={{ maxLength: 100 }}
            slotProps={{
              input: {
                sx: {
                  fontSize: theme.fontSizes.body,
                  fontFamily: '"Google Sans", sans-serif',
                },
              },
              inputLabel: {
                sx: {
                  fontSize: theme.fontSizes.body,
                  fontFamily: '"Google Sans", sans-serif',
                },
              },
            }}
          />
          <TagSelector
            value={selectedTag || newTag || null}
            onChange={(value) => {
              onTagChange(value)
            }}
            tags={tags}
            error={tagError}
            required={false}
            label="Folder"
          />
          {lengthValidationError && (
            <Typography
              variant="caption"
              sx={{
                mt: 1,
                fontSize: "12px",
                fontWeight: 400,
                color: "#d32f2f",
                fontFamily: '"Google Sans", sans-serif',
                display: "block",
              }}
            >
              {lengthValidationError}
            </Typography>
          )}
        </Box>
      </Box>
    </RightPanel>
  )
}

export default NamingStage

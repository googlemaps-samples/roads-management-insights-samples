// ui/src/components/map/controls/SelectionToolbar.tsx
import { Close, Save } from "@mui/icons-material"
import { Box, IconButton, Paper, TextField, Typography } from "@mui/material"
import React, { useCallback, useEffect, useState } from "react"
import { v4 as uuidv4 } from "uuid"

import { useProjectTags, useSaveRoute } from "../../../hooks/use-api"
import { useLayerStore } from "../../../stores"
import Button from "../../common/Button"
import TagSelector from "../../common/TagSelector"

interface SelectionToolbarProps {
  projectId: string
}

const SelectionToolbar: React.FC<SelectionToolbarProps> = ({ projectId }) => {
  const roadSelection = useLayerStore((state) => state.roadSelection)
  const exitSelectionMode = useLayerStore((state) => state.exitSelectionMode)
  const saveRouteMutation = useSaveRoute()
  const { data: tags = [] } = useProjectTags(projectId)

  // State for route name and tag (no dialog)
  const [routeName, setRouteName] = useState("")
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [newTag, setNewTag] = useState("")
  const [routeNameError, setRouteNameError] = useState<string>("")
  const [tagError, setTagError] = useState<string>("")

  // Store prepared route data for saving
  const [preparedRouteData, setPreparedRouteData] = useState<{
    uuid: string
    route_name: string
    coordinates: {
      origin: [number, number]
      destination: [number, number]
      waypoints: [number, number][]
    }
    encoded_polyline: string
    region_id: number
    length: number
  } | null>(null)

  // Auto-prepare route data when roads are selected
  useEffect(() => {
    const { highlightedRoads, validationResult } = roadSelection

    if (highlightedRoads.length === 0) {
      setPreparedRouteData(null)
      setRouteName("")
      return
    }

    // Prepare route data automatically
    const orderedRoadIds =
      validationResult?.suggested_order ||
      highlightedRoads.map((r) => parseInt(r.id))

    const orderedRoads = orderedRoadIds
      .map((id: number) => highlightedRoads.find((r) => parseInt(r.id) === id))
      .filter(Boolean)

    const firstRoad = orderedRoads[0]
    const lastRoad = orderedRoads[orderedRoads.length - 1]

    const firstRoadCoords = firstRoad?.linestringGeoJson?.coordinates || []
    const lastRoadCoords = lastRoad?.linestringGeoJson?.coordinates || []

    if (firstRoadCoords.length === 0 || lastRoadCoords.length === 0) {
      setPreparedRouteData(null)
      return
    }

    const origin: [number, number] = [
      firstRoadCoords[0][0],
      firstRoadCoords[0][1],
    ]

    const destination: [number, number] = [
      lastRoadCoords[lastRoadCoords.length - 1][0],
      lastRoadCoords[lastRoadCoords.length - 1][1],
    ]

    const waypoints: [number, number][] = []
    for (let i = 0; i < orderedRoads.length - 1; i++) {
      const currentRoad = orderedRoads[i]
      const currentCoords = currentRoad?.linestringGeoJson?.coordinates || []
      if (currentCoords.length > 0) {
        const connectionPoint = currentCoords[currentCoords.length - 1]
        waypoints.push([connectionPoint[0], connectionPoint[1]])
      }
    }

    const allCoordinates: number[][] = []
    orderedRoads.forEach((road: any, index: number) => {
      const coords = road.linestringGeoJson?.coordinates || []
      if (coords.length === 0) return
      if (index === 0) {
        allCoordinates.push(...coords)
      } else {
        allCoordinates.push(...coords.slice(1))
      }
    })

    const totalLength = highlightedRoads.reduce(
      (sum, road) => sum + (road.distanceKm || 0),
      0,
    )

    // Generate route name based on first and last road
    let autoRouteName = ""
    if (orderedRoads.length === 1) {
      // Single road: just use the road name
      const road = orderedRoads[0]
      autoRouteName = road?.name || `Road ${road?.id}`
    } else {
      // Multiple roads: "FirstRoad → LastRoad"
      const firstRoad = orderedRoads[0]
      const lastRoad = orderedRoads[orderedRoads.length - 1]
      const firstName = firstRoad?.name || `Road ${firstRoad?.id}`
      const lastName = lastRoad?.name || `Road ${lastRoad?.id}`
      autoRouteName = `${firstName} → ${lastName}`
    }

    const combinedPolyline = {
      type: "LineString",
      coordinates: allCoordinates,
    }

    const routeData = {
      uuid: uuidv4(),
      route_name: autoRouteName,
      coordinates: {
        origin,
        destination,
        waypoints,
      },
      encoded_polyline: JSON.stringify(combinedPolyline.coordinates),
      region_id: parseInt(projectId),
      length: totalLength,
    }

    setPreparedRouteData(routeData)
    if (!routeName || routeName === "") {
      setRouteName(autoRouteName)
    }
  }, [roadSelection, projectId])

  const handleClose = useCallback(() => {
    exitSelectionMode()
    setRouteName("")
    setSelectedTag(null)
    setNewTag("")
    setRouteNameError("")
    setTagError("")
    setPreparedRouteData(null)
  }, [exitSelectionMode])

  // Validation functions
  const validateRouteName = (name: string): string => {
    const trimmed = name.trim()
    if (!trimmed) {
      return "Route name is required"
    }
    return ""
  }

  const validateTag = (newTagValue: string): string => {
    if (!newTagValue.trim()) {
      return "" // Empty tag is allowed
    }

    const trimmed = newTagValue.trim().toLowerCase()
    const existingTagLower = tags.map((t) => t.toLowerCase())
    if (existingTagLower.includes(trimmed)) {
      return "Folder already exists"
    }

    if (trimmed.length > 100) {
      return "Folder name must not exceed 100 characters"
    }

    return ""
  }

  const handleRouteNameChange = (value: string) => {
    setRouteName(value)
    if (routeNameError) {
      setRouteNameError("")
    }
  }

  const handleSave = useCallback(async () => {
    if (!preparedRouteData) return

    // Validate route name
    const routeNameValidation = validateRouteName(routeName)
    if (routeNameValidation) {
      setRouteNameError(routeNameValidation)
      return
    }

    // Validate new tag if provided
    if (newTag.trim() && !selectedTag) {
      const tagValidation = validateTag(newTag)
      if (tagValidation) {
        setTagError(tagValidation)
        return
      }
    }

    try {
      const routeData = {
        ...preparedRouteData,
        route_name: routeName.trim(),
        tag: selectedTag || (newTag.trim() ? newTag.trim() : null),
      }

      await saveRouteMutation.mutateAsync(routeData as any)

      console.log("✅ Selection saved as route successfully!")

      // Reset and exit
      handleClose()
    } catch (error) {
      console.error("❌ Failed to save selection as route:", error)
      alert(
        `Failed to save as route: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }, [
    preparedRouteData,
    routeName,
    selectedTag,
    newTag,
    saveRouteMutation,
    handleClose,
  ])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleClose])

  // Calculate total length
  const totalLength = roadSelection.highlightedRoads.reduce(
    (sum, road) => sum + (road.distanceKm || 0),
    0,
  )

  // Get mode display name
  const modeDisplayName =
    roadSelection.mode === "stretch" ? "Save as Route" : "Multi-select Mode"

  // Get validation message
  const getValidationMessage = () => {
    if (roadSelection.isValidating) {
      return { text: "⏳ Validating...", color: "#999" }
    }

    if (
      roadSelection.validationStatus === "valid" &&
      roadSelection.mode !== "stretch"
    ) {
      return { text: "✓ Continuous path", color: "#4CAF50" }
    }

    if (
      roadSelection.validationStatus === "invalid" &&
      roadSelection.validationResult
    ) {
      const gaps = roadSelection.validationResult.gaps || []
      if (gaps.length > 0) {
        const gap = gaps[0]
        return {
          text: `⚠ Gap detected: ${gap.distance_meters.toFixed(1)}m between Road ${gap.from_road_id} and ${gap.to_road_id}`,
          color: "#FF9800",
        }
      }
      return { text: "⚠ Disconnected roads", color: "#FF9800" }
    }

    return null
  }

  const validationMessage = getValidationMessage()

  // Don't render if no roads selected
  if (roadSelection.highlightedRoads.length === 0) {
    return null
  }

  return (
    <Paper
      elevation={8}
      className="absolute top-36 right-4 z-[1000]"
      sx={{
        width: 320,
        borderRadius: "24px",
        border: "none",
        boxShadow:
          "0px 11px 15px -7px rgba(0, 0, 0, 0.2), 0px 24px 38px 3px rgba(0, 0, 0, 0.14), 0px 9px 46px 8px rgba(0, 0, 0, 0.12)",
        backgroundColor: "#fff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #e0e0e0",
        }}
      >
        <IconButton
          size="small"
          onClick={handleClose}
          sx={{ color: "#5f6368" }}
        >
          <Close fontSize="small" />
        </IconButton>
        <Typography
          variant="h6"
          component="div"
          sx={{
            fontSize: "18px",
            fontFamily: '"Google Sans", sans-serif',
            fontWeight: 400,
            color: "#202124",
          }}
        >
          {modeDisplayName}
        </Typography>
        <Box sx={{ width: 32 }} />
      </Box>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1,
            borderBottom: "1px solid #f1f3f4",
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontSize: "0.813rem",
              color: "#5f6368",
              fontFamily: '"Google Sans", sans-serif',
              mb: 0.5,
            }}
          >
            {roadSelection.highlightedRoads.length} road
            {roadSelection.highlightedRoads.length !== 1 ? "s" : ""} with total
            length of {totalLength.toFixed(2)} km selected.
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontSize: "0.813rem",
              color: "#5f6368",
              fontFamily: '"Google Sans", sans-serif',
            }}
          >
            Review the details and save as a reusable route.
          </Typography>
          {validationMessage && (
            <Box
              sx={{
                borderRadius: "12px",
                px: 2,
                py: 1.5,
                backgroundColor:
                  validationMessage.color === "#4CAF50"
                    ? "#E8F5E9"
                    : validationMessage.color === "#FF9800"
                      ? "#FFF3E0"
                      : "#F5F5F5",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: "0.75rem",
                  color: validationMessage.color,
                  fontWeight: 500,
                }}
              >
                {validationMessage.text}
              </Typography>
            </Box>
          )}
        </Box>

        <Box
          className="pretty-scrollbar"
          sx={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            px: 2,
            py: 2,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Box>
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.688rem",
                color: "#5f6368",
                fontFamily: '"Google Sans", sans-serif',
              }}
            >
              Route Name
            </Typography>
            <TextField
              variant="standard"
              fullWidth
              value={routeName}
              onChange={(e) => handleRouteNameChange(e.target.value)}
              error={!!routeNameError}
              helperText={routeNameError}
              inputProps={{ maxLength: 100 }}
              slotProps={{
                input: {
                  sx: {
                    fontSize: "0.813rem",
                    fontFamily: '"Google Sans", sans-serif',
                  },
                },
              }}
            />
          </Box>

          <Box>
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.688rem",
                color: "#5f6368",
                fontFamily: '"Google Sans", sans-serif',
                mb: 1,
                display: "block",
              }}
            >
              Folder (optional)
            </Typography>
            <TagSelector
              value={selectedTag || newTag || null}
              onChange={(value) => {
                if (value && tags.includes(value)) {
                  setSelectedTag(value)
                  setNewTag("")
                } else {
                  setSelectedTag(null)
                  setNewTag(value || "")
                }
                if (tagError) {
                  setTagError("")
                }
              }}
              tags={tags}
              error={tagError}
              required={false}
              helperText="Select an existing folder or type to create a new one"
            />
          </Box>
        </Box>

        <Box
          sx={{
            borderTop: "1px solid #e0e0e0",
            px: 2,
            py: 1.5,
            display: "flex",
            gap: 1,
          }}
        >
          <Button
            variant="outlined"
            fullWidth
            color="inherit"
            onClick={handleClose}
            disabled={roadSelection.isValidating}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            fullWidth
            startIcon={<Save />}
            onClick={handleSave}
            disabled={
              !routeName.trim() ||
              saveRouteMutation.isPending ||
              roadSelection.isValidating
            }
          >
            {saveRouteMutation.isPending ? "Saving..." : "Save Route"}
          </Button>
        </Box>
      </Box>
    </Paper>
  )
}

export default SelectionToolbar

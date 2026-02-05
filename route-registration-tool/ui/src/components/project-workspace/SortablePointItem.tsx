import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Check, ContentCopy, Delete, DragIndicator } from "@mui/icons-material"
import PlaceIcon from "@mui/icons-material/Place"
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked"
import {
  Box,
  IconButton,
  ListItem,
  ListItemIcon,
  Typography,
} from "@mui/material"
import React from "react"

import { PRIMARY_RED_LIGHT } from "../../constants/colors"

export interface SortablePointItemProps {
  point: { id: string; coordinates: { lat: number; lng: number } }
  index: number
  total: number
  onRemove: (id: string) => void
  onRef?: (id: string, element: HTMLElement | null) => void
}

const SortablePointItem: React.FC<SortablePointItemProps> = ({
  point,
  index,
  total,
  onRemove,
  onRef,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: point.id })

  // Combine refs: one for sortable, one for tracking
  const combinedRef = React.useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node)
      if (onRef) {
        onRef(point.id, node)
      }
    },
    [setNodeRef, onRef, point.id],
  )

  const [copied, setCopied] = React.useState(false)
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Determine label
  let label = ""
  if (index === 0) {
    label = "Origin"
  } else if (index === total - 1) {
    label = "Destination"
  } else {
    label = `Waypoint ${index}`
  }

  const handleCopyCoordinates = React.useCallback(() => {
    const coords = `${point.coordinates.lat.toFixed(6)}, ${point.coordinates.lng.toFixed(6)}`
    navigator.clipboard.writeText(coords).then(() => {
      console.log("Coordinates copied to clipboard:", coords)
      setCopied(true)
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false)
      }, 1500)
    })
  }, [point.coordinates])

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  return (
    <ListItem
      ref={combinedRef}
      style={style}
      secondaryAction={
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={handleCopyCoordinates}
            sx={{
              color: "#5f6368",
              "&:hover": {
                backgroundColor: "#f1f3f4",
              },
            }}
            title="Copy coordinates"
          >
            {copied ? (
              <Check sx={{ fontSize: 16 }} />
            ) : (
              <ContentCopy sx={{ fontSize: 16 }} />
            )}
          </IconButton>
          <IconButton
            size="small"
            onClick={() => onRemove(point.id)}
            sx={{
              color: "#5f6368",
              "&:hover": {
                backgroundColor: "#fce8e6",
                color: "#d93025",
              },
            }}
          >
            <Delete sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      }
      sx={{
        px: 2.5,
        py: 1.25,
        borderBottom: "1px solid #f1f3f4",
        "&:hover": {
          backgroundColor: "#f8f9fa",
        },
        "&:last-child": {
          borderBottom: "none",
        },
        transition: "background-color 0.15s ease",
      }}
    >
      <ListItemIcon
        {...attributes}
        {...listeners}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
        sx={{ minWidth: "32px" }}
      >
        <DragIndicator
          fontSize="small"
          sx={{ color: "#9aa0a6", fontSize: "18px" }}
        />
      </ListItemIcon>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          width: "100%",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            backgroundColor:
              index === 0
                ? "#e3f2fd"
                : index === total - 1
                  ? PRIMARY_RED_LIGHT
                  : "#f1f3f4",
            color:
              index === 0
                ? "#1976d2"
                : index === total - 1
                  ? "#c62828"
                  : "#5f6368",
            fontSize: "0.688rem",
            fontWeight: 600,
            flexShrink: 0,
            fontFamily: '"Google Sans", sans-serif',
          }}
        >
          {index === 0 ? (
            <RadioButtonCheckedIcon sx={{ fontSize: "14px" }} />
          ) : index === total - 1 ? (
            <PlaceIcon sx={{ fontSize: "14px" }} />
          ) : (
            index
          )}
        </Box>
        <Typography
          variant="body2"
          sx={{
            fontSize: "0.813rem",
            fontWeight: 500,
            color: "#202124",
            fontFamily: '"Google Sans", sans-serif',
            letterSpacing: "-0.01em",
          }}
        >
          {label}
        </Typography>
      </Box>
    </ListItem>
  )
}

export default SortablePointItem

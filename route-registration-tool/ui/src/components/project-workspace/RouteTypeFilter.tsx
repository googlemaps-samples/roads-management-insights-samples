import { CheckBox, CheckBoxOutlineBlank, FilterList } from "@mui/icons-material"
import { Box, Checkbox, Menu, MenuItem } from "@mui/material"
import React from "react"

import Button from "../common/Button"

interface RouteTypeFilterProps {
  routeTypes: Set<"imported" | "drawn" | "uploaded">
  onTypeChange: (routeTypes: Set<"imported" | "drawn" | "uploaded">) => void
}

const RouteTypeFilter: React.FC<RouteTypeFilterProps> = ({
  routeTypes,
  onTypeChange,
}) => {
  const [filterMenuAnchor, setFilterMenuAnchor] =
    React.useState<null | HTMLElement>(null)

  const getFilterLabel = () => {
    if (routeTypes.size === 0) {
      return "All Types"
    }
    if (routeTypes.size === 1) {
      const type = Array.from(routeTypes)[0]
      return type.charAt(0).toUpperCase() + type.slice(1)
    }
    return `${routeTypes.size} Types`
  }

  const handleTypeToggle = (type: "imported" | "drawn" | "uploaded") => {
    const newTypes = new Set(routeTypes)
    if (newTypes.has(type)) {
      newTypes.delete(type)
    } else {
      newTypes.add(type)
    }
    onTypeChange(newTypes)
  }

  return (
    <Box className="flex items-center gap-1">
      <Button
        size="small"
        startIcon={<FilterList sx={{ fontSize: 16 }} />}
        onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
          setFilterMenuAnchor(e.currentTarget)
        }
        variant="outlined"
        sx={{
          fontSize: "12px",
          textTransform: "none",
          color: routeTypes.size > 0 ? "#1976d2" : "#5f6368",
          borderColor: routeTypes.size > 0 ? "#1976d2" : "#dadce0",
          padding: "6px 12px",
          minHeight: "32px",
          display: "flex",
          alignItems: "center",
          fontWeight: 400,
          backgroundColor: routeTypes.size > 0 ? "#e3f2fd" : "transparent",
          "&:hover": {
            backgroundColor: "#f8f9fa",
            borderColor: "#1976d2",
            color: "#1976d2",
          },
          "& .MuiButton-startIcon": {
            display: "flex",
            alignItems: "center",
            marginRight: "6px",
            marginLeft: 0,
          },
        }}
      >
        {getFilterLabel()}
      </Button>
      <Menu
        anchorEl={filterMenuAnchor}
        open={Boolean(filterMenuAnchor)}
        onClose={() => setFilterMenuAnchor(null)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
      >
        <MenuItem
          onClick={() => {
            onTypeChange(new Set())
            setFilterMenuAnchor(null)
          }}
          selected={routeTypes.size === 0}
          sx={{
            fontSize: "0.813rem",
            fontFamily: '"Google Sans", sans-serif',
          }}
        >
          All Types
        </MenuItem>
        <MenuItem
          onClick={(e) => {
            e.stopPropagation()
            handleTypeToggle("imported")
          }}
          sx={{
            fontSize: "0.813rem",
            fontFamily: '"Google Sans", sans-serif',
          }}
        >
          <Checkbox
            checked={routeTypes.has("imported")}
            size="small"
            sx={{
              padding: "4px 8px 4px 4px",
              color: "#757575",
              "&.Mui-checked": {
                color: "#1976d2",
              },
            }}
            icon={<CheckBoxOutlineBlank sx={{ fontSize: 18 }} />}
            checkedIcon={<CheckBox sx={{ fontSize: 18 }} />}
          />
          Imported
        </MenuItem>
        <MenuItem
          onClick={(e) => {
            e.stopPropagation()
            handleTypeToggle("drawn")
          }}
          sx={{
            fontSize: "0.813rem",
            fontFamily: '"Google Sans", sans-serif',
          }}
        >
          <Checkbox
            checked={routeTypes.has("drawn")}
            size="small"
            sx={{
              padding: "4px 8px 4px 4px",
              color: "#757575",
              "&.Mui-checked": {
                color: "#1976d2",
              },
            }}
            icon={<CheckBoxOutlineBlank sx={{ fontSize: 18 }} />}
            checkedIcon={<CheckBox sx={{ fontSize: 18 }} />}
          />
          Drawn
        </MenuItem>
        <MenuItem
          onClick={(e) => {
            e.stopPropagation()
            handleTypeToggle("uploaded")
          }}
          sx={{
            fontSize: "0.813rem",
            fontFamily: '"Google Sans", sans-serif',
          }}
        >
          <Checkbox
            checked={routeTypes.has("uploaded")}
            size="small"
            sx={{
              padding: "4px 8px 4px 4px",
              color: "#757575",
              "&.Mui-checked": {
                color: "#1976d2",
              },
            }}
            icon={<CheckBoxOutlineBlank sx={{ fontSize: 18 }} />}
            checkedIcon={<CheckBox sx={{ fontSize: 18 }} />}
          />
          Uploaded
        </MenuItem>
      </Menu>
    </Box>
  )
}

export default RouteTypeFilter

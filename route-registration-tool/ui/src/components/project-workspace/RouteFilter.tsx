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

import {
  ArrowDownward,
  ArrowUpward,
  Sort,
} from "@mui/icons-material"
import { Box, IconButton, Menu, MenuItem, Tooltip } from "@mui/material"
import React from "react"

import Button from "../common/Button"

interface RouteFilterProps {
  sortBy:
    | "difference"
    | "distance"
    | "alphabetical"
    | "name"
    | "created_at"
    | "match_percentage"
  onSortChange: (
    sortBy:
      | "difference"
      | "distance"
      | "alphabetical"
      | "name"
      | "created_at"
      | "match_percentage",
  ) => void
  reverseOrder?: boolean
  onReverseOrderChange?: (reverse: boolean) => void
  apiSorting?: boolean // If true, use API sorting options (name, distance, created_at, match_percentage), otherwise use client-side options (difference, distance, alphabetical)
  showMatchPercentage?: boolean // If true, show match_percentage sorting option
}

const RouteFilter: React.FC<RouteFilterProps> = ({
  sortBy,
  onSortChange,
  reverseOrder = false,
  onReverseOrderChange,
  apiSorting = false,
  showMatchPercentage = false,
}) => {
  const [sortMenuAnchor, setSortMenuAnchor] =
    React.useState<null | HTMLElement>(null)

  const getSortLabel = () => {
    if (apiSorting) {
      switch (sortBy) {
        case "name":
          return "Name"
        case "distance":
          return "Distance"
        case "created_at":
          return "Newest"
        case "match_percentage":
          return "Match %"
        default:
          return "Name"
      }
    } else {
      switch (sortBy) {
        case "difference":
          return "Most Different"
        case "distance":
          return "Distance"
        case "alphabetical":
          return "Alphabetical"
        default:
          return "Most Different"
      }
    }
  }

  return (
    <Box className="flex items-center gap-1">
      <Button
        size="small"
        startIcon={<Sort sx={{ fontSize: 16 }} />}
        onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
          setSortMenuAnchor(e.currentTarget)
        }
        variant="outlined"
        sx={{
          fontSize: "12px",
          textTransform: "none",
          color: "#5f6368",
          borderColor: "#dadce0",
          padding: "6px 12px",
          minHeight: "32px",
          display: "flex",
          alignItems: "center",
          fontWeight: 400,
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
        {getSortLabel()}
      </Button>
      {onReverseOrderChange && (
        <Tooltip title={reverseOrder ? "Normal order" : "Reverse order"}>
          <IconButton
            size="small"
            onClick={() => onReverseOrderChange(!reverseOrder)}
            sx={{
              color: reverseOrder ? "#1976d2" : "#5f6368",
              border: "1px solid #dadce0",
              padding: "4px",
              width: "28px",
              height: "28px",
              "&:hover": {
                backgroundColor: "#f8f9fa",
                borderColor: "#1976d2",
                color: "#1976d2",
              },
            }}
          >
            {reverseOrder ? (
              <ArrowUpward sx={{ fontSize: 16 }} />
            ) : (
              <ArrowDownward sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Tooltip>
      )}
      <Menu
        anchorEl={sortMenuAnchor}
        open={Boolean(sortMenuAnchor)}
        onClose={() => setSortMenuAnchor(null)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
      >
        {apiSorting
          ? [
              <MenuItem
                key="name"
                onClick={() => {
                  onSortChange("name")
                  setSortMenuAnchor(null)
                }}
                selected={sortBy === "name"}
                sx={{
                  fontSize: "0.813rem",
                  fontFamily: '"Google Sans", sans-serif',
                }}
              >
                Name (A-Z)
              </MenuItem>,
              <MenuItem
                key="distance"
                onClick={() => {
                  onSortChange("distance")
                  setSortMenuAnchor(null)
                }}
                selected={sortBy === "distance"}
                sx={{
                  fontSize: "0.813rem",
                  fontFamily: '"Google Sans", sans-serif',
                }}
              >
                Distance (shortest first)
              </MenuItem>,
              showMatchPercentage && (
                <MenuItem
                  key="match_percentage"
                  onClick={() => {
                    onSortChange("match_percentage")
                    setSortMenuAnchor(null)
                  }}
                  selected={sortBy === "match_percentage"}
                  sx={{
                    fontSize: "0.813rem",
                    fontFamily: '"Google Sans", sans-serif',
                  }}
                >
                  Match % (lowest first)
                </MenuItem>
              ),
              <MenuItem
                key="created_at"
                onClick={() => {
                  onSortChange("created_at")
                  setSortMenuAnchor(null)
                }}
                selected={sortBy === "created_at"}
                sx={{
                  fontSize: "0.813rem",
                  fontFamily: '"Google Sans", sans-serif',
                }}
              >
                Newest First
              </MenuItem>,
            ].filter(Boolean)
          : [
              <MenuItem
                key="difference"
                onClick={() => {
                  onSortChange("difference")
                  setSortMenuAnchor(null)
                }}
                selected={sortBy === "difference"}
                sx={{
                  fontSize: "0.813rem",
                  fontFamily: '"Google Sans", sans-serif',
                }}
              >
                Most Different
              </MenuItem>,
              <MenuItem
                key="distance"
                onClick={() => {
                  onSortChange("distance")
                  setSortMenuAnchor(null)
                }}
                selected={sortBy === "distance"}
                sx={{
                  fontSize: "0.813rem",
                  fontFamily: '"Google Sans", sans-serif',
                }}
              >
                Distance (shortest first)
              </MenuItem>,
              <MenuItem
                key="alphabetical"
                onClick={() => {
                  onSortChange("alphabetical")
                  setSortMenuAnchor(null)
                }}
                selected={sortBy === "alphabetical"}
                sx={{
                  fontSize: "0.813rem",
                  fontFamily: '"Google Sans", sans-serif',
                }}
              >
                Alphabetical (A-Z)
              </MenuItem>,
            ]}
      </Menu>
    </Box>
  )
}

export default RouteFilter

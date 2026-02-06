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

import { Box, Checkbox, Divider, Tooltip, Typography } from "@mui/material"

import {
  ROAD_PRIORITIES,
  ROAD_PRIORITY_CATEGORIES,
  RoadPriority,
} from "../../../constants/road-priorities"
import { useLayerStore, useProjectWorkspaceStore } from "../../../stores"
import Button from "../../common/Button"
import FloatingSheet from "../../common/FloatingSheet"

const PriorityFilterPanel = () => {
  // ALL hooks must be called before any conditional returns
  const selectedPriorities = useLayerStore(
    (state) => state.selectedRoadPriorities,
  )
  // console.log("selectedPriorities", selectedPriorities)
  const setSelectedRoadPriorities = useLayerStore(
    (state) => state.setSelectedRoadPriorities,
  )
  const toggleRoadPriorityFilter = useLayerStore(
    (state) => state.toggleRoadPriorityFilter,
  )
  const mapMode = useProjectWorkspaceStore((state) => state.mapMode)
  const isExpanded = useProjectWorkspaceStore(
    (state) => state.priorityFilterPanelExpanded,
  )
  const setPriorityFilterPanelExpanded = useProjectWorkspaceStore(
    (state) => state.setPriorityFilterPanelExpanded,
  )

  // Only show in road_selection mode (after all hooks are called)
  if (mapMode !== "road_selection") {
    return null
  }

  const allSelected = selectedPriorities.length === ROAD_PRIORITIES.length

  const handleSelectAll = () =>
    setSelectedRoadPriorities(ROAD_PRIORITIES.map((priority) => priority.value))

  const handleClear = () =>
    setSelectedRoadPriorities(["NO-PRIORITIES-SELECTED"])

  const handleToggle = (priority: RoadPriority) => {
    toggleRoadPriorityFilter(priority)
  }

  const handleGroupToggle = (categoryId: string) => {
    const groupValues: RoadPriority[] = ROAD_PRIORITIES.filter(
      (priority) => priority.category === categoryId,
    ).map((priority) => priority.value)

    const allSelected = groupValues.every((value) =>
      selectedPriorities.includes(value),
    )

    if (allSelected) {
      // Deselect all in group
      setSelectedRoadPriorities(
        selectedPriorities.filter((value) => !groupValues.includes(value)),
      )
    } else {
      // Select all in group
      setSelectedRoadPriorities(
        Array.from(
          new Set<RoadPriority>([...selectedPriorities, ...groupValues]),
        ),
      )
    }
  }

  return (
    <FloatingSheet
      isExpanded={isExpanded}
      onToggle={() => setPriorityFilterPanelExpanded(!isExpanded)}
      width={360}
    >
      {/* Header Section - Fixed Height */}
      <Box
        className="px-4 pt-3 pb-3 border-b border-gray-200 bg-white"
        sx={{
          flexShrink: 0,
        }}
      >
        <Box className="flex items-center justify-between">
          <Typography
            variant="h6"
            className="text-gray-900 font-medium"
            style={{ fontSize: "15px", fontWeight: 500 }}
          >
            Roads Priority
          </Typography>
          <Box className="flex items-center gap-1">
            <Button
              size="small"
              variant="outlined"
              onClick={allSelected ? handleClear : handleSelectAll}
              sx={{
                fontSize: "12px",
                textTransform: "none",
                fontFamily: '"Google Sans", Roboto',
                fontWeight: 500,
                color: "#5f6368",
                borderColor: "#d1d5db",
                padding: "6px 12px",
                minWidth: "auto",
                "&:hover": {
                  borderColor: "#1976d2",
                  backgroundColor: "#e3f2fd",
                },
              }}
            >
              {allSelected ? "Deselect All" : "Select All"}
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Categories List - Scrollable */}
      <Box
        className="flex-1 overflow-auto pretty-scrollbar px-4 py-3 bg-white"
        sx={{
          flexShrink: 0,
          minHeight: 0,
        }}
      >
        {ROAD_PRIORITY_CATEGORIES.length === 0 ? (
          <Box className="text-center py-4 text-mui-disabled">
            <Typography variant="caption" sx={{ fontSize: "0.75rem" }}>
              No categories available
            </Typography>
          </Box>
        ) : (
          <Box className="space-y-2">
            {ROAD_PRIORITY_CATEGORIES.map((category) => {
              const groupPriorities = ROAD_PRIORITIES.filter(
                (priority) => priority.category === category.id,
              )
              const allSelected = groupPriorities.every((priority) =>
                selectedPriorities.includes(priority.value),
              )
              const someSelected =
                groupPriorities.some((priority) =>
                  selectedPriorities.includes(priority.value),
                ) && !allSelected

              return (
                <div
                  key={category.id}
                  className="rounded-lg border border-gray-100 bg-white shadow-sm"
                >
                  <div className="w-full px-3 py-2 flex items-start gap-1.5">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleGroupToggle(category.id)
                      }}
                      size="small"
                      sx={{
                        padding: 0.25,
                        marginTop: "2px",
                        "& .MuiSvgIcon-root": {
                          fontSize: 16,
                        },
                      }}
                    />
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.25,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 500,
                          fontSize: "13px",
                          color: "#202124",
                          lineHeight: 1.4,
                        }}
                      >
                        {category.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "0.75rem",
                          color: "#5f6368",
                          lineHeight: 1.4,
                        }}
                      >
                        {category.description}
                      </Typography>
                    </Box>
                  </div>
                  <Divider className="mx-3" />
                  <div className="px-3 py-2 space-y-1">
                    {groupPriorities.map((priority) => {
                      const isSelected = selectedPriorities.includes(
                        priority.value,
                      )

                      return (
                        <Tooltip
                          key={priority.value}
                          title={priority.description}
                          placement="right"
                          arrow
                        >
                          <div className="flex items-center gap-2 rounded px-2 py-1.5 transition">
                            <Checkbox
                              checked={isSelected}
                              onChange={() => handleToggle(priority.value)}
                              onClick={(event) => event.stopPropagation()}
                              size="small"
                              sx={{
                                padding: 0.25,
                                "& .MuiSvgIcon-root": {
                                  fontSize: 16,
                                },
                              }}
                            />
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 500,
                                fontSize: "0.8125rem",
                                color: isSelected ? "#202124" : "#3c4043",
                                lineHeight: 1.4,
                                flex: 1,
                              }}
                            >
                              {priority.label}
                            </Typography>
                          </div>
                        </Tooltip>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </Box>
        )}
      </Box>
    </FloatingSheet>
  )
}

export default PriorityFilterPanel

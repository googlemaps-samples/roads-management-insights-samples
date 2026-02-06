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

import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import { Box, Checkbox, Collapse, Divider, Typography } from "@mui/material"
import React from "react"

import { PRIMARY_BLUE } from "../../constants/colors"
import {
  ROAD_PRIORITIES,
  ROAD_PRIORITY_CATEGORIES,
  RoadPriority,
} from "../../constants/road-priorities"

interface RoadPrioritySelectorProps {
  selectedPriorities: RoadPriority[]
  onSelectionChange: (priorities: RoadPriority[]) => void
  expandedCategories?: Record<string, boolean>
  onExpandedCategoriesChange?: (categories: Record<string, boolean>) => void
}

const RoadPrioritySelector: React.FC<RoadPrioritySelectorProps> = ({
  selectedPriorities,
  onSelectionChange,
  expandedCategories: controlledExpandedCategories,
  onExpandedCategoriesChange,
}) => {
  const [internalExpandedCategories, setInternalExpandedCategories] =
    React.useState<Record<string, boolean>>({})

  const expandedCategories =
    controlledExpandedCategories ?? internalExpandedCategories
  const setExpandedCategories = onExpandedCategoriesChange
    ? (
        updater:
          | Record<string, boolean>
          | ((prev: Record<string, boolean>) => Record<string, boolean>),
      ) => {
        if (typeof updater === "function") {
          onExpandedCategoriesChange(updater(expandedCategories))
        } else {
          onExpandedCategoriesChange(updater)
        }
      }
    : setInternalExpandedCategories

  // Sort categories by importance: highway (most) -> arterial -> local (least)
  const categoryOrder: Record<string, number> = {
    highway: 0,
    arterial: 1,
    local: 2,
  }

  // Sort priorities within each category by importance (most to least)
  const priorityOrder: Record<string, number> = {
    // Highway: Controlled Access (most) -> Limited Access -> Primary Highway (least)
    ROAD_PRIORITY_CONTROLLED_ACCESS: 0,
    ROAD_PRIORITY_LIMITED_ACCESS: 1,
    ROAD_PRIORITY_PRIMARY_HIGHWAY: 2,
    // Arterial: Secondary Road (most) -> Major Arterial -> Minor Arterial (least)
    ROAD_PRIORITY_SECONDARY_ROAD: 0,
    ROAD_PRIORITY_MAJOR_ARTERIAL: 1,
    ROAD_PRIORITY_MINOR_ARTERIAL: 2,
    // Local: Local (most) -> Terminal -> Non-Traffic -> Unspecified (least)
    ROAD_PRIORITY_LOCAL: 0,
    ROAD_PRIORITY_TERMINAL: 1,
    ROAD_PRIORITY_NON_TRAFFIC: 2,
    ROAD_PRIORITY_UNSPECIFIED: 3,
  }

  const sortedCategories = [...ROAD_PRIORITY_CATEGORIES].sort(
    (a, b) => (categoryOrder[a.id] ?? 999) - (categoryOrder[b.id] ?? 999),
  )

  // Calculate select all state
  const allPriorities = ROAD_PRIORITIES.map((p) => p.value)
  const allSelected = allPriorities.every((priority) =>
    selectedPriorities.includes(priority),
  )
  const someSelected =
    selectedPriorities.length > 0 &&
    selectedPriorities.length < allPriorities.length

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange([])
    } else {
      onSelectionChange([...allPriorities])
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Sticky Select All Section */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backgroundColor: "white",
          pb: 0.5,
        }}
      >
        <Box
          onClick={handleSelectAll}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: 0.5,
            py: 0.25,
            cursor: "pointer",
            transition: "background-color 0.15s ease",
            "&:hover": {
              backgroundColor: "#f8f9fa",
            },
          }}
        >
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onClick={(event) => {
              event.stopPropagation()
              handleSelectAll()
            }}
            size="small"
            sx={{
              color: "#5f6368",
              "&.Mui-checked": {
                color: PRIMARY_BLUE,
              },
              "&.MuiCheckbox-indeterminate": {
                color: PRIMARY_BLUE,
              },
              padding: "4px",
            }}
          />
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              fontSize: "0.8125rem",
              color: "#3c4043",
              lineHeight: 1.4,
              userSelect: "none",
            }}
          >
            Select All
          </Typography>
          <Typography
            component="span"
            sx={{
              fontWeight: 400,
              fontSize: "0.8125rem",
              color: "#5f6368",
              ml: 0.5,
              userSelect: "none",
            }}
          >
            ({allPriorities.length})
          </Typography>
        </Box>

        <Divider
          sx={{
            mt: 0.5,
            borderColor: "#e8eaed",
          }}
        />
      </Box>

      {/* Scrollable Categories */}
      <Box
        className="pretty-scrollbar"
        sx={{
          flex: 1,
          overflowY: "auto",
          pt: 0.5,
        }}
      >
        <div className="flex flex-col gap-2.5">
          {sortedCategories.map((category) => {
            const groupPriorities = ROAD_PRIORITIES.filter(
              (priority) => priority.category === category.id,
            ).sort(
              (a, b) =>
                (priorityOrder[a.value] ?? 999) -
                (priorityOrder[b.value] ?? 999),
            )
            const allSelected = groupPriorities.every((priority) =>
              selectedPriorities.includes(priority.value),
            )
            const someSelected =
              groupPriorities.some((priority) =>
                selectedPriorities.includes(priority.value),
              ) && !allSelected
            const isExpanded = !!expandedCategories[category.id]

            const handleGroupToggle = () => {
              if (allSelected) {
                onSelectionChange(
                  selectedPriorities.filter(
                    (value) =>
                      !groupPriorities.some(
                        (priority) => priority.value === value,
                      ),
                  ),
                )
                return
              }

              onSelectionChange([
                ...selectedPriorities,
                ...groupPriorities
                  .map((priority) => priority.value)
                  .filter((value) => !selectedPriorities.includes(value)),
              ])
            }

            return (
              <Box
                key={category.id}
                sx={{
                  borderRadius: "16px",
                  border: allSelected
                    ? `1px solid ${PRIMARY_BLUE}`
                    : someSelected
                      ? "1px solid #9aa0a6"
                      : "1px solid #e8eaed",
                  backgroundColor: allSelected ? "#f8f9fa" : "white",
                  boxShadow:
                    allSelected || someSelected
                      ? "0 2px 8px rgba(9, 87, 208, 0.1)"
                      : "0 1px 3px rgba(0, 0, 0, 0.05)",
                  "&:hover": {
                    borderColor: allSelected ? PRIMARY_BLUE : "#dadce0",
                    boxShadow:
                      allSelected || someSelected
                        ? "0 4px 12px rgba(66, 133, 244, 0.15)"
                        : "0 2px 6px rgba(0, 0, 0, 0.08)",
                  },
                }}
              >
                <Box
                  onClick={() =>
                    setExpandedCategories((prev) => ({
                      ...prev,
                      [category.id]: !prev[category.id],
                    }))
                  }
                  sx={{
                    width: "100%",
                    px: 2.5,
                    py: 1.5,
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 2,
                    cursor: "pointer",
                    "&:hover": {
                      backgroundColor: "rgba(0, 0, 0, 0.02)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1.5,
                      flex: 1,
                    }}
                  >
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleGroupToggle()
                      }}
                      size="small"
                      sx={{
                        color: "#5f6368",
                        "&.Mui-checked": {
                          color: PRIMARY_BLUE,
                        },
                        "&.MuiCheckbox-indeterminate": {
                          color: PRIMARY_BLUE,
                        },
                        padding: 0,
                        marginTop: "2px", // Align with category name text
                      }}
                    />
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.25,
                        flex: 1,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          fontSize: "0.875rem",
                          color: "#202124",
                          lineHeight: 1.4,
                        }}
                      >
                        {category.label}
                        <Typography
                          component="span"
                          sx={{
                            fontWeight: 500,
                            fontSize: "0.875rem",
                            color: "#5f6368",
                            ml: 0.5,
                          }}
                        >
                          ({groupPriorities.length})
                        </Typography>
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
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color: "#5f6368",
                      transition: "transform 0.2s ease",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    <ExpandMoreIcon fontSize="small" />
                  </Box>
                </Box>
                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <Divider
                    sx={{
                      mx: 2.5,
                      borderColor: "#e8eaed",
                    }}
                  />
                  <Box
                    sx={{
                      px: 2.5,
                      py: 1.5,
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.5,
                    }}
                  >
                    {groupPriorities.map((priority, index) => {
                      const isSelected = selectedPriorities.includes(
                        priority.value,
                      )

                      return (
                        <React.Fragment key={priority.value}>
                          <Box
                            onClick={() =>
                              onSelectionChange(
                                selectedPriorities.includes(priority.value)
                                  ? selectedPriorities.filter(
                                      (value) => value !== priority.value,
                                    )
                                  : [...selectedPriorities, priority.value],
                              )
                            }
                            sx={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 1.5,
                              px: 1.5,
                              py: 1,
                              borderRadius: "8px",
                              cursor: "pointer",
                              backgroundColor: isSelected
                                ? "#f1f3f4"
                                : "transparent",
                              transition: "background-color 0.15s ease",
                              "&:hover": {
                                backgroundColor: isSelected
                                  ? "#e8eaed"
                                  : "#f8f9fa",
                              },
                            }}
                          >
                            <Checkbox
                              checked={isSelected}
                              onChange={() =>
                                onSelectionChange(
                                  selectedPriorities.includes(priority.value)
                                    ? selectedPriorities.filter(
                                        (value) => value !== priority.value,
                                      )
                                    : [...selectedPriorities, priority.value],
                                )
                              }
                              onClick={(event) => event.stopPropagation()}
                              size="small"
                              sx={{
                                color: "#5f6368",
                                "&.Mui-checked": {
                                  color: PRIMARY_BLUE,
                                },
                                padding: 0,
                                marginTop: "2px", // Align with priority name text
                              }}
                            />
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 0.25,
                                flex: 1,
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 500,
                                  fontSize: "0.8125rem",
                                  color: isSelected ? "#202124" : "#3c4043",
                                  lineHeight: 1.4,
                                }}
                              >
                                {priority.label}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  fontSize: "0.75rem",
                                  color: "#5f6368",
                                  lineHeight: 1.4,
                                }}
                              >
                                {priority.description}
                              </Typography>
                            </Box>
                          </Box>
                          {index !== groupPriorities.length - 1 && (
                            <Divider
                              sx={{
                                my: 0.5,
                                borderColor: "#e8eaed",
                                opacity: 0.5,
                              }}
                            />
                          )}
                        </React.Fragment>
                      )
                    })}
                  </Box>
                </Collapse>
              </Box>
            )
          })}
        </div>
      </Box>
    </Box>
  )
}

export default RoadPrioritySelector

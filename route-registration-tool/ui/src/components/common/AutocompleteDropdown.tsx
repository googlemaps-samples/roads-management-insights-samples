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

import { CircularProgress, ListItem, ListItemText } from "@mui/material"
import React from "react"

import { PRIMARY_BLUE, PRIMARY_BLUE_LIGHT } from "../../constants/colors"

interface AutocompleteDropdownProps {
  predictions: google.maps.places.AutocompletePrediction[]
  isOpen: boolean
  selectedIndex: number
  onSelect: (prediction: google.maps.places.AutocompletePrediction) => void
  onClose: () => void
  isLoading: boolean
  anchorElement?: HTMLElement | null
  showMinCharsMessage?: boolean
}

const AutocompleteDropdown: React.FC<AutocompleteDropdownProps> = ({
  predictions,
  isOpen,
  selectedIndex,
  onSelect,
  onClose,
  isLoading,
  anchorElement,
  showMinCharsMessage = false,
}) => {
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const selectedItemRef = React.useRef<HTMLLIElement | null>(null)

  // Scroll selected item into view
  React.useEffect(() => {
    if (selectedIndex >= 0 && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      })
    }
  }, [selectedIndex])

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        anchorElement &&
        !anchorElement.contains(event.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen, onClose, anchorElement])

  if (!isOpen) return null

  return (
    <div
      ref={dropdownRef}
      className="absolute bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden pretty-scrollbar"
      style={{
        top: "100%",
        left: 0,
        width: "100%",
        marginTop: "4px",
        maxHeight: "250px",
        overflowY: "auto",
        zIndex: 1001, // Above RightPanel (z-[1000]) and within Navbar context (z-[2000])
      }}
    >
      {showMinCharsMessage ? (
        <div className="px-3 py-3 text-center text-xs text-gray-500">
          Enter minimum 3 letters...
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-4">
          <CircularProgress size={20} />
        </div>
      ) : predictions.length === 0 ? (
        <div className="px-3 py-3 text-center text-xs text-gray-500">
          No results found
        </div>
      ) : (
        <div className="py-0.5">
          {predictions.map((prediction, index) => {
            const isSelected = index === selectedIndex
            const mainText =
              prediction.structured_formatting?.main_text ||
              prediction.description
            const secondaryText =
              prediction.structured_formatting?.secondary_text

            return (
              <ListItem
                key={prediction.place_id}
                ref={isSelected ? selectedItemRef : null}
                onClick={() => {
                  onSelect(prediction)
                  onClose()
                }}
                className="cursor-pointer transition-colors"
                sx={{
                  backgroundColor: isSelected
                    ? PRIMARY_BLUE_LIGHT
                    : "transparent",
                  "&:hover": {
                    backgroundColor: isSelected
                      ? PRIMARY_BLUE_LIGHT
                      : "rgba(0, 0, 0, 0.04)",
                  },
                  padding: "6px 12px",
                  minHeight: "auto",
                }}
              >
                <ListItemText
                  primary={
                    <span
                      className="font-medium text-gray-900 block truncate"
                      style={{
                        color: isSelected ? PRIMARY_BLUE : "#1f2937",
                        fontSize: "12px",
                        lineHeight: "1.4",
                      }}
                    >
                      {mainText}
                    </span>
                  }
                  secondary={
                    secondaryText ? (
                      <span
                        className="text-gray-500 block mt-0.5"
                        style={{
                          fontSize: "11px",
                          lineHeight: "1.3",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {secondaryText}
                      </span>
                    ) : null
                  }
                  sx={{
                    margin: 0,
                    "& .MuiListItemText-primary": {
                      marginBottom: secondaryText ? "2px" : 0,
                    },
                  }}
                />
              </ListItem>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default AutocompleteDropdown

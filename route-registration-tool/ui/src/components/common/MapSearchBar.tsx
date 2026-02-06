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

import SearchIcon from "@mui/icons-material/Search"
import { IconButton, Tooltip } from "@mui/material"
import { useCallback, useEffect, useRef, useState } from "react"

import { PRIMARY_BLUE } from "../../constants/colors"
import { usePlaceDetails, usePlacesAutocomplete } from "../../hooks/use-api"
import { useDebouncedValue } from "../../hooks/use-debounced-value"
import AutocompleteDropdown from "./AutocompleteDropdown"
import SearchBar from "./SearchBar"

interface MapSearchBarProps {
  isProjectPage?: boolean
}

// Detect if input looks like coordinates
const looksLikeCoordinates = (input: string): boolean => {
  const trimmed = input.trim()
  if (!trimmed) return false

  // Split by comma or space
  const parts = trimmed.split(/[,\s]+/).filter((p) => p.length > 0)

  if (parts.length !== 2) return false

  // Check if both parts are numbers
  const lat = parseFloat(parts[0])
  const lng = parseFloat(parts[1])

  return !isNaN(lat) && !isNaN(lng)
}

// Convert legacy prediction format to Google Maps format for compatibility
const convertToGoogleMapsPrediction = (prediction: {
  place_id: string
  description: string
  structured_formatting: {
    main_text: string
    secondary_text: string
  }
  types: string[]
}): google.maps.places.AutocompletePrediction => {
  return {
    place_id: prediction.place_id,
    description: prediction.description,
    structured_formatting: {
      main_text: prediction.structured_formatting.main_text,
      secondary_text: prediction.structured_formatting.secondary_text,
      main_text_matched_substrings: [],
      secondary_text_matched_substrings: [],
    },
    types: prediction.types,
    matched_substrings: [],
    terms: [],
    reference: "",
  } as unknown as google.maps.places.AutocompletePrediction
}

const MapSearchBar: React.FC<MapSearchBarProps> = ({
  isProjectPage = true,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  const [searchValue, setSearchValue] = useState("")
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [placeSelected, setPlaceSelected] = useState(false)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)

  // Debounce search value with 300ms delay
  const debouncedSearchValue = useDebouncedValue(searchValue, 300)

  // Get current map viewport for location biasing
  const getMapBounds = (): google.maps.LatLngBounds | undefined => {
    const windowWithMap = window as typeof window & {
      googleMap?: google.maps.Map
    }
    const map = windowWithMap.googleMap
    return map?.getBounds()
  }

  const getMapCenter = (): google.maps.LatLng | undefined => {
    const windowWithMap = window as typeof window & {
      googleMap?: google.maps.Map
    }
    const map = windowWithMap.googleMap
    return map?.getCenter() || undefined
  }

  // Use TanStack Query hook for autocomplete
  const trimmedInput = debouncedSearchValue.trim()
  const isCoordinates = looksLikeCoordinates(trimmedInput)
  const shouldFetchAutocomplete =
    !isCoordinates && trimmedInput.length >= 3 && isSearchExpanded

  const {
    data: autocompleteData,
    isLoading: isLoadingAutocomplete,
    error: autocompleteError,
  } = usePlacesAutocomplete(trimmedInput, {
    bounds: shouldFetchAutocomplete ? getMapBounds() : undefined,
    location: shouldFetchAutocomplete ? getMapCenter() : undefined,
    radius: shouldFetchAutocomplete ? 50000 : undefined, // 50km
    enabled: shouldFetchAutocomplete,
  })

  // Convert to Google Maps format
  const autocompleteResults: google.maps.places.AutocompletePrediction[] =
    autocompleteData?.map(convertToGoogleMapsPrediction) || []

  // Navigate to coordinates on map
  const navigateToCoordinates = useCallback((lat: number, lng: number) => {
    const windowWithMap = window as typeof window & {
      googleMap?: google.maps.Map
    }
    const map = windowWithMap.googleMap

    if (!map) {
      console.warn("Map instance not available")
      setSearchError(true)
      setErrorMessage("Map not available")
      return
    }

    try {
      map.setCenter(new google.maps.LatLng(lat, lng))
      // Set a reasonable zoom level if not already zoomed in
      const currentZoom = map.getZoom()
      if (!currentZoom || currentZoom < 10) {
        map.setZoom(15)
      }

      // Dispatch custom event to show temporary marker
      window.dispatchEvent(
        new CustomEvent("showSearchMarker", {
          detail: { lat, lng },
        }),
      )

      setSearchError(false)
      setErrorMessage("")
    } catch (error) {
      console.error("Failed to update map view:", error)
      setSearchError(true)
      setErrorMessage("Failed to navigate to location")
    }
  }, [])

  // Fetch place details when a place is selected
  const {
    data: placeDetails,
    isLoading: isLoadingPlaceDetails,
    error: placeDetailsError,
  } = usePlaceDetails(selectedPlaceId)

  // Navigate to place when details are loaded
  useEffect(() => {
    if (placeDetails && selectedPlaceId) {
      const lat = placeDetails.location.latitude
      const lng = placeDetails.location.longitude
      navigateToCoordinates(lat, lng)
      setSelectedPlaceId(null) // Reset after navigation
    }
  }, [placeDetails, selectedPlaceId, navigateToCoordinates])

  // Validate lat/lng coordinates
  const validateLatLng = (
    input: string,
  ): {
    isValid: boolean
    error?: string
    coordinates?: { lat: number; lng: number }
  } => {
    // If input is empty, it's valid (no error shown)
    if (!input.trim()) {
      return { isValid: true }
    }

    // Remove whitespace
    const cleaned = input.trim()

    // Split by comma or space
    const parts = cleaned.split(/[,\s]+/).filter((p) => p.length > 0)

    if (parts.length === 0) {
      return { isValid: false, error: "Enter coordinates" }
    }

    if (parts.length === 1) {
      return { isValid: false, error: "Enter both lat and lng" }
    }

    if (parts.length > 2) {
      return { isValid: false, error: "Too many values. Use: lat, lng" }
    }

    const lat = parseFloat(parts[0])
    const lng = parseFloat(parts[1])

    // Validate that they are numbers
    if (isNaN(lat) || isNaN(lng)) {
      return { isValid: false, error: "Invalid numbers" }
    }

    // Validate ranges
    if (Math.abs(lat) > 90) {
      return { isValid: false, error: "Latitude must be between -90 and 90" }
    }

    if (Math.abs(lng) > 180) {
      return { isValid: false, error: "Longitude must be between -180 and 180" }
    }

    return { isValid: true, coordinates: { lat, lng } }
  }

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    setSelectedIndex(-1)
    setPlaceSelected(false) // Reset place selected flag when user types

    // Validate coordinates if it looks like coordinates
    if (looksLikeCoordinates(value)) {
      const validation = validateLatLng(value)
      setSearchError(!validation.isValid && value.trim().length > 0)
      setErrorMessage(validation.error || "")
    } else {
      // Clear coordinate errors for place searches
      setSearchError(false)
      setErrorMessage("")
    }

    // Clear marker if search is cleared
    if (!value.trim()) {
      window.dispatchEvent(new CustomEvent("clearSearchMarker"))
    }
  }

  // Handle coordinate submission
  const handleCoordinateSubmit = useCallback(() => {
    if (!searchValue.trim()) {
      return
    }

    const validation = validateLatLng(searchValue)

    if (!validation.isValid || !validation.coordinates) {
      setSearchError(true)
      setErrorMessage(validation.error || "Invalid coordinates")
      return
    }

    const { lat, lng } = validation.coordinates
    navigateToCoordinates(lat, lng)
  }, [searchValue, navigateToCoordinates])

  // Handle place selection from autocomplete
  const handlePlaceSelect = useCallback(
    (prediction: google.maps.places.AutocompletePrediction) => {
      // Update search value to show selected place
      setSearchValue(prediction.description)
      setPlaceSelected(true) // Mark that a place was selected

      // Fetch place details using the hook
      setSelectedPlaceId(prediction.place_id)
    },
    [],
  )

  // Handle search icon click
  const handleSearchIconClick = () => {
    setIsSearchExpanded(true)
  }

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()

        // If there's a selected prediction, select it
        if (selectedIndex >= 0 && autocompleteResults[selectedIndex]) {
          handlePlaceSelect(autocompleteResults[selectedIndex])
        } else if (autocompleteResults.length > 0) {
          // Select first result if available
          handlePlaceSelect(autocompleteResults[0])
        } else if (looksLikeCoordinates(searchValue)) {
          // Submit coordinates
          handleCoordinateSubmit()
        }
      } else if (e.key === "Escape") {
        setIsSearchExpanded(false)
        setSearchValue("")
        setSearchError(false)
        setErrorMessage("")
        window.dispatchEvent(new CustomEvent("clearSearchMarker"))
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        if (autocompleteResults.length > 0) {
          setSelectedIndex((prev) =>
            prev < autocompleteResults.length - 1 ? prev + 1 : prev,
          )
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        if (autocompleteResults.length > 0) {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        }
      }
    },
    [
      selectedIndex,
      autocompleteResults,
      searchValue,
      handlePlaceSelect,
      handleCoordinateSubmit,
    ],
  )

  // Focus input when expanded
  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      const input = searchInputRef.current.querySelector("input")
      if (input) {
        input.focus()
      }
    }
  }, [isSearchExpanded])

  // Handle click outside to collapse
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isSearchExpanded &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        // Only collapse if search value is empty
        if (!searchValue.trim()) {
          setIsSearchExpanded(false)
          setSearchError(false)
          setErrorMessage("")
        }
      }
    }

    if (isSearchExpanded) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
      }
    }
  }, [isSearchExpanded, searchValue])

  // Handle errors
  useEffect(() => {
    if (autocompleteError) {
      console.error("[MapSearchBar] Autocomplete error:", autocompleteError)
      // Don't show error to user for autocomplete failures, just log it
    }
    if (placeDetailsError) {
      console.error("[MapSearchBar] Place details error:", placeDetailsError)
      setSearchError(true)
      setErrorMessage("Failed to get place details")
    }
  }, [autocompleteError, placeDetailsError])

  if (!isProjectPage) return null

  const isPlaceSearch = !looksLikeCoordinates(searchValue)
  const hasMinChars = trimmedInput.length >= 3
  const showAutocomplete =
    isSearchExpanded &&
    isPlaceSearch &&
    searchValue.trim().length > 0 &&
    !placeSelected
  const showMinCharsMessage =
    showAutocomplete && !hasMinChars && !isLoadingAutocomplete

  return (
    <div
      ref={searchContainerRef}
      className="flex items-center gap-1 relative"
      style={{ zIndex: 1001 }}
    >
      {isSearchExpanded ? (
        <div
          ref={searchInputRef}
          onBlur={(e) => {
            // Don't collapse on blur if there's a value or if clicking inside
            const currentTarget = e.currentTarget
            const relatedTarget = e.relatedTarget as Node | null
            if (
              !searchValue.trim() &&
              relatedTarget &&
              !currentTarget.contains(relatedTarget)
            ) {
              setIsSearchExpanded(false)
              setSearchError(false)
              setErrorMessage("")
            }
          }}
        >
          <div className="relative">
            <SearchBar
              placeholder="Search place or lat, lng"
              value={searchValue}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              searchSx={{
                width: "240px",
                minWidth: "240px",
                maxWidth: "240px",
                borderRadius: "24px",
                border: "1px solid #e5e7eb",
                transition: "width 0.3s ease, border-color 0.2s ease",
                "&:hover": {
                  borderColor: "#d1d5db",
                },
                "&:focus-within": {
                  borderColor: PRIMARY_BLUE,
                  boxShadow: "0 0 0 3px rgba(9, 87, 208, 0.1)",
                },
                ...(searchError && {
                  borderColor: "#ef4444",
                  "&:hover": {
                    borderColor: "#ef4444",
                  },
                  "&:focus-within": {
                    borderColor: "#ef4444",
                    boxShadow: "0 0 0 3px rgba(239, 68, 68, 0.1)",
                  },
                }),
              }}
              inputSx={{
                fontSize: "0.75rem",
                "& .MuiInputBase-input": {
                  padding: "6px 10px",
                  paddingLeft: "calc(1em + 20px)",
                  // paddingRight will be overridden by SearchBar when clear button is shown
                },
              }}
            />
            {searchError && errorMessage && (
              <div className="absolute top-full left-0 mt-1 px-2 py-1 text-xs text-red-600 bg-white border border-red-200 rounded-3xl shadow-sm z-50 whitespace-nowrap">
                {errorMessage}
              </div>
            )}
            {showAutocomplete && (
              <AutocompleteDropdown
                predictions={autocompleteResults}
                isOpen={showAutocomplete}
                selectedIndex={selectedIndex}
                onSelect={handlePlaceSelect}
                onClose={() => {}}
                isLoading={isLoadingAutocomplete || isLoadingPlaceDetails}
                anchorElement={searchInputRef.current}
                showMinCharsMessage={showMinCharsMessage}
              />
            )}
          </div>
        </div>
      ) : (
        <Tooltip title="Search place or coordinates" arrow>
          <IconButton
            size="small"
            onClick={handleSearchIconClick}
            className="text-[#5f6368] hover:bg-gray-100"
            aria-label="Search place or coordinates"
            sx={{ padding: "4px" }}
          >
            <SearchIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </div>
  )
}

export default MapSearchBar

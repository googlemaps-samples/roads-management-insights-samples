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

import { getGoogleMapsApiKey } from "../../utils/api-helpers"
import { ApiResponse } from "../api-types"

// Google Places API (New) configuration
const GOOGLE_PLACES_API_KEY = getGoogleMapsApiKey()
const GOOGLE_PLACES_API_BASE_URL = "https://places.googleapis.com/v1"

// Autocomplete request types
export interface PlacesAutocompleteRequest {
  input: string
  locationBias?: {
    rectangle?: {
      low: { latitude: number; longitude: number }
      high: { latitude: number; longitude: number }
    }
    circle?: {
      center: { latitude: number; longitude: number }
      radius: number
    }
  }
  includedRegionCodes?: string[]
  languageCode?: string
  includedPrimaryTypes?: string[]
}

export interface PlacesAutocompleteSuggestion {
  placePrediction: {
    placeId: string
    text: {
      text: string
      matches: Array<{
        startOffset: number
        endOffset: number
      }>
    }
    structuredFormat: {
      mainText: {
        text: string
        matches: Array<{
          startOffset: number
          endOffset: number
        }>
      }
      secondaryText: {
        text: string
      }
    }
    types: string[]
    distanceMeters?: number
  }
}

export interface PlacesAutocompleteResponse {
  suggestions: PlacesAutocompleteSuggestion[]
}

// Place details types
export interface PlaceDetails {
  id: string
  displayName: {
    text: string
    languageCode: string
  }
  formattedAddress: string
  location: {
    latitude: number
    longitude: number
  }
  types: string[]
}

export interface PlaceDetailsResponse {
  id: string
  displayName: {
    text: string
    languageCode: string
  }
  formattedAddress: string
  location: {
    latitude: number
    longitude: number
  }
  types: string[]
}

// Convert new API response to legacy format for compatibility
export interface LegacyAutocompletePrediction {
  place_id: string
  description: string
  structured_formatting: {
    main_text: string
    secondary_text: string
  }
  types: string[]
  distance_meters?: number
}

export const placesApi = {
  // Autocomplete using new Places API (New)
  autocomplete: async (
    input: string,
    options?: {
      bounds?: google.maps.LatLngBounds
      location?: google.maps.LatLng
      radius?: number
      languageCode?: string
      abortSignal?: AbortSignal
    },
  ): Promise<ApiResponse<LegacyAutocompletePrediction[]>> => {
    try {
      if (options?.abortSignal?.aborted) {
        return {
          success: false,
          data: [],
          message: "Request was aborted",
        }
      }

      if (!input || input.trim().length < 3) {
        return {
          success: true,
          data: [],
          message: "Input too short",
        }
      }

      const requestBody: PlacesAutocompleteRequest = {
        input: input.trim(),
        languageCode: options?.languageCode || "en",
        includedRegionCodes: ["IN"], // Default to India
      }

      // Add location biasing if provided
      if (options?.bounds) {
        const ne = options.bounds.getNorthEast()
        const sw = options.bounds.getSouthWest()
        requestBody.locationBias = {
          rectangle: {
            low: {
              latitude: sw.lat(),
              longitude: sw.lng(),
            },
            high: {
              latitude: ne.lat(),
              longitude: ne.lng(),
            },
          },
        }
      } else if (options?.location && options?.radius) {
        requestBody.locationBias = {
          circle: {
            center: {
              latitude: options.location.lat(),
              longitude: options.location.lng(),
            },
            radius: options.radius,
          },
        }
      }

      const response = await fetch(
        `${GOOGLE_PLACES_API_BASE_URL}/places:autocomplete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask":
              "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types,suggestions.placePrediction.distanceMeters",
          },
          body: JSON.stringify(requestBody),
          signal: options?.abortSignal,
        },
      )

      if (options?.abortSignal?.aborted) {
        return {
          success: false,
          data: [],
          message: "Request was aborted",
        }
      }

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          "❌ Google Places API (New) error:",
          response.status,
          errorText,
        )
        return {
          success: false,
          data: [],
          message: `Places API error: ${response.status}`,
        }
      }

      const data: PlacesAutocompleteResponse = await response.json()

      // Debug: Log the response structure if needed
      if (!data.suggestions || data.suggestions.length === 0) {
        console.log("[Places API] Empty suggestions array:", data)
      }

      // Convert new API format to legacy format for compatibility
      const predictions: LegacyAutocompletePrediction[] =
        data.suggestions
          ?.map((suggestion) => {
            // Safely extract data with fallbacks
            const placePrediction = suggestion.placePrediction
            if (!placePrediction) return null

            const text = placePrediction.text?.text || ""
            const structuredFormat = placePrediction.structuredFormat
            const mainText = structuredFormat?.mainText?.text || text || ""
            const secondaryText = structuredFormat?.secondaryText?.text || ""

            const prediction: LegacyAutocompletePrediction = {
              place_id: placePrediction.placeId || "",
              description: text,
              structured_formatting: {
                main_text: mainText,
                secondary_text: secondaryText,
              },
              types: placePrediction.types || [],
            }

            // Only add distance_meters if it exists
            if (placePrediction.distanceMeters !== undefined) {
              prediction.distance_meters = placePrediction.distanceMeters
            }

            return prediction
          })
          .filter(
            (pred): pred is LegacyAutocompletePrediction => pred !== null,
          ) || []

      return {
        success: true,
        data: predictions,
        message: "Autocomplete successful",
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          data: [],
          message: "Request was aborted",
        }
      }
      console.error("❌ Google Places API (New) error:", error)
      return {
        success: false,
        data: [],
        message:
          error instanceof Error ? error.message : "Failed to fetch places",
      }
    }
  },

  // Get place details using new Places API (New)
  getPlaceDetails: async (
    placeId: string,
    options?: {
      languageCode?: string
      abortSignal?: AbortSignal
    },
  ): Promise<ApiResponse<PlaceDetails>> => {
    try {
      if (options?.abortSignal?.aborted) {
        return {
          success: false,
          data: null as any,
          message: "Request was aborted",
        }
      }

      const response = await fetch(
        `${GOOGLE_PLACES_API_BASE_URL}/places/${placeId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask":
              "id,displayName,formattedAddress,location,types",
          },
          signal: options?.abortSignal,
        },
      )

      if (options?.abortSignal?.aborted) {
        return {
          success: false,
          data: null as any,
          message: "Request was aborted",
        }
      }

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          "❌ Google Places API (New) details error:",
          response.status,
          errorText,
        )
        return {
          success: false,
          data: null as any,
          message: `Places API error: ${response.status}`,
        }
      }

      const data: PlaceDetailsResponse = await response.json()

      return {
        success: true,
        data: {
          id: data.id,
          displayName: data.displayName,
          formattedAddress: data.formattedAddress,
          location: data.location,
          types: data.types,
        },
        message: "Place details fetched successfully",
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          data: null as any,
          message: "Request was aborted",
        }
      }
      console.error("❌ Google Places API (New) details error:", error)
      return {
        success: false,
        data: null as any,
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch place details",
      }
    }
  },
}

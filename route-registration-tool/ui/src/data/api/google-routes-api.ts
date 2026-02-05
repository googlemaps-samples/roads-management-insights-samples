import { getGoogleMapsApiKey } from "../../utils/api-helpers"
import { ApiResponse } from "../api-types"

// Google Routes API configuration
const GOOGLE_ROUTES_API_KEY = getGoogleMapsApiKey()
const GOOGLE_ROUTES_API_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes"

interface GoogleRoutesRequest {
  origin: {
    location: {
      latLng: {
        latitude: number
        longitude: number
      }
    }
  }
  destination: {
    location: {
      latLng: {
        latitude: number
        longitude: number
      }
    }
  }
  intermediates?: Array<{
    location: {
      latLng: {
        latitude: number
        longitude: number
      }
    }
  }>
  travelMode: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT"
  extraComputations?: string[]
  requestedReferenceRoutes?: string[]
  routingPreference: string
  routeModifiers?: {
    avoidFerries?: boolean
    avoidTolls?: boolean
    avoidHighways?: boolean
    avoidIndoor?: boolean
    vehicleInfo?: {
      emissionType?: string
    }
  }
  languageCode: string
}

interface GoogleRoutesResponse {
  routes: Array<{
    polyline: {
      encodedPolyline: string
    }
    distanceMeters: number
    duration?: string
  }>
}

export const googleRoutesApi = {
  // Generate route from points using Google Routes API
  generateRoute: async (
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    waypoints: Array<{ lat: number; lng: number }> = [],
    abortSignal?: AbortSignal,
  ): Promise<
    ApiResponse<{
      encodedPolyline: string
      distance: number
      duration: number
    } | null>
  > => {
    try {
      // Check if request was aborted before starting
      if (abortSignal?.aborted) {
        return {
          success: false,
          data: null,
          message: "Request was aborted",
        }
      }

      // Build payload matching use-google-routes-api.ts
      const requestBody: GoogleRoutesRequest = {
        origin: {
          location: {
            latLng: {
              latitude: origin.lat,
              longitude: origin.lng,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: destination.lat,
              longitude: destination.lng,
            },
          },
        },
        travelMode: "DRIVE",
        extraComputations: ["TRAFFIC_ON_POLYLINE"],
        requestedReferenceRoutes: ["SHORTER_DISTANCE"],
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
        routeModifiers: {
          avoidFerries: true,
          vehicleInfo: {
            emissionType: "GASOLINE",
          },
        },
        languageCode: "en-US",
      }

      // Add waypoints if provided
      if (waypoints && waypoints.length > 0) {
        requestBody.intermediates = waypoints.map((waypoint) => ({
          location: {
            latLng: {
              latitude: waypoint.lat,
              longitude: waypoint.lng,
            },
          },
        }))
      }

      // Call Google Routes API
      const response = await fetch(GOOGLE_ROUTES_API_URL, {
        method: "POST",
        headers: {
          "X-Goog-FieldMask":
            "routes.polyline,routes.distanceMeters,routes.duration",
          "X-Goog-Api-Key": GOOGLE_ROUTES_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      })

      // Check if request was aborted after fetch
      if (abortSignal?.aborted) {
        return {
          success: false,
          data: null,
          message: "Request was aborted",
        }
      }

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          "❌ Google Routes API v2 error:",
          response.status,
          errorText,
        )
        return {
          success: false,
          data: null,
          message:
            "An error occurred while generating the route. Please try again.",
        }
      }

      let data: GoogleRoutesResponse
      try {
        data = await response.json()
      } catch (parseError) {
        console.error("❌ Google Routes API v2 JSON parsing error:", parseError)
        return {
          success: false,
          data: null,
          message:
            "An error occurred while generating the route. Please try again.",
        }
      }

      // Check if request was aborted after parsing response
      if (abortSignal?.aborted) {
        return {
          success: false,
          data: null,
          message: "Request was aborted",
        }
      }

      // Extract route data
      if (!data.routes || data.routes.length === 0) {
        return {
          success: false,
          data: null,
          message: "No routes found",
        }
      }

      // Select the second route if multiple routes are available, otherwise use the first
      const routeIndex = data.routes.length >= 2 ? 1 : 0
      const route = data.routes[routeIndex]
      const encodedPolyline = route.polyline?.encodedPolyline || ""

      // Check if polyline is empty - this means no route exists between the points
      if (!encodedPolyline || encodedPolyline.trim() === "") {
        return {
          success: false,
          data: null,
          message:
            "No routes found between these points. Please select different points.",
        }
      }

      const distanceMeters = route.distanceMeters
      const durationSeconds = route.duration
        ? parseInt(route.duration.replace("s", ""))
        : 0

      return {
        success: true,
        data: {
          encodedPolyline,
          distance: distanceMeters / 1000, // Convert to km
          duration: durationSeconds / 60, // Convert to minutes
        },
        message: "Route generated successfully",
      }
    } catch (error) {
      // Don't show error if request was aborted
      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          data: null,
          message: "Request was aborted",
        }
      }
      console.error("❌ Google Routes API v2 error:", error)
      return {
        success: false,
        data: null,
        message:
          "An error occurred while generating the route. Please try again.",
      }
    }
  },
}

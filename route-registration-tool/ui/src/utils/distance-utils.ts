// ui/src/utils/distance-utils.ts
import { useUserPreferencesStore } from "../stores/user-preferences-store"
import { DistanceUnit } from "../types/user"

/**
 * Format distance value based on unit preference
 * @param distanceKm Distance in kilometers
 * @param unit Distance unit ("km" or "miles")
 * @returns Formatted distance string
 */
export const formatDistance = (
  distanceKm: number,
  unit: DistanceUnit = "km",
): string => {
  // Handle NaN, null, undefined, or invalid values
  if (
    distanceKm === null ||
    distanceKm === undefined ||
    isNaN(distanceKm) ||
    !isFinite(distanceKm)
  ) {
    return unit === "miles" ? "0 mi" : "0 km"
  }

  // Ensure non-negative
  const validDistance = Math.max(0, distanceKm)

  if (unit === "miles") {
    const miles = validDistance * 0.621371
    if (miles < 0.1) {
      return `${Math.round(miles * 5280)} ft`
    }
    return `${miles.toFixed(2)} mi`
  }

  // Default to km
  if (validDistance < 0.1) {
    return `${Math.round(validDistance * 1000)} m`
  }
  return `${validDistance.toFixed(2)} km`
}

/**
 * Hook to get the current distance unit from user preferences
 * @returns Current distance unit ("km" or "miles")
 */
export const useDistanceUnit = (): DistanceUnit => {
  return useUserPreferencesStore((state) => state.distanceUnit)
}

/**
 * Format duration in minutes to a human-readable string
 * @param minutes Duration in minutes
 * @returns Formatted duration string (e.g., "5 min", "1h 30min")
 */
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)} min`
  }
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`
}

/**
 * Convert kilometers to miles
 * @param km Distance in kilometers
 * @returns Distance in miles
 */
export const convertKmToMiles = (km: number): number => {
  return km * 0.621371
}

/**
 * Convert miles to kilometers
 * @param miles Distance in miles
 * @returns Distance in kilometers
 */
export const convertMilesToKm = (miles: number): number => {
  return miles / 0.621371
}

/**
 * Calculate distance between two points in pixels on screen
 * @param point1 Screen coordinates {x, y}
 * @param point2 Screen coordinates {x, y}
 * @returns Distance in pixels
 */
export const getScreenDistance = (
  point1: { x: number; y: number },
  point2: { x: number; y: number },
): number => {
  const dx = point2.x - point1.x
  const dy = point2.y - point1.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Calculate distance between two geographic points in meters
 * Uses Haversine formula
 * @param point1 {lat, lng}
 * @param point2 {lat, lng}
 * @returns Distance in meters
 */
export const getGeographicDistance = (
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number },
): number => {
  const R = 6371000 // Earth radius in meters
  const dLat = ((point2.lat - point1.lat) * Math.PI) / 180
  const dLng = ((point2.lng - point1.lng) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.lat * Math.PI) / 180) *
      Math.cos((point2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Convert geographic point to screen coordinates
 * @param map Google Maps instance
 * @param lat Latitude
 * @param lng Longitude
 * @returns Screen coordinates {x, y} or null
 */
export const latLngToScreen = (
  map: google.maps.Map,
  lat: number,
  lng: number,
): { x: number; y: number } | null => {
  try {
    const overlay = new google.maps.OverlayView()
    let result: { x: number; y: number } | null = null

    overlay.onAdd = function () {}
    overlay.draw = function () {
      const proj = this.getProjection()
      if (proj) {
        const latLng = new google.maps.LatLng(lat, lng)
        const pixel = proj.fromLatLngToContainerPixel(latLng)
        if (pixel) {
          result = { x: pixel.x, y: pixel.y }
        }
      }
    }
    overlay.setMap(map)
    overlay.draw()
    overlay.setMap(null)

    return result
  } catch (error) {
    console.warn("Failed to convert lat/lng to screen:", error)
    return null
  }
}

export function convertToUserUnit(km: number, unit: DistanceUnit): number {
  if (unit === "miles") {
    return convertKmToMiles(km)
  }
  return km
}

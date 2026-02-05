/**
 * GeoJSON validation utilities for region creation
 */

export interface ValidationResult {
  isValid: boolean
  error?: string
  geometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon
  fullGeoJson?: any
}

export interface GeoJsonValidationOptions {
  allowFeatureCollection?: boolean
  allowPolygon?: boolean
  allowMultiPolygon?: boolean
  requireClosedRings?: boolean
}

const defaultOptions: GeoJsonValidationOptions = {
  allowFeatureCollection: true,
  allowPolygon: true,
  allowMultiPolygon: false,
  requireClosedRings: true,
}

/**
 * Validates GeoJSON and extracts geometry for map display
 */
export function validateGeoJson(
  geoJson: any,
  options: GeoJsonValidationOptions = {},
): ValidationResult {
  const opts = { ...defaultOptions, ...options }

  try {
    // Check if it's valid JSON
    if (typeof geoJson === "string") {
      geoJson = JSON.parse(geoJson)
    }

    // Validate basic GeoJSON structure
    if (!geoJson || typeof geoJson !== "object") {
      return {
        isValid: false,
        error: "Invalid JSON format. Please provide a valid GeoJSON object.",
      }
    }

    // Handle FeatureCollection
    if (geoJson.type === "FeatureCollection") {
      if (!opts.allowFeatureCollection) {
        return {
          isValid: false,
          error:
            "FeatureCollection is not allowed. Please provide a single Polygon or Feature.",
        }
      }

      if (!Array.isArray(geoJson.features) || geoJson.features.length === 0) {
        return {
          isValid: false,
          error: "FeatureCollection must contain at least one feature.",
        }
      }

      // Use the first feature's geometry
      const firstFeature = geoJson.features[0]
      if (!firstFeature.geometry) {
        return {
          isValid: false,
          error:
            "First feature in FeatureCollection must have a geometry property.",
        }
      }

      return validateGeometry(firstFeature.geometry, geoJson, opts)
    }

    // Handle Feature
    if (geoJson.type === "Feature") {
      if (!geoJson.geometry) {
        return {
          isValid: false,
          error: "Feature must have a geometry property.",
        }
      }

      return validateGeometry(geoJson.geometry, geoJson, opts)
    }

    // Handle direct geometry
    return validateGeometry(geoJson, geoJson, opts)
  } catch (error) {
    return {
      isValid: false,
      error: "Invalid JSON format. Please check your GeoJSON syntax.",
    }
  }
}

function validateGeometry(
  geometry: any,
  fullGeoJson: any,
  options: GeoJsonValidationOptions,
): ValidationResult {
  if (!geometry || typeof geometry !== "object") {
    return {
      isValid: false,
      error: "Invalid geometry format.",
    }
  }

  const { type, coordinates } = geometry

  // Check geometry type
  if (type === "Polygon") {
    if (!options.allowPolygon) {
      return {
        isValid: false,
        error: "Polygon geometry is not allowed.",
      }
    }

    return validatePolygonCoordinates(coordinates, fullGeoJson)
  }

  if (type === "MultiPolygon") {
    if (!options.allowMultiPolygon) {
      return {
        isValid: false,
        error:
          "MultiPolygon geometry is not allowed. Please use a single Polygon.",
      }
    }

    return validateMultiPolygonCoordinates(coordinates, fullGeoJson)
  }

  return {
    isValid: false,
    error: `Unsupported geometry type: ${type}. Only Polygon and MultiPolygon are supported.`,
  }
}

function validatePolygonCoordinates(
  coordinates: any,
  fullGeoJson: any,
): ValidationResult {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return {
      isValid: false,
      error: "Polygon coordinates must be a non-empty array.",
    }
  }

  // Check each ring
  for (let i = 0; i < coordinates.length; i++) {
    const ring = coordinates[i]
    if (!Array.isArray(ring) || ring.length < 4) {
      return {
        isValid: false,
        error: `Ring ${i} must be an array with at least 4 coordinate pairs.`,
      }
    }

    // Check if ring is closed (first and last coordinates should be the same)
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) {
      return {
        isValid: false,
        error: `Ring ${i} is not closed. The first and last coordinates must be identical.`,
      }
    }

    // Validate coordinate pairs
    for (let j = 0; j < ring.length; j++) {
      const coord = ring[j]
      if (!Array.isArray(coord) || coord.length < 2) {
        return {
          isValid: false,
          error: `Invalid coordinate at ring ${i}, position ${j}. Each coordinate must be [longitude, latitude].`,
        }
      }

      const [lng, lat] = coord
      if (typeof lng !== "number" || typeof lat !== "number") {
        return {
          isValid: false,
          error: `Invalid coordinate at ring ${i}, position ${j}. Longitude and latitude must be numbers.`,
        }
      }

      if (lng < -180 || lng > 180) {
        return {
          isValid: false,
          error: `Invalid longitude at ring ${i}, position ${j}. Longitude must be between -180 and 180.`,
        }
      }

      if (lat < -90 || lat > 90) {
        return {
          isValid: false,
          error: `Invalid latitude at ring ${i}, position ${j}. Latitude must be between -90 and 90.`,
        }
      }
    }
  }

  return {
    isValid: true,
    geometry: {
      type: "Polygon",
      coordinates,
    } as GeoJSON.Polygon,
    fullGeoJson,
  }
}

function validateMultiPolygonCoordinates(
  coordinates: any,
  fullGeoJson: any,
): ValidationResult {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return {
      isValid: false,
      error: "MultiPolygon coordinates must be a non-empty array.",
    }
  }

  // Validate each polygon
  for (let i = 0; i < coordinates.length; i++) {
    const polygonResult = validatePolygonCoordinates(
      coordinates[i],
      fullGeoJson,
    )
    if (!polygonResult.isValid) {
      return {
        isValid: false,
        error: `Polygon ${i}: ${polygonResult.error}`,
      }
    }
  }

  return {
    isValid: true,
    geometry: {
      type: "MultiPolygon",
      coordinates,
    } as GeoJSON.MultiPolygon,
    fullGeoJson,
  }
}

/**
 * Extracts geometry from GeoJSON for map display
 */
export function extractGeometryFromGeoJson(
  geoJson: any,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const validation = validateGeoJson(geoJson)
  return validation.isValid ? validation.geometry || null : null
}

/**
 * Creates a sample GeoJSON for user reference
 */
export function createSampleGeoJson(): any {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          coordinates: [
            [
              [1.6907442136105715, 49.28780499905099],
              [1.6612205986124309, 49.16991009961717],
              [1.6209858191267017, 49.1292272985076],
              [1.537605455151521, 49.10651602745628],
              [1.438357564220894, 49.06210076497226],
              [1.4914841490810034, 48.960001897615655],
              [1.5263324345023648, 48.840894117564886],
              [1.558831885197833, 48.72641066931615],
              [1.592496398595415, 48.64857854952592],
              [1.700351420112952, 48.569535864714226],
              [1.7393032272417202, 48.50688927030936],
              [1.818058695765501, 48.444381092798295],
              [1.9303156116553453, 48.380741644365884],
              [1.9268624213131034, 48.30947430220533],
              [2.0045020410304346, 48.27391346337771],
              [2.190678193229843, 48.27128575148848],
              [2.3172653786228636, 48.2949272097668],
              [2.4098153317112576, 48.25424046088531],
              [2.4330211737642458, 48.19401675274608],
              [2.410871497517661, 48.11956302477387],
              [2.4913023446169404, 48.11573395145501],
              [2.6632636462509254, 48.08468858803869],
              [2.8178827186759463, 48.10176989137821],
              [2.972949892576395, 48.144827008308226],
              [3.0857547875696696, 48.20868401985865],
              [3.0642273996304823, 48.28175314287503],
              [3.1106712320249414, 48.33537211367701],
              [3.2903576381413018, 48.32745506478744],
              [3.468726198980818, 48.349600195662816],
              [3.4822166846025766, 48.44779263004085],
              [3.503013466068694, 48.530539540143394],
              [3.649367178174316, 48.61061765373742],
              [3.5138370487785267, 48.69838492227862],
              [3.4930335676459663, 48.772895328056364],
              [3.5573077557801014, 48.848639088148616],
              [3.396182783443521, 48.94163797506701],
              [3.2770865138660383, 49.01340373511073],
              [3.1928949221551477, 49.13798924148617],
              [3.028187593213147, 49.13353330328994],
              [2.8022767505671595, 49.10232096456903],
              [2.4964120704534025, 49.18012595964933],
              [2.2408336767189496, 49.20622455759781],
              [2.037207162111372, 49.207493185801695],
              [1.8209446908212215, 49.19243001982139],
              [1.6907442136105715, 49.28780499905099],
            ],
          ],
          type: "Polygon",
        },
      },
    ],
  }
}

/**
 * Downloads sample GeoJSON as a file
 */
export function downloadSampleGeoJson(): void {
  const sampleGeoJson = createSampleGeoJson()
  const dataStr = JSON.stringify(sampleGeoJson, null, 2)
  const dataBlob = new Blob([dataStr], { type: "application/json" })

  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement("a")
  link.href = url
  link.download = "sample-region.geojson"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

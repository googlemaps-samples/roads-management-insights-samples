/**
 * Unified type for all road/route entities in the import flow
 * All roads (imported, selected, stretched, panel routes, highlighted, multi-selected, routeInMaking)
 * use this same GeoJSON Feature structure
 */
export interface ImportedRoadFeature
  extends GeoJSON.Feature<GeoJSON.LineString> {
  type: "Feature"
  geometry: GeoJSON.LineString
  properties: {
    road_id: string // Unique identifier
    name?: string // Road name
    length: number // Length in km
    priority?: string // Road priority (e.g., "ROAD_PRIORITY_MINOR_ARTERIAL")
    start_point: [number, number] // [lng, lat] - exact coordinates from API
    end_point: [number, number] // [lng, lat] - exact coordinates from API

    // Visual/metadata properties (determined by state)
    featureType?: "road" | "route" // Type of feature
    layerId?: string // Which layer this belongs to
    color?: [number, number, number, number] // RGBA color array

    // State tracking (optional, for internal use)
    isInRouteInMaking?: boolean // Part of current route being built
    isValidForFront?: boolean // Can be added to front of routeInMaking
    isValidForBack?: boolean // Can be added to back of routeInMaking
    isSelected?: boolean // In panelRoutes
    isHovered?: boolean // Currently hovered
    isStretched?: boolean // Created via stretch flow
    isMultiSelected?: boolean // Created via multi-select flow
  }
}

export interface ImportedRoadsCollection extends GeoJSON.FeatureCollection {
  type: "FeatureCollection"
  features: ImportedRoadFeature[]
}

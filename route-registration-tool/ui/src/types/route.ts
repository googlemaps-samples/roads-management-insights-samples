import { RoadPriority } from "../constants/road-priorities"
import { Coordinates } from "./common"

export type RouteType = "individual" | "arterial" | "city_block"
export type SyncStatus = "unsynced" | "validating" | "synced" | "invalid"
export type SegmentationType = "manual" | "distance" | "intersections"
export type CutPointAction = "add" | "remove" | "move" | "reorder"

export interface Route {
  id: string
  regionId: string
  name: string
  type: RouteType
  length: number // km
  roadType: string // e.g., "Highway", "Urban Road", "Arterial"
  isSegmented: boolean
  roads: Road[]
  syncStatus: SyncStatus
  lastSyncedAt?: string

  // Segmentation metadata
  segmentationType?: SegmentationType
  segmentationConfig?: SegmentationConfig
  lastSegmentationAt?: string
  cutPoints?: CutPoint[]

  // Route creation data
  originCoordinates?: Coordinates
  destinationCoordinates?: Coordinates
  encodedPolyline?: string
  waypoints?: Coordinates[]
  polygonArea?: GeoJSON.Polygon

  // Metadata
  createdAt: string
  updatedAt: string
  // Categorization
  tag?: string | null
}

export interface Road {
  id: string
  routeId: string
  name: string
  length: number // km
  surfaceType: string // e.g., "Asphalt", "Concrete", "Gravel"
  laneCount: number
  maxSpeedKmh: number
  syncStatus: SyncStatus
  lastSyncedAt?: string

  // Geographic data
  linestringGeoJson: GeoJSON.LineString
  segmentOrder: number
  priority?: RoadPriority

  // Road characteristics
  roadClass: "primary" | "secondary" | "tertiary" | "residential" | "service"
  oneWay: boolean
  tollRoad: boolean

  is_enabled?: boolean
  is_selected?: boolean

  // Metadata
  createdAt: string
  updatedAt: string
}

export interface CreateRouteRequest {
  regionId: string
  name: string
  type: RouteType
  originCoordinates?: Coordinates
  destinationCoordinates?: Coordinates
  waypoints?: Coordinates[]
  polygonArea?: GeoJSON.Polygon
}

export interface UpdateRouteRequest {
  name?: string
  type?: RouteType
  originCoordinates?: Coordinates
  destinationCoordinates?: Coordinates
  waypoints?: Coordinates[]
  polygonArea?: GeoJSON.Polygon
}

export interface SyncRouteRequest {
  routeIds: string[]
}

export interface SyncResponse {
  success: boolean
  syncedRoutes: string[]
  errors: { routeId: string; error: string }[]
  message: string
}

// Utility types for filtering and sorting
export type RouteFilter = {
  type?: RouteType[]
  syncStatus?: SyncStatus[]
  isSegmented?: boolean
}

export type RouteSortBy =
  | "name"
  | "createdAt"
  | "updatedAt"
  | "length"
  | "syncStatus"
export type SortOrder = "asc" | "desc"

// ===== ARTERIAL & CITY BLOCK ROUTE TYPES =====

// Route data structure from sample-route-list.ts and API responses
export interface ArterialRoute {
  id?: string // Will be generated from name or provided by API
  name: string
  origin: [number, number] // [lng, lat]
  destination: [number, number] // [lng, lat]
  distance: number // km
  linestring: Array<[number, number]> // Array of [lng, lat] coordinates
  roads: ArterialRoadSegment[]
  waypoints?: Array<[number, number]> // Optional waypoints
  is_selected: boolean // Selection state
}

export interface ArterialRoadSegment {
  name: string
  coordinates: Array<[number, number]> // [lng, lat]
  distance: number // km
}

// City Block boundary polygon
export interface CityBlockBoundary {
  id: string
  name: string
  polygon: GeoJSON.Polygon
  area: number // sq km
  createdAt: string
}

// ===== ENHANCED SEGMENTATION TYPES =====

export interface CutPoint {
  id: string
  routeId: string
  cutOrder: number
  coordinates: Coordinates
  snappedCoordinates?: Coordinates
  distanceFromStart: number // meters
  isDragging?: boolean
  isSnapped?: boolean
  createdAt: string
  updatedAt: string
}

export interface SegmentationConfig {
  distanceKm?: number
  cutPointsCount?: number
  snapToRoute?: boolean
  snapPrecision?: number // meters
}

export interface SegmentationSnapshot {
  id: string
  routeId: string
  cutPoints: CutPoint[]
  segments: Road[]
  createdAt: Date
  description?: string
}

export interface CutPointHistory {
  action: CutPointAction
  cutPoint: CutPoint
  previousPosition?: Coordinates
  previousOrder?: number
  timestamp: number
}

// API request/response types for cut points
export interface CreateCutPointRequest {
  cutOrder: number
  coordinates: Coordinates
  snappedCoordinates?: Coordinates
  distanceFromStart: number
}

export interface UpdateCutPointRequest {
  coordinates?: Coordinates
  snappedCoordinates?: Coordinates
  distanceFromStart?: number
}

export interface BulkUpdateCutPointsRequest {
  cutPoints: Array<{
    id: string
    cutOrder?: number
    coordinates?: Coordinates
    snappedCoordinates?: Coordinates
    distanceFromStart?: number
  }>
}

// Segmentation state for UI
export interface SegmentationState {
  targetRoute: Route | null
  cutPoints: CutPoint[]
  type: SegmentationType
  distanceKm?: number
  isActive: boolean
  previewSegments: Road[]
  isCalculating: boolean
  error?: string
  snapToRoute: boolean
  snapPrecision: number
  isDragging: boolean
  dragStartPosition?: Coordinates
}

// Virtual scrolling types
export interface VirtualScrollItem {
  id: string
  index: number
  height: number
}

export interface VirtualScrollConfig {
  itemHeight: number
  containerHeight: number
  overscan?: number
}

export interface SegmentListItem extends Road {
  cutPointBefore?: CutPoint
  cutPointAfter?: CutPoint
  isSelected?: boolean
  isHighlighted?: boolean
}

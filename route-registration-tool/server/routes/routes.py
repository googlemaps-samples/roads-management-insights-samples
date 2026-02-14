# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


# server/routes/routes.py (updated version)
import logging
import math
import json
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime
from server.db.database import query_db
from server.utils.firebase_logger import log_route_creation_async
import polyline

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("routes_api")

router = APIRouter(prefix="/routes", tags=["Routes"])

MAX_ROUTES_PER_PROJECT = 1000

# --------------------------
# Pydantic Models (Frontend Compatible)
# --------------------------

class RouteCoordinates(BaseModel):
    """Coordinates structure for routes"""
    origin: List[float] = Field(..., description="Origin coordinates [lng, lat]")
    destination: List[float] = Field(..., description="Destination coordinates [lng, lat]")
    waypoints: List[List[float]] = Field(default=[], description="Waypoints [[lng, lat], ...]")

class RouteSaveRequest(BaseModel):
    """Model for saving a route - matches frontend exactly"""
    uuid: str = Field(..., description="Route UUID")
    route_name: str = Field(..., description="Name of the route")
    coordinates: RouteCoordinates = Field(..., description="Route coordinates")
    encoded_polyline: Optional[str] = Field(None, description="Encoded polyline")
    region_id: int = Field(..., description="Region ID (maps to project_id)")  # Frontend sends region_id
    polygon_id: Optional[int] = Field(None, description="Polygon ID")
    existing_road_id: Optional[int] = None  # NEW: Link to existing road when we create a route from a road
    tag: Optional[str] = None
    length: Optional[float] = None
    route_type: Optional[str] = Field(None, description="Route type (defaults to 'individual')")
    original_route_geo_json: Optional[Any] = Field(None, description="Original route GeoJSON data")
    match_percentage: Optional[float] = Field(None, description="Match/similarity percentage (0-100)")

class RouteSaveResponse(BaseModel):
    """Response for route save - matches frontend exactly"""
    success: bool
    data: Dict[str, Any]  # Frontend expects simple dict with id, uuid, route_name, created_at, updated_at
    message: str

class RouteMetadataOut(BaseModel):
    """Model for route metadata (lightweight, no roads)"""
    uuid: str
    project_id: int
    route_name: str
    origin: str
    destination: str
    waypoints: Optional[str] = None
    center: Optional[str] = None
    route_type: Optional[str] = None
    length: Optional[float] = None
    encoded_polyline: Optional[str] = None
    parent_route_id: Optional[str] = None
    has_children: bool = False
    is_segmented: bool = False
    segmentation_type: Optional[str] = None
    segmentation_points: Optional[str] = None
    sync_status: str = "unsynced"
    is_enabled: bool = True
    tag: Optional[str] = None
    segment_order: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    deleted_at: Optional[str] = None

class RouteOut(BaseModel):
    """Model for route responses (no roads, only segments)"""
    uuid: str
    project_id: int
    route_name: str
    origin: str
    destination: str
    waypoints: Optional[str] = None
    center: Optional[str] = None
    route_type: Optional[str] = None
    length: Optional[float] = None
    encoded_polyline: Optional[str] = None  # Add encoded polyline field
    parent_route_id: Optional[str] = None
    has_children: bool = False
    is_segmented: bool = False
    segmentation_type: Optional[str] = None
    segmentation_points: Optional[str] = None
    segmentation_config: Optional[str] = None
    sync_status: str = "unsynced"
    is_enabled: bool = True
    tag: Optional[str] = None
    segments: List[RouteMetadataOut] = []  # Include child route segments
    original_route_geo_json: Optional[Any] = None  # Original uploaded route GeoJSON data
    match_percentage: Optional[float] = None  # Match/similarity percentage (0-100)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    deleted_at: Optional[str] = None
    temp_geometry: Optional[str] = None
    routes_status: Optional[str] = None

class PaginatedRoutesResponse(BaseModel):
    """Response model for paginated routes"""
    routes: List[RouteOut]
    pagination: Dict[str, Any] = Field(
        ..., 
        description="Pagination info: {total, page, limit, hasMore}"
    )

class UnifiedSearchItem(BaseModel):
    """Item in unified search results - can be either a route or a segment"""
    type: str = Field(..., description="'route' or 'segment'")
    route: Optional[RouteOut] = Field(None, description="Route data (present if type='route')")
    segment: Optional[RouteMetadataOut] = Field(None, description="Segment data (present if type='segment')")
    parent_route: Optional[RouteMetadataOut] = Field(None, description="Parent route data (present if type='segment')")

class UnifiedSearchResponse(BaseModel):
    """Response model for unified search (routes + segments)"""
    items: List[UnifiedSearchItem]
    pagination: Dict[str, Any] = Field(
        ..., 
        description="Pagination info: {total, page, limit, hasMore}"
    )

class SegmentToggleRequest(BaseModel):
    """Request to toggle segment enabled status"""
    is_enabled: bool = Field(..., description="New enabled status for the segment")

# --------------------------
# Helper Functions
# --------------------------

def calculate_center(coordinates: RouteCoordinates) -> Dict[str, float]:
    """Calculate center point of route"""
    all_points = [coordinates.origin] + coordinates.waypoints + [coordinates.destination]
    
    lat_sum = sum(point[1] for point in all_points)  # lat
    lng_sum = sum(point[0] for point in all_points)  # lng
    
    return {
        "lat": lat_sum / len(all_points),
        "lng": lng_sum / len(all_points)
    }

def calculate_spatial_fields(encoded_polyline: str) -> Dict[str, float]:
    """
    Calculate spatial fields (start/end points and bounding box) from encoded polyline.
    Handles both JSON format (GeoJSON or coordinate array) and Google encoded polyline strings.
    Returns dict with start_lat, start_lng, end_lat, end_lng, min_lat, max_lat, min_lng, max_lng
    """
    if not encoded_polyline:
        return {
            "start_lat": None, "start_lng": None,
            "end_lat": None, "end_lng": None,
            "min_lat": None, "max_lat": None,
            "min_lng": None, "max_lng": None
        }
    
    try:
        coords = None
        
        # Strategy 1: Try parsing as JSON (for routes with JSON coordinates)
        try:
            polyline_data = json.loads(encoded_polyline)
            
            # Case 1: GeoJSON format with coordinates key
            if isinstance(polyline_data, dict) and 'coordinates' in polyline_data:
                coords = polyline_data['coordinates']
                # Coords are in [lng, lat] format
                
            # Case 2: Direct array of coordinates
            elif isinstance(polyline_data, list) and len(polyline_data) > 0:
                # Check if it's an array of coordinate pairs
                if isinstance(polyline_data[0], list) and len(polyline_data[0]) == 2:
                    coords = polyline_data
                    # Coords are in [lng, lat] format
                    
        except (json.JSONDecodeError, ValueError):
            # Strategy 2: Try decoding as Google polyline encoded string
            try:
                decoded = polyline.decode(encoded_polyline)
                # decode_polyline returns (lat, lng) tuples, convert to [lng, lat] arrays
                coords = [[lng, lat] for lat, lng in decoded]
            except Exception as decode_error:
                logger.warning(f"Failed to decode polyline as Google encoded string: {decode_error}")
                return {
                    "start_lat": None, "start_lng": None,
                    "end_lat": None, "end_lng": None,
                    "min_lat": None, "max_lat": None,
                    "min_lng": None, "max_lng": None
                }
        
        # Validate coordinates
        if not coords or len(coords) < 2:
            logger.warning(f"Invalid coordinates: {len(coords) if coords else 0} points")
            return {
                "start_lat": None, "start_lng": None,
                "end_lat": None, "end_lng": None,
                "min_lat": None, "max_lat": None,
                "min_lng": None, "max_lng": None
            }
        
        # Calculate spatial fields
        # Coords are now guaranteed to be in [lng, lat] format
        start_lng, start_lat = coords[0][0], coords[0][1]
        end_lng, end_lat = coords[-1][0], coords[-1][1]
        
        # Calculate bounding box
        lats = [c[1] for c in coords]
        lngs = [c[0] for c in coords]
        min_lat, max_lat = min(lats), max(lats)
        min_lng, max_lng = min(lngs), max(lngs)
        
        return {
            "start_lat": start_lat,
            "start_lng": start_lng,
            "end_lat": end_lat,
            "end_lng": end_lng,
            "min_lat": min_lat,
            "max_lat": max_lat,
            "min_lng": min_lng,
            "max_lng": max_lng
        }
    
    except Exception as e:
        logger.warning(f"Failed to calculate spatial fields: {e}")
        return {
            "start_lat": None, "start_lng": None,
            "end_lat": None, "end_lng": None,
            "min_lat": None, "max_lat": None,
            "min_lng": None, "max_lng": None
        }

async def get_child_routes(parent_route_uuid: str) -> List[RouteMetadataOut]:
    """Get all child routes (segments) for a parent route"""
    try:
        query = """
        SELECT uuid, project_id, route_name, origin, destination, waypoints, center,
               route_type, length, encoded_polyline, parent_route_id, has_children, is_segmented,
               segmentation_type, segmentation_points, segmentation_config,
               sync_status, is_enabled, tag, created_at, updated_at, deleted_at,
               segment_order
        FROM routes 
        WHERE parent_route_id = ? AND deleted_at IS NULL
        ORDER BY COALESCE(segment_order, 999999), uuid ASC
        """
        
        logger.info(f"Fetching child routes for parent_route_id: {parent_route_uuid}")
        rows = await query_db(query, (parent_route_uuid,))
        logger.info(f"Query returned {len(rows)} rows for parent_route_id: {parent_route_uuid}")
        
        if len(rows) == 0:
            # Check if there are any rows with this parent_route_id (including deleted)
            check_query = """
            SELECT uuid, route_name, parent_route_id, deleted_at
            FROM routes 
            WHERE parent_route_id = ?
            """
            all_rows = await query_db(check_query, (parent_route_uuid,))
            logger.warning(f"Found {len(all_rows)} total rows (including deleted) with parent_route_id={parent_route_uuid}")
            for r in all_rows:
                logger.warning(f"  - {r['uuid']}: {r['route_name']}, deleted_at={r.get('deleted_at')}")
        
        return [row_to_route_metadata(row) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching child routes for {parent_route_uuid}: {str(e)}", exc_info=True)
        return []

def row_to_route_metadata(row) -> RouteMetadataOut:
    """Convert database row to RouteMetadataOut model (no roads)"""
    return RouteMetadataOut(
        uuid=row["uuid"],
        project_id=row["project_id"],
        route_name=row["route_name"],
        origin=row["origin"],
        destination=row["destination"],
        waypoints=row["waypoints"],
        center=row["center"],
        route_type=row["route_type"],
        length=row["length"],
        encoded_polyline=row["encoded_polyline"],
        parent_route_id=row["parent_route_id"],
        has_children=bool(row["has_children"]),
        is_segmented=bool(row["is_segmented"]),
        segmentation_type=row["segmentation_type"],
        segmentation_points=row["segmentation_points"],
        segmentation_config=row["segmentation_config"],
        sync_status=row["sync_status"],
        is_enabled=bool(row["is_enabled"]),
        tag=row["tag"] if "tag" in row.keys() else None,
        segment_order=row["segment_order"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        deleted_at=row["deleted_at"]
    )

def row_to_route_out(row, segments: List[RouteMetadataOut] = []) -> RouteOut:
    """Convert database row to RouteOut model (with segments, no roads)"""
    # Parse original_route_geo_json if it's a string
    original_route_geo_json = row["original_route_geo_json"] if "original_route_geo_json" in row.keys() else None
    if original_route_geo_json and isinstance(original_route_geo_json, str):
        try:
            original_route_geo_json = json.loads(original_route_geo_json)
        except (json.JSONDecodeError, ValueError):
            logger.warning(f"Failed to parse original_route_geo_json for route {row['uuid']}")
            original_route_geo_json = None
    
    return RouteOut(
        uuid=row["uuid"],
        project_id=row["project_id"],
        route_name=row["route_name"],
        origin=row["origin"],
        destination=row["destination"],
        waypoints=row["waypoints"],
        center=row["center"],
        route_type=row["route_type"],
        length=row["length"],
        encoded_polyline=row["encoded_polyline"],  # Include encoded polyline
        parent_route_id=row["parent_route_id"],
        has_children=bool(row["has_children"]),
        is_segmented=bool(row["is_segmented"]),
        segmentation_type=row["segmentation_type"],
        segmentation_points=row["segmentation_points"],
        segmentation_config=row["segmentation_config"],
        sync_status=row["sync_status"],
        is_enabled=bool(row["is_enabled"]),
        tag=row["tag"] if "tag" in row.keys() else None,
        segments=segments,  # Include child route segments
        original_route_geo_json=original_route_geo_json,  # Include original route GeoJSON
        match_percentage=row["match_percentage"] if "match_percentage" in row.keys() else None,  # Include match percentage
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        deleted_at=row["deleted_at"],
        routes_status=row["routes_status"]
    )

# --------------------------
# API Endpoints
# --------------------------
@router.get("/project/{project_id}/paginated", response_model=PaginatedRoutesResponse)
async def get_routes_paginated(
    project_id: int,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(20, ge=1, le=100, description="Number of routes per page"),
    search: Optional[str] = Query(None, description="Search query for route_name (case-insensitive)"),
    tag: Optional[str] = Query(None, description="Filter by tag (exact match, empty string '' and 'Untagged' are treated as separate tags)"),
    sort_by: Optional[str] = Query(None, description="Sort by: 'name', 'distance', 'created_at', or 'match_percentage'"),
    route_types: Optional[str] = Query(None, description="Filter by route types (comma-separated): 'imported', 'drawn', or 'uploaded'")
):
    """
    Get paginated routes for a project with optional search, tag filtering, and sorting.
    Supports infinite scrolling on the frontend.
    
    - **page**: Page number (1-indexed)
    - **limit**: Number of routes per page (max 100)
    - **search**: Search query for route_name (case-insensitive)
    - **tag**: Filter by tag (exact match, empty string '' and 'Untagged' are treated as separate tags)
    - **sort_by**: Sort order - 'name' (A-Z), 'distance' (shortest first), 'created_at' (newest first), 'updated_at' (newest first)
    
    Returns routes with their associated roads for immediate rendering.
    """
    try:
        logger.info(f"Fetching paginated routes for project {project_id}: page={page}, limit={limit}, search={search}, tag={tag}, sort_by={sort_by}, route_types={route_types}")
        
        # Build the base query with filters
        conditions = ["project_id = ?", "deleted_at IS NULL", "parent_route_id IS NULL"]
        params = [project_id]
        
        # Add search filter
        if search:
            # Special case: "Unnamed Route" should match routes with empty/null names
            if search.strip().lower() == "unnamed route":
                conditions.append("(route_name IS NULL OR route_name = '' OR route_name LIKE ?)")
                params.append(f"%{search}%")
            else:
                conditions.append("route_name LIKE ?")
                params.append(f"%{search}%")
        
        # Add tag filter - handle empty string tags separately from None
        if tag is not None:
            conditions.append("tag = ?")
            params.append(tag)
        
        # Add route type filter (supports multiple types)
        if route_types:
            # Parse comma-separated route types
            route_type_list = [rt.strip() for rt in route_types.split(",") if rt.strip()]
            if route_type_list:
                # Use IN clause for multiple route types
                placeholders = ",".join(["?" for _ in route_type_list])
                conditions.append(f"route_type IN ({placeholders})")
                params.extend(route_type_list)
        
        where_clause = " AND ".join(conditions)
        
        # Determine sort order
        valid_sort_options = {
            "name": "route_name ASC",
            "distance": "length ASC",
            "created_at": "created_at DESC",
            "match_percentage": "match_percentage ASC"
        }
        
        # Default to created_at DESC if sort_by is not provided or invalid
        order_by = valid_sort_options.get(sort_by, "created_at DESC") if sort_by else "created_at DESC"
        
        # Get total count
        count_query = f"SELECT COUNT(*) as total FROM routes WHERE {where_clause}"
        count_result = await query_db(count_query, tuple(params))
        total = count_result[0]["total"] if count_result else 0
        
        # Calculate pagination
        offset = (page - 1) * limit
        has_more = (offset + limit) < total
        
        # Get paginated routes
        query = f"""
        SELECT uuid, project_id, route_name, origin, destination, waypoints, center,
               route_type, length, encoded_polyline, parent_route_id, has_children, is_segmented,
               segmentation_type, segmentation_points, segmentation_config,
               sync_status, is_enabled, tag, original_route_geo_json, match_percentage, created_at, updated_at, deleted_at, temp_geometry,  routes_status
        FROM routes 
        WHERE {where_clause}
        ORDER BY {order_by}
        LIMIT ? OFFSET ?
        """
        
        rows = await query_db(query, tuple(params + [limit, offset]))
        
        # Fetch segments for each route and convert to RouteOut models
        routes = []
        for row in rows:
            # Fetch child routes (segments) if this route has children
            segments = []
            if bool(row["has_children"]):
                segments = await get_child_routes(row["uuid"])
            route = row_to_route_out(row, segments)
            routes.append(route)
        
        logger.info(f"Found {len(routes)} routes (page {page}/{math.ceil(total/limit) if total > 0 else 1}, total={total})")
        
        return PaginatedRoutesResponse(
            routes=routes,
            pagination={
                "total": total,
                "page": page,
                "limit": limit,
                "hasMore": has_more
            }
        )
        
    except Exception as e:
        logger.error(f"Error fetching paginated routes for project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch paginated routes")

@router.get("/project/{project_id}/paginated-by-id", response_model=PaginatedRoutesResponse)
async def get_routes_paginated_by_id(
    project_id: int,
    target_route_id: Optional[str] = Query(None, description="Route UUID to show first"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(20, ge=1, le=100, description="Number of routes per page"),
    tag: Optional[str] = Query(None, description="Filter by tag (exact match, empty string '' and 'Untagged' are treated as separate tags)"),
    sort_by: Optional[str] = Query(None, description="Sort by: 'name', 'distance', 'created_at', or 'match_percentage'"),
    route_types: Optional[str] = Query(None, description="Filter by route types (comma-separated): 'imported', 'drawn', or 'uploaded'")
):
    """
    Get paginated routes with optional target route shown first.
    If target_route_id is provided, that route appears first, then other routes in the same folder follow.
    
    - **target_route_id**: Route UUID to show first (if provided)
    - **page**: Page number (1-indexed)
    - **limit**: Number of routes per page (max 100)
    - **tag**: Filter by tag (exact match, empty string '' and 'Untagged' are treated as separate tags)
    - **sort_by**: Sort order - 'name' (A-Z), 'distance' (shortest first), 'created_at' (newest first), 'match_percentage' (lowest first)
    - **route_types**: Filter by route types (comma-separated)
    """
    try:
        logger.info(f"Fetching paginated routes by ID for project {project_id}: target_route_id={target_route_id}, page={page}, limit={limit}, tag={tag}, sort_by={sort_by}, route_types={route_types}")
        
        # If target_route_id is provided, fetch that route first
        target_route = None
        target_route_tag = None
        if target_route_id:
            target_query = """
            SELECT uuid, project_id, route_name, origin, destination, waypoints, center,
                   route_type, length, encoded_polyline, parent_route_id, has_children, is_segmented,
                   segmentation_type, segmentation_points, segmentation_config,
                   sync_status, is_enabled, tag, original_route_geo_json, match_percentage, created_at, updated_at, deleted_at, temp_geometry, routes_status
            FROM routes 
            WHERE uuid = ? AND project_id = ? AND deleted_at IS NULL
            """
            target_row = await query_db(target_query, (target_route_id, project_id), one=True)
            
            if target_row:
                # Fetch segments for target route
                segments = []
                if bool(target_row["has_children"]):
                    segments = await get_child_routes(target_route_id)
                target_route = row_to_route_out(target_row, segments)
                # Keep empty string and "Untagged" as separate - use tag value as-is
                target_route_tag = target_row["tag"] if target_row["tag"] is not None else None
                logger.info(f"Target route found: {target_route_id} - {target_row['route_name']}, tag={target_route_tag}")
            else:
                logger.warning(f"Target route {target_route_id} not found, falling back to normal pagination")
        
        # Build the base query for other routes
        conditions = ["project_id = ?", "deleted_at IS NULL", "parent_route_id IS NULL"]
        params = [project_id]
        
        # Exclude target route if provided
        if target_route_id:
            conditions.append("uuid != ?")
            params.append(target_route_id)
        
        # Use target route's tag if available, otherwise use provided tag
        # Keep empty string and "Untagged" as separate - use tag value as-is
        effective_tag = target_route_tag if target_route_tag is not None else tag
        if effective_tag is not None:
            conditions.append("tag = ?")
            params.append(effective_tag)
        
        # Add route type filter
        if route_types:
            route_type_list = [rt.strip() for rt in route_types.split(",") if rt.strip()]
            if route_type_list:
                placeholders = ",".join(["?" for _ in route_type_list])
                conditions.append(f"route_type IN ({placeholders})")
                params.extend(route_type_list)
        
        where_clause = " AND ".join(conditions)
        
        # Determine sort order
        valid_sort_options = {
            "name": "route_name ASC",
            "distance": "length ASC",
            "created_at": "created_at DESC",
            "match_percentage": "match_percentage ASC"
        }
        order_by = valid_sort_options.get(sort_by, "created_at DESC") if sort_by else "created_at DESC"
        
        # Get other routes (excluding target)
        other_routes_query = f"""
        SELECT uuid, project_id, route_name, origin, destination, waypoints, center,
               route_type, length, encoded_polyline, parent_route_id, has_children, is_segmented,
               segmentation_type, segmentation_points, segmentation_config,
               sync_status, is_enabled, tag, original_route_geo_json, match_percentage, created_at, updated_at, deleted_at, temp_geometry, routes_status
        FROM routes 
        WHERE {where_clause}
        ORDER BY {order_by}
        """
        
        other_rows = await query_db(other_routes_query, tuple(params))
        
        # Convert other routes to RouteOut models
        other_routes = []
        for row in other_rows:
            segments = []
            if bool(row["has_children"]):
                segments = await get_child_routes(row["uuid"])
            route = row_to_route_out(row, segments)
            other_routes.append(route)
        
        # Combine: target route first (if exists), then others
        if target_route:
            all_routes = [target_route] + other_routes
        else:
            all_routes = other_routes
        
        # Calculate pagination
        total = len(all_routes)
        offset = (page - 1) * limit
        has_more = (offset + limit) < total
        
        # Paginate the combined list
        paginated_routes = all_routes[offset:offset + limit]
        
        logger.info(f"Found {len(paginated_routes)} routes (page {page}/{math.ceil(total/limit) if total > 0 else 1}, total={total}, target_first={target_route is not None})")
        
        return PaginatedRoutesResponse(
            routes=paginated_routes,
            pagination={
                "total": total,
                "page": page,
                "limit": limit,
                "hasMore": has_more
            }
        )
        
    except Exception as e:
        logger.error(f"Error fetching paginated routes by ID for project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch paginated routes by ID")

@router.get("/project/{project_id}/search-unified", response_model=UnifiedSearchResponse)
async def search_unified(
    project_id: int,
    search: Optional[str] = Query(None, description="Search query for route_name (case-insensitive)"),
    tag: Optional[str] = Query(None, description="Filter by tag (exact match, empty string '' and 'Untagged' are treated as separate tags)"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(20, ge=1, le=100, description="Number of results per page"),
    route_types: Optional[str] = Query(None, description="Filter by route types (comma-separated): 'imported', 'drawn', or 'uploaded'")
):
    """
    Unified search that returns both routes and segments matching the search query.
    Results are ordered: routes first (sorted by name), then segments (sorted by name).
    Each result includes a 'type' field: 'route' or 'segment'.
    Segments include parent route information.
    
    - **page**: Page number (1-indexed)
    - **limit**: Number of results per page (max 100)
    - **search**: Search query for route_name (case-insensitive)
    - **tag**: Filter by tag (exact match, empty string '' and 'Untagged' are treated as separate tags)
    - **route_types**: Filter by route types (comma-separated)
    """
    try:
        logger.info(f"Unified search for project {project_id}: page={page}, limit={limit}, search={search}, tag={tag}, route_types={route_types}")
        
        if not search:
            # If no search query, return empty results
            return UnifiedSearchResponse(
                items=[],
                pagination={
                    "total": 0,
                    "page": page,
                    "limit": limit,
                    "hasMore": False
                }
            )
        
        search_pattern = f"%{search}%"
        all_items: List[UnifiedSearchItem] = []
        
        # 1. Search routes (parent_route_id IS NULL)
        route_conditions = ["project_id = ?", "deleted_at IS NULL", "parent_route_id IS NULL"]
        route_params = [project_id]
        
        # Add search filter for routes
        if search.strip().lower() == "unnamed route":
            route_conditions.append("(route_name IS NULL OR route_name = '' OR route_name LIKE ?)")
            route_params.append(search_pattern)
        else:
            route_conditions.append("route_name LIKE ?")
            route_params.append(search_pattern)
        
        # Add tag filter for routes - keep empty string '' and 'Untagged' as separate tags
        if tag is not None:
            route_conditions.append("tag = ?")
            route_params.append(tag)
        
        # Add route type filter for routes
        if route_types:
            route_type_list = [rt.strip() for rt in route_types.split(",") if rt.strip()]
            if route_type_list:
                placeholders = ",".join(["?" for _ in route_type_list])
                route_conditions.append(f"route_type IN ({placeholders})")
                route_params.extend(route_type_list)
        
        route_where_clause = " AND ".join(route_conditions)
        
        # Query routes
        route_query = f"""
        SELECT uuid, project_id, route_name, origin, destination, waypoints, center,
               route_type, length, encoded_polyline, parent_route_id, has_children, is_segmented,
               segmentation_type, segmentation_points, segmentation_config,
               sync_status, is_enabled, tag, original_route_geo_json, match_percentage, created_at, updated_at, deleted_at, temp_geometry, routes_status
        FROM routes 
        WHERE {route_where_clause}
        ORDER BY route_name ASC
        """
        
        route_rows = await query_db(route_query, tuple(route_params))
        
        # Convert routes to RouteOut and add to items
        for row in route_rows:
            segments = []
            if bool(row["has_children"]):
                segments = await get_child_routes(row["uuid"])
            route = row_to_route_out(row, segments)
            all_items.append(UnifiedSearchItem(
                type="route",
                route=route,
                segment=None,
                parent_route=None
            ))
        
        # 2. Search segments (parent_route_id IS NOT NULL) with parent route info
        segment_conditions = [
            "s.project_id = ?",
            "s.deleted_at IS NULL",
            "s.parent_route_id IS NOT NULL",
            "p.deleted_at IS NULL"
        ]
        segment_params = [project_id]
        
        # Add search filter for segments
        if search.strip().lower() == "unnamed route":
            segment_conditions.append("(s.route_name IS NULL OR s.route_name = '' OR s.route_name LIKE ?)")
            segment_params.append(search_pattern)
        else:
            segment_conditions.append("s.route_name LIKE ?")
            segment_params.append(search_pattern)
        
        # Add tag filter for segments (use parent route's tag) - keep empty string '' and 'Untagged' as separate tags
        if tag is not None:
            segment_conditions.append("p.tag = ?")
            segment_params.append(tag)
        
        # Add route type filter for segments (use parent route's type)
        if route_types:
            route_type_list = [rt.strip() for rt in route_types.split(",") if rt.strip()]
            if route_type_list:
                placeholders = ",".join(["?" for _ in route_type_list])
                segment_conditions.append(f"p.route_type IN ({placeholders})")
                segment_params.extend(route_type_list)
        
        segment_where_clause = " AND ".join(segment_conditions)
        
        # Query segments with parent route info
        segment_query = f"""
        SELECT 
            s.uuid, s.project_id, s.route_name, s.origin, s.destination, s.waypoints, s.center,
            s.route_type, s.length, s.encoded_polyline, s.parent_route_id, s.has_children, s.is_segmented,
            s.segmentation_type, s.segmentation_points, s.segmentation_config,
            s.sync_status, s.is_enabled, s.tag, s.created_at, s.updated_at, s.deleted_at, s.segment_order,
            p.uuid as parent_uuid, p.project_id as parent_project_id, p.route_name as parent_route_name,
            p.origin as parent_origin, p.destination as parent_destination, p.waypoints as parent_waypoints,
            p.center as parent_center, p.route_type as parent_route_type, p.length as parent_length,
            p.encoded_polyline as parent_encoded_polyline, p.parent_route_id as parent_parent_route_id,
            p.has_children as parent_has_children, p.is_segmented as parent_is_segmented,
            p.segmentation_type as parent_segmentation_type, p.segmentation_points as parent_segmentation_points,
            p.segmentation_config as parent_segmentation_config, p.sync_status as parent_sync_status,
            p.is_enabled as parent_is_enabled, p.tag as parent_tag, p.created_at as parent_created_at,
            p.updated_at as parent_updated_at, p.deleted_at as parent_deleted_at
        FROM routes s
        INNER JOIN routes p ON s.parent_route_id = p.uuid
        WHERE {segment_where_clause}
        ORDER BY s.route_name ASC
        """
        
        segment_rows = await query_db(segment_query, tuple(segment_params))
        
        # Convert segments to RouteMetadataOut and add to items
        for row in segment_rows:
            # Build segment row (only segment fields)
            segment_row = {
                "uuid": row["uuid"],
                "project_id": row["project_id"],
                "route_name": row["route_name"],
                "origin": row["origin"],
                "destination": row["destination"],
                "waypoints": row["waypoints"],
                "center": row["center"],
                "route_type": row["route_type"],
                "length": row["length"],
                "encoded_polyline": row["encoded_polyline"],
                "parent_route_id": row["parent_route_id"],
                "has_children": row["has_children"],
                "is_segmented": row["is_segmented"],
                "segmentation_type": row["segmentation_type"],
                "segmentation_points": row["segmentation_points"],
                "segmentation_config": None,  # Not in segment query
                "sync_status": row["sync_status"],
                "is_enabled": row["is_enabled"],
                "tag": row["tag"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "deleted_at": row["deleted_at"],
                "segment_order": row["segment_order"]
            }
            segment = row_to_route_metadata(segment_row)
            
            # Build parent route row
            parent_row = {
                "uuid": row["parent_uuid"],
                "project_id": row["parent_project_id"],
                "route_name": row["parent_route_name"],
                "origin": row["parent_origin"],
                "destination": row["parent_destination"],
                "waypoints": row["parent_waypoints"],
                "center": row["parent_center"],
                "route_type": row["parent_route_type"],
                "length": row["parent_length"],
                "encoded_polyline": row["parent_encoded_polyline"],
                "parent_route_id": row["parent_parent_route_id"],
                "has_children": row["parent_has_children"],
                "is_segmented": row["parent_is_segmented"],
                "segmentation_type": row["parent_segmentation_type"],
                "segmentation_points": row["parent_segmentation_points"],
                "segmentation_config": row["parent_segmentation_config"],
                "sync_status": row["parent_sync_status"],
                "is_enabled": row["parent_is_enabled"],
                "tag": row["parent_tag"],
                "created_at": row["parent_created_at"],
                "updated_at": row["parent_updated_at"],
                "deleted_at": row["parent_deleted_at"],
                "segment_order": None
            }
            parent_route = row_to_route_metadata(parent_row)
            
            all_items.append(UnifiedSearchItem(
                type="segment",
                route=None,
                segment=segment,
                parent_route=parent_route
            ))
        
        # Sort: routes first, then segments (both already sorted by name)
        # Routes are already added first, segments added second, so no need to sort
        
        # Calculate pagination
        total = len(all_items)
        offset = (page - 1) * limit
        has_more = (offset + limit) < total
        
        # Paginate the combined list
        paginated_items = all_items[offset:offset + limit]
        
        logger.info(f"Unified search found {total} items ({len([i for i in all_items if i.type == 'route'])} routes, {len([i for i in all_items if i.type == 'segment'])} segments), returning {len(paginated_items)} items (page {page})")
        
        return UnifiedSearchResponse(
            items=paginated_items,
            pagination={
                "total": total,
                "page": page,
                "limit": limit,
                "hasMore": has_more
            }
        )
        
    except Exception as e:
        logger.error(f"Error in unified search for project {project_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to perform unified search")

@router.get("/uuid/{route_uuid}", response_model=RouteOut)
async def get_route_by_uuid(route_uuid: str):
    """Get a specific route by UUID with its associated segments (no roads)"""
    try:
        logger.info(f"Fetching route with UUID: {route_uuid}")
        
        query = """
        SELECT uuid, project_id, route_name, origin, destination, waypoints, center,
               route_type, length, encoded_polyline, parent_route_id, has_children, is_segmented,
               segmentation_type, segmentation_points, segmentation_config,
               sync_status, is_enabled, tag, original_route_geo_json, match_percentage, created_at, updated_at, deleted_at, temp_geometry, routes_status
        FROM routes 
        WHERE uuid = ? AND deleted_at IS NULL
        """
        
        row = await query_db(query, (route_uuid,), one=True)
        
        if not row:
            raise HTTPException(status_code=404, detail="Route not found")
        
        # Verify UUID matches (should always match, but good to check)
        if row["uuid"] != route_uuid:
            logger.error(f"UUID mismatch! Queried: {route_uuid}, Got: {row['uuid']}")
        
        logger.info(f"Route found: {row['uuid']} - {row['route_name']}, has_children={row['has_children']}, is_segmented={row['is_segmented']}")
        
        # Fetch child routes (segments) if this route has children
        segments = []
        if bool(row["has_children"]):
            segments = await get_child_routes(route_uuid)
            logger.info(f"Found {len(segments)} child route segments for route {route_uuid}")
            if len(segments) == 0:
                logger.warning(f"Route {route_uuid} has has_children=True but no segments found. Checking database...")
                # Debug query to see if segments exist (including deleted ones)
                debug_query_all = """
                SELECT uuid, route_name, parent_route_id, segment_order, deleted_at
                FROM routes 
                WHERE parent_route_id = ?
                """
                debug_rows_all = await query_db(debug_query_all, (route_uuid,))
                logger.warning(f"Debug: Found {len(debug_rows_all)} total rows (including deleted) with parent_route_id={route_uuid}")
                for debug_row in debug_rows_all:
                    logger.warning(f"  - Segment: {debug_row['uuid']} - '{debug_row['route_name']}' - order: {debug_row['segment_order']} - deleted_at: {debug_row['deleted_at']}")
                
                # Also check if there are any routes with this UUID as parent but different case/format
                debug_query_any = """
                SELECT uuid, route_name, parent_route_id, segment_order, deleted_at
                FROM routes 
                WHERE parent_route_id LIKE ? OR parent_route_id = ?
                """
                debug_rows_any = await query_db(debug_query_any, (f"%{route_uuid}%", route_uuid))
                logger.warning(f"Debug: Found {len(debug_rows_any)} rows with parent_route_id matching pattern")
        
        route = row_to_route_out(row, segments)
        
        logger.info(f"Found route: {route.route_name} with {len(segments)} segment(s)")
        
        return route
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching route {route_uuid}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch route")

@router.post("/save", response_model=RouteSaveResponse)
async def save_route(route_data: RouteSaveRequest, background_tasks: BackgroundTasks):
    """Save a new route or update existing one - matches frontend expectations exactly"""
    try:
        logger.info(f"Saving/updating route: {route_data.route_name}")
        
        # Validate coordinates
        if len(route_data.coordinates.origin) != 2 or len(route_data.coordinates.destination) != 2:
            raise HTTPException(status_code=400, detail="Origin and destination must have exactly 2 coordinates [lng, lat]")
        
        # Validate waypoints
        for waypoint in route_data.coordinates.waypoints:
            if len(waypoint) != 2:
                raise HTTPException(status_code=400, detail="Each waypoint must have exactly 2 coordinates [lng, lat]")
        
        # Validate encoded_polyline is provided
        if not route_data.encoded_polyline:
            raise HTTPException(status_code=400, detail="Encoded polyline is required")
        
        # Calculate route metrics
        center = calculate_center(route_data.coordinates)
        
        # Calculate spatial fields from encoded polyline
        spatial_fields = calculate_spatial_fields(route_data.encoded_polyline)
        
        # Check if route UUID already exists
        existing_route = await query_db(
            "SELECT uuid, route_type, created_at FROM routes WHERE uuid = ? AND deleted_at IS NULL",
            (route_data.uuid,),
            one=True
        )
        if existing_route:
            route_type = existing_route["route_type"]
            # Update existing route
            logger.info(f"Updating existing route with UUID: {route_data.uuid}")
            
            # Prepare original_route_geo_json for storage
            original_geojson_str = None
            if route_data.original_route_geo_json:
                if isinstance(route_data.original_route_geo_json, str):
                    original_geojson_str = route_data.original_route_geo_json
                else:
                    original_geojson_str = json.dumps(route_data.original_route_geo_json)
            
            if route_type == "Existing":
                route_data.route_type = "drawn"
            update_query = """
            UPDATE routes 
            SET project_id = ?, 
                route_name = ?, 
                origin = ?, 
                destination = ?, 
                waypoints = ?, 
                center = ?,
                route_type = ?,
                length = ?,
                encoded_polyline = ?,
                start_lat = ?,
                start_lng = ?,
                end_lat = ?,
                end_lng = ?,
                min_lat = ?,
                max_lat = ?,
                min_lng = ?,
                max_lng = ?,
                tag = ?,
                original_route_geo_json = ?,
                match_percentage = ?,
                sync_status = 'unsynced',
                routes_status = NULL,
                synced_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE uuid = ? AND deleted_at IS NULL
            """
            
            await query_db(
                update_query,
                (
                    route_data.region_id,  # Map region_id to project_id
                    route_data.route_name,
                    json.dumps({"lat": route_data.coordinates.origin[1], "lng": route_data.coordinates.origin[0]}),
                    json.dumps({"lat": route_data.coordinates.destination[1], "lng": route_data.coordinates.destination[0]}),
                    json.dumps(route_data.coordinates.waypoints) if route_data.coordinates.waypoints else None,
                    json.dumps(center),
                    route_data.route_type or "drawn",  # Use provided route_type or default to "drawn"
                    route_data.length,
                    route_data.encoded_polyline,  # Update encoded polyline in routes table
                    spatial_fields["start_lat"],
                    spatial_fields["start_lng"],
                    spatial_fields["end_lat"],
                    spatial_fields["end_lng"],
                    spatial_fields["min_lat"],
                    spatial_fields["max_lat"],
                    spatial_fields["min_lng"],
                    spatial_fields["max_lng"],
                    route_data.tag if route_data.tag else "",
                    original_geojson_str,  # Original route GeoJSON
                    route_data.match_percentage,  # Match percentage
                    route_data.uuid
                ),
                commit=True
            )
            
            # Log route update to Firestore asynchronously (non-blocking)
            route_metadata = {
                "project_id": route_data.region_id,
                "route_name": route_data.route_name,
                "route_type": route_data.route_type or "drawn",
                "length": route_data.length,
                "tag": route_data.tag,
                "distance": route_data.length,  # Distance in km
            }
            background_tasks.add_task(log_route_creation_async, route_data.uuid, route_metadata, None, True)
            
            # Get current timestamp
            updated_at = datetime.now().isoformat()
            
            return RouteSaveResponse(
                success=True,
                data={
                    "id": route_data.region_id,  # Frontend expects numeric id
                    "uuid": route_data.uuid,
                    "route_name": route_data.route_name,
                    "created_at": existing_route["created_at"],
                    "updated_at": updated_at
                },
                message="Route updated successfully"
            )
        else:
            # Create new route
            logger.info(f"Creating new route with UUID: {route_data.uuid}")

            # Enforce max routes per project (1000)
            count_row = await query_db(
                "SELECT COUNT(*) AS cnt FROM routes WHERE project_id = ? AND deleted_at IS NULL",
                (route_data.region_id,),
                one=True
            )
            current_route_count = (count_row["cnt"] or 0) if count_row else 0
            if current_route_count >= MAX_ROUTES_PER_PROJECT:
                raise HTTPException(
                    status_code=400,
                    detail=f"Project cannot have more than {MAX_ROUTES_PER_PROJECT} routes. Current count: {current_route_count}. Please remove some routes or use a different project."
                )
            
            # Prepare original_route_geo_json for storage
            original_geojson_str = None
            if route_data.original_route_geo_json:
                if isinstance(route_data.original_route_geo_json, str):
                    original_geojson_str = route_data.original_route_geo_json
                else:
                    original_geojson_str = json.dumps(route_data.original_route_geo_json)
            
            project_row = await query_db(
                "SELECT project_uuid FROM projects WHERE id = ? AND deleted_at IS NULL",
                (route_data.region_id,),
                one=True
            )
            project_uuid = project_row["project_uuid"] if project_row and "project_uuid" in project_row.keys() and project_row["project_uuid"] else None

            insert_query = """
            INSERT INTO routes (
                uuid, project_id, project_uuid, route_name, origin, destination, waypoints, center,
                route_type, length, encoded_polyline,
                start_lat, start_lng, end_lat, end_lng,
                min_lat, max_lat, min_lng, max_lng,
                sync_status, is_enabled, tag, original_route_geo_json, match_percentage
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """

            await query_db(
                insert_query,
                (
                    route_data.uuid,
                    route_data.region_id,
                    project_uuid,
                    route_data.route_name,
                    json.dumps({"lat": route_data.coordinates.origin[1], "lng": route_data.coordinates.origin[0]}),
                    json.dumps({"lat": route_data.coordinates.destination[1], "lng": route_data.coordinates.destination[0]}),
                    json.dumps(route_data.coordinates.waypoints) if route_data.coordinates.waypoints else None,
                    json.dumps(center),
                    route_data.route_type or "drawn",  # Use provided route_type or default to "drawn"
                    route_data.length,
                    route_data.encoded_polyline,  # Store encoded polyline in routes table
                    spatial_fields["start_lat"],
                    spatial_fields["start_lng"],
                    spatial_fields["end_lat"],
                    spatial_fields["end_lng"],
                    spatial_fields["min_lat"],
                    spatial_fields["max_lat"],
                    spatial_fields["min_lng"],
                    spatial_fields["max_lng"],
                    "unsynced",  # Default sync status
                    True,  # Default enabled
                    route_data.tag if route_data.tag else "",
                    original_geojson_str,  # Original route GeoJSON
                    route_data.match_percentage  # Match percentage
                ),
                commit=True
            )
            
            # Log route creation to Firestore asynchronously (non-blocking)
            route_metadata = {
                "project_id": route_data.region_id,
                "route_name": route_data.route_name,
                "route_type": route_data.route_type or "drawn",
                "length": route_data.length,
                "tag": route_data.tag,
                "distance": route_data.length,  # Distance in km
            }
            background_tasks.add_task(log_route_creation_async, route_data.uuid, route_metadata)
            
            # Get current timestamp
            current_time = datetime.now().isoformat()
            
            # Return in the format expected by frontend
            return RouteSaveResponse(
                success=True,
                data={
                    "id": route_data.region_id,  # Frontend expects numeric id
                    "uuid": route_data.uuid,
                    "route_name": route_data.route_name,
                    "created_at": current_time,
                    "updated_at": current_time
                },
                message="Route created successfully"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving route: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to save route")

@router.put("/uuid/{route_uuid}")
async def update_route_by_uuid(route_uuid: str, updates: Dict[str, Any]):
    """Update a route by UUID - supports partial updates"""
    try:
        logger.info(f"Updating route with UUID: {route_uuid}")
        
        # Check if route exists
        route = await get_route_by_uuid(route_uuid)
        
        # Define allowed update fields
        allowed_fields = {
            "route_name": str,
            "is_enabled": bool,
            "sync_status": str,
            "route_type": str,
        }
        
        # Build dynamic update query
        update_fields = []
        update_values = []
        
        # Track if route_name is being updated (requires sync status reset)
        route_name_updated = False
        
        for field, value in updates.items():
            if field in allowed_fields:
                # Validate type
                expected_type = allowed_fields[field]
                if not isinstance(value, expected_type):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Field '{field}' must be of type {expected_type.__name__}"
                    )
                
                update_fields.append(f"{field} = ?")
                if field == "tag":
                    value = value if value else ""
                update_values.append(value)
                
                # Mark if route_name is being updated
                if field == "route_name":
                    route_name_updated = True
        
        if not update_fields:
            raise HTTPException(
                status_code=400,
                detail="No valid fields to update"
            )
        
        # If route_name is updated, reset sync status
        if route_name_updated:
            update_fields.append("sync_status = 'unsynced'")
            update_fields.append("synced_at = NULL")
        
        # Add updated_at timestamp
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        # Build and execute query
        query = f"""
        UPDATE routes 
        SET {', '.join(update_fields)}
        WHERE uuid = ? AND deleted_at IS NULL
        """
        
        update_values.append(route_uuid)
        
        await query_db(query, tuple(update_values), commit=True)
        
        logger.info(f"Updated route with UUID: {route_uuid}")
        
        # Fetch updated route to get current status
        updated_route = await get_route_by_uuid(route_uuid)
        
        # Broadcast route/segment status update via WebSocket if status fields changed
        if any(field in updates for field in ["sync_status", "is_enabled", "route_name"]):
            try:
                from server.main import ws_manager
                if ws_manager and updated_route:
                    project_id_str = str(updated_route.get("project_id"))
                    route_update = {
                        "route_id": route_uuid,
                        "sync_status": updated_route.get("sync_status"),
                        "routes_status": updated_route.get("routes_status"),
                        "is_enabled": updated_route.get("is_enabled"),
                        "parent_route_id": updated_route.get("parent_route_id"),
                        "updated_at": updated_route.get("updated_at") or datetime.now().isoformat()
                    }
                    await ws_manager.broadcast_route_status_update(project_id_str, route_update)
                    logger.info(f"[WEBSOCKET] Broadcasted route/segment status update for {route_uuid} to project {project_id_str}")
            except ImportError:
                logger.debug("[WEBSOCKET] ws_manager not available (circular import)")
            except Exception as e:
                logger.warning(f"[WEBSOCKET] Failed to broadcast route status update: {e}")
        
        return updated_route
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating route {route_uuid}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update route")

@router.put("/uuid/{route_uuid}/soft-delete")
async def soft_delete_route_by_uuid(route_uuid: str):
    """Soft delete a route by UUID"""
    try:
        logger.info(f"Soft deleting route with UUID: {route_uuid}")
        
        # Check if route exists
        await get_route_by_uuid(route_uuid)

        # Delete all child routes
        query_delete_child_routes = """
        UPDATE routes 
        SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE parent_route_id = ?
        """
        
        query = """
        UPDATE routes 
        SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE uuid = ? AND deleted_at IS NULL
        """
        
        await query_db(query_delete_child_routes, (route_uuid,), commit=True)
        
        await query_db(query, (route_uuid,), commit=True)
        
        logger.info(f"Soft deleted route with UUID: {route_uuid}")
        
        return {"message": "Route deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error soft deleting route {route_uuid}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to soft delete route")

# --------------------------
# Additional Utility Endpoints
# --------------------------
@router.get("/", response_model=List[RouteOut])
async def get_all_routes():
    """Get all non-deleted routes"""
    try:
        logger.info("Fetching all routes")
        
        query = """
        SELECT uuid, project_id, route_name, origin, destination, waypoints, center,
               route_type, length, parent_route_id, has_children, is_segmented,
               segmentation_type, segmentation_points, segmentation_config,
               sync_status, is_enabled, tag, original_route_geo_json, match_percentage, created_at, updated_at, deleted_at, routes_status
        FROM routes 
        WHERE deleted_at IS NULL AND parent_route_id IS NULL
        ORDER BY created_at DESC
        """
        
        rows = await query_db(query)
        
        # Fetch segments for each route and convert to RouteOut models
        routes = []
        for row in rows:
            # Fetch child routes (segments) if this route has children
            segments = []
            if bool(row["has_children"]):
                segments = await get_child_routes(row["uuid"])
            route = row_to_route_out(row, segments)
            routes.append(route)
        
        logger.info(f"Found {len(routes)} routes")
        
        return routes
        
    except Exception as e:
        logger.error(f"Error fetching all routes: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch routes")

@router.put("/{route_uuid}/toggle-enabled")
async def toggle_route_enabled(
    route_uuid: str,
    request: SegmentToggleRequest
):
    """
    Toggle the is_enabled property of a route (segment) in the routes table.
    Returns a simple success response.
    """
    try:
        logger.info(f"Toggling route enabled status: route={route_uuid}, is_enabled={request.is_enabled}")
        
        # First, get the route to find project_id and current sync_status
        route_query = """
        SELECT project_id, sync_status, routes_status, parent_route_id
        FROM routes 
        WHERE uuid = ? AND deleted_at IS NULL
        """
        route_data = await query_db(route_query, (route_uuid,), one=True)
        
        if not route_data:
            raise HTTPException(status_code=404, detail="Route not found")
        
        project_id = route_data["project_id"]
        current_sync_status = route_data["sync_status"] if route_data["sync_status"] is not None else "unsynced"
        current_routes_status = route_data["routes_status"]
        parent_route_id = route_data["parent_route_id"]
        
        # Update the route's is_enabled property in routes table
        update_query = """
        UPDATE routes 
        SET is_enabled = ?, updated_at = datetime('now')
        WHERE uuid = ? AND deleted_at IS NULL
        """
        
        await query_db(
            update_query,
            (int(request.is_enabled), route_uuid),
            commit=True
        )
        
        # Broadcast segment status update via WebSocket
        try:
            from server.main import ws_manager
            if ws_manager and project_id:
                project_id_str = str(project_id)
                route_update = {
                    "route_id": route_uuid,
                    "sync_status": current_sync_status,
                    "routes_status": current_routes_status,
                    "is_enabled": request.is_enabled,
                    "parent_route_id": parent_route_id,
                    "updated_at": datetime.now().isoformat()
                }
                await ws_manager.broadcast_route_status_update(project_id_str, route_update)
                logger.info(f"[WEBSOCKET] Broadcasted segment status update for {route_uuid} to project {project_id_str}")
        except ImportError:
            logger.debug("[WEBSOCKET] ws_manager not available (circular import)")
        except Exception as e:
            logger.warning(f"[WEBSOCKET] Failed to broadcast segment status update: {e}")
        
        logger.info(f"Successfully toggled route {route_uuid} enabled status to {request.is_enabled}")
        return {
            "success": True,
            "message": f"Route enabled status updated to {request.is_enabled}",
            "route_uuid": route_uuid,
            "is_enabled": request.is_enabled
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling route enabled status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to toggle route enabled status")

# Project Tags endpoint with counts
@router.get("/project/{project_id}/tags")
async def get_project_tags(project_id: int):
    """
    Return distinct tags for a project with route counts and segment counts.
    Keeps empty string "" and "Untagged" as separate tags.
    Routes with NULL tags are returned as empty string "" in the response.
    """
    try:
        # Query to get tags with non-segmented route counts and segmented route counts
        query = """
        SELECT 
            tag,
            COUNT(CASE WHEN is_segmented = 0 AND parent_route_id IS NULL AND deleted_at IS NULL THEN 1 END) AS non_segmented_count,
            COUNT(CASE WHEN parent_route_id IS NOT NULL AND deleted_at IS NULL THEN 1 END) AS segment_count,
            COUNT(CASE WHEN parent_route_id IS NULL AND deleted_at IS NULL THEN 1 END) AS route_count
        FROM routes
        WHERE project_id = ?
        AND deleted_at IS NULL
        GROUP BY tag
        ORDER BY tag COLLATE NOCASE ASC
        """
        rows = await query_db(query, (project_id,))
        
        # Process the query result to separate tags, counts, and segment counts
        # Keep empty string "" and "Untagged" as separate tags
        tags_with_counts = {}
        segment_counts = {}
        route_counts = {}

        for row in rows:
            tag = row["tag"]
            non_segmented_count = row["non_segmented_count"]
            segment_count = row["segment_count"]
            route_count = row["route_count"]
            
            # Handle all tags including empty string - keep them separate
            # tag can be None (null), "" (empty string), "Untagged", or any other string
            # SQL GROUP BY will create separate groups for each, including None and ""
            if tag is not None:
                # This includes empty string "", "Untagged", and all other tags
                tags_with_counts[tag] = non_segmented_count
                if segment_count > 0:
                    segment_counts[tag] = segment_count
                if route_count > 0:
                    route_counts[tag] = route_count
            else:
                # For null tags, store as empty string to match frontend expectations
                # This represents routes with NULL tag in database
                tags_with_counts[""] = non_segmented_count
                if segment_count > 0:
                    segment_counts[""] = segment_count
                if route_count > 0:
                    route_counts[""] = route_count
        
        # Build response
        tags = list(tags_with_counts.keys())
        counts = tags_with_counts.copy()
        
        return {
            "success": True,
            "data": {
                "tags": tags,
                "counts": counts,
                "segmentCounts": segment_counts,
                "routeCounts": route_counts
            }
        }
    except Exception as e:
        logger.error(f"Error fetching tags for project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch tags")

# Project Route Count endpoint
@router.get("/project/{project_id}/count")
async def get_project_route_count(project_id: int):
    """Return total count of routes for a project (for splash screen check)"""
    try:
        query = """
        SELECT COUNT(*) as count
        FROM routes
        WHERE project_id = ? AND deleted_at IS NULL AND parent_route_id IS NULL
        """
        rows = await query_db(query, (project_id,))
        count = rows[0]["count"] if rows else 0
        return {"success": True, "data": {"count": count}}
    except Exception as e:
        logger.error(f"Error fetching route count for project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch route count")

# Bulk Project Route Counts endpoint
@router.get("/projects/counts")
async def get_projects_route_counts(project_ids: str = Query(..., description="Comma-separated list of project IDs")):
    """Return route counts for the requested projects only."""
    try:
        # Parse and validate project_ids
        raw_ids = [s.strip() for s in project_ids.split(",") if s.strip()]
        if not raw_ids:
            return {"success": True, "data": {}, "allCounts": {}}
        id_list = []
        for s in raw_ids:
            try:
                id_list.append(int(s))
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid project IDs format. Expected comma-separated integers.",
                )
        if not id_list:
            return {"success": True, "data": {}, "allCounts": {}}

        placeholders = ",".join("?" for _ in id_list)
        query = f"""
        SELECT project_id,
        COUNT(CASE WHEN parent_route_id IS NULL AND deleted_at IS NULL THEN 1 END) AS routes_count,
        COUNT(CASE WHEN parent_route_id IS NOT NULL AND deleted_at IS NULL THEN 1 END) AS segment_count
        FROM routes
        WHERE project_id IN ({placeholders})
        GROUP BY project_id;
        """
        rows = await query_db(query, tuple(id_list))

        counts_dict = {str(row["project_id"]): row["routes_count"] for row in rows}
        all_counts_dict = {str(row["project_id"]): (row["routes_count"], row["segment_count"]) for row in rows}

        return {"success": True, "data": counts_dict, "allCounts": all_counts_dict}
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Invalid project IDs format: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid project IDs format. Expected comma-separated integers.")
    except Exception as e:
        logger.error(f"Error fetching route counts for projects: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch route counts")


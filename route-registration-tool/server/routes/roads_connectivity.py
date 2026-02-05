"""
Road connectivity API endpoints
Provides spatial analysis for multi-road selection and stretch-to-intersection operations
"""

import json
import logging
import time
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from server.db.database import query_db
from server.utils.spatial_helpers import parse_polyline, get_endpoints, calculate_road_length
from server.utils.sql_connectivity import (
    get_road_connections_sql,
    stretch_road_sql,
    validate_continuity_sql,
    COORDINATE_TOLERANCE_DEGREES
)

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("roads_connectivity_api")

router = APIRouter(prefix="/roads", tags=["roads-connectivity"])

# ===== Pydantic Models =====

class RoadBasicInfo(BaseModel):
    """Basic road information for responses"""
    id: int
    polyline: str
    length: Optional[float] = None
    name: Optional[str] = None
    is_enabled: bool = True
    order: Optional[int] = None  # Position in sequence

class EndpointInfo(BaseModel):
    """Endpoint coordinate and type"""
    lat: float
    lng: float
    type: str  # 'intersection' or 'dead_end'

class StretchResponse(BaseModel):
    """Response for stretch-to-intersection operation"""
    success: bool
    data: Dict[str, Any]
    execution_time_ms: float

class ValidateContinuityRequest(BaseModel):
    """Request body for continuity validation"""
    road_ids: List[int] = Field(..., description="List of road IDs to validate")
    project_id: int = Field(..., description="Project ID")
    gap_tolerance_meters: Optional[float] = Field(
        None, 
        description="Custom gap tolerance in meters (overrides env variable)"
    )

class ValidateContinuityResponse(BaseModel):
    """Response for continuity validation"""
    success: bool
    data: Dict[str, Any]
    execution_time_ms: float

class BatchFetchRequest(BaseModel):
    """Request body for batch road fetching"""
    road_ids: List[int] = Field(..., description="List of road IDs to fetch")
    project_id: int = Field(..., description="Project ID")

class RoadConnectionsResponse(BaseModel):
    """Response for road connections"""
    success: bool
    data: Dict[str, Any]
    execution_time_ms: float

# ===== Helper Functions =====

async def fetch_roads_for_project(project_id: int) -> List[Dict]:
    """Fetch all active roads for a project"""
    query = """
        SELECT id, project_id, polyline, length, name, is_enabled
        FROM roads
        WHERE project_id = ? AND deleted_at IS NULL
    """
    rows = await query_db(query, (project_id,))
    
    roads = []
    for row in rows:
        roads.append({
            'id': row['id'],
            'project_id': row['project_id'],
            'polyline': row['polyline'],
            'length': row['length'],
            'name': row['name'],
            'is_enabled': bool(row['is_enabled'])
        })
    
    return roads

async def fetch_roads_by_ids(road_ids: List[int], project_id: int) -> List[Dict]:
    """Fetch specific roads by IDs"""
    if not road_ids:
        return []
    
    placeholders = ','.join('?' * len(road_ids))
    query = f"""
        SELECT id, project_id, polyline, length, name, is_enabled
        FROM roads
        WHERE id IN ({placeholders}) 
        AND project_id = ? 
        AND deleted_at IS NULL
    """
    
    params = tuple(road_ids) + (project_id,)
    rows = await query_db(query, params)
    
    roads = []
    for row in rows:
        roads.append({
            'id': row['id'],
            'project_id': row['project_id'],
            'polyline': row['polyline'],
            'length': row['length'],
            'name': row['name'],
            'is_enabled': bool(row['is_enabled'])
        })
    
    return roads

async def fetch_nearby_roads_from_spatial_index(
    road_id: int, 
    project_id: int,
    max_distance_degrees: float = 0.01  # ~1km
) -> List[int]:
    """
    Use spatial index to quickly find roads near the given road
    Returns list of road IDs
    """
    # Get bbox of target road
    query = """
        SELECT min_lat, max_lat, min_lng, max_lng
        FROM road_spatial_index
        WHERE road_id = ?
    """
    row = await query_db(query, (road_id,), one=True)
    
    if not row:
        return []
    
    # Expand bbox by max_distance
    min_lat = row['min_lat'] - max_distance_degrees
    max_lat = row['max_lat'] + max_distance_degrees
    min_lng = row['min_lng'] - max_distance_degrees
    max_lng = row['max_lng'] + max_distance_degrees
    
    # Find all roads whose bbox intersects with expanded bbox
    query = """
        SELECT road_id
        FROM road_spatial_index
        WHERE project_id = ?
        AND road_id != ?
        AND NOT (max_lat < ? OR min_lat > ? OR max_lng < ? OR min_lng > ?)
    """
    rows = await query_db(query, (project_id, road_id, min_lat, max_lat, min_lng, max_lng))
    
    return [row['road_id'] for row in rows]

# ===== API Endpoints =====

@router.get("/stretch/{road_id}", response_model=StretchResponse)
async def stretch_to_intersection(
    road_id: int,
    project_id: int = Query(..., description="Project ID"),
    max_distance: Optional[float] = Query(None, description="Maximum stretch distance in km"),
    tolerance_meters: Optional[float] = Query(None, description="Custom tolerance for endpoint connections"),
    priorities: Optional[List[str]] = Query(
        None, 
        alias="selected_priorities", 
        description="List of road priorities"
    )
):
    """
    Stretch from a road in both directions until hitting intersections or dead ends.
    Returns all roads in the linear segment.
    
    **Performance:** Optimized with spatial indexing for fast execution (<50ms typical)
    """
    start_time = time.time()
    
    try:
        clean_priorities = None
        if priorities:
            clean_priorities = [p.replace('"', '').replace("'", "") for p in priorities]
            logger.info(f"[API STRETCH] Filtering by priorities: {clean_priorities}")
        logger.info(f"=" * 80)
        logger.info(f"[API STRETCH] Starting SQL-based stretch operation")
        logger.info(f"[API STRETCH] Parameters: road_id={road_id}, project_id={project_id}, tolerance={tolerance_meters}")
        
        # Convert meters to degrees (rough approximation: 1 degree ≈ 111km)
        tolerance_degrees = COORDINATE_TOLERANCE_DEGREES
        if tolerance_meters:
            tolerance_degrees = tolerance_meters / 111000.0
        
        logger.info(f"[API STRETCH] Using tolerance: {tolerance_degrees:.6f} degrees (~{tolerance_degrees * 111000:.1f}m)")
        
        # Perform SQL-based stretch operation
        if priorities:
            logger.info(f"[API STRETCH] Filtering by priorities: {clean_priorities}")

        # Perform SQL-based stretch operation with priorities
        result = await stretch_road_sql(
            road_id=road_id,
            project_id=project_id,
            max_depth=100,
            tolerance_degrees=tolerance_degrees,
            priorities=clean_priorities  # <--- Pass the list here
        )
        
        # Format roads for response
        stretched_roads = []
        for idx, road in enumerate(result['roads']):
            stretched_roads.append({
                'id': road['id'],
                'polyline': road['polyline'],
                'length': road.get('length'),
                'name': road.get('name'),
                'is_enabled': road.get('is_enabled', False),
                'order': idx
            })
        
        execution_time = (time.time() - start_time) * 1000
        
        logger.info(f"[API STRETCH] SQL stretch complete: {result['total_count']} roads, {execution_time:.2f}ms")
        logger.info(f"=" * 80)
        
        return StretchResponse(
            success=True,
            data={
                'stretched_roads': stretched_roads,
                'total_length': result['total_length'],
                'total_count': result['total_count'],
                'endpoints': result['endpoints'],
                'initial_road_id': road_id
            },
            execution_time_ms=round(execution_time, 2)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in stretch operation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Stretch operation failed: {str(e)}")

@router.post("/validate-continuity", response_model=ValidateContinuityResponse)
async def validate_road_continuity(request: ValidateContinuityRequest):
    """
    Validate if selected roads form a continuous path without gaps.
    Identifies any gaps and suggests optimal road ordering.
    
    **Use case:** Multi-road selection validation before saving as route
    """
    start_time = time.time()
    
    try:
        logger.info(f"Validating continuity for {len(request.road_ids)} roads in project {request.project_id}")
        
        if not request.road_ids:
            raise HTTPException(status_code=400, detail="road_ids cannot be empty")
        
        logger.info(f"[API VALIDATE] Starting SQL-based validation for {len(request.road_ids)} roads")
        
        # Convert meters to degrees
        tolerance_degrees = COORDINATE_TOLERANCE_DEGREES
        if request.gap_tolerance_meters:
            tolerance_degrees = request.gap_tolerance_meters / 111000.0
        
        logger.info(f"[API VALIDATE] Using tolerance: {tolerance_degrees:.6f} degrees")
        
        # Perform SQL-based validation
        result = await validate_continuity_sql(
            road_ids=request.road_ids,
            project_id=request.project_id,
            tolerance_degrees=tolerance_degrees
        )
        
        execution_time = (time.time() - start_time) * 1000
        
        logger.info(f"Validation complete: continuous={result['is_continuous']}, {execution_time:.2f}ms")
        
        return ValidateContinuityResponse(
            success=True,
            data={
                'is_continuous': result['is_continuous'],
                'gaps': result['gaps'],
                'suggested_order': result['suggested_order'],
                'total_length': result['total_length'],
                'connected_count': result.get('connected_count', 0),
                'total_count': result.get('total_count', len(request.road_ids)),
                'tolerance_meters': tolerance_degrees * 111000
            },
            execution_time_ms=round(execution_time, 2)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in continuity validation: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")

@router.get("/{road_id}/connections", response_model=RoadConnectionsResponse)
async def get_road_connections(
    road_id: int,
    project_id: int = Query(..., description="Project ID"),
    tolerance_meters: Optional[float] = Query(None, description="Custom tolerance for endpoint connections")
):
    """
    Get all roads connected to the specified road's endpoints.
    Indicates if the road is at an intersection (>2 connections).
    
    **Use case:** Real-time connection visualization during road selection
    """
    start_time = time.time()
    
    try:
        logger.info(f"=" * 80)
        logger.info(f"[API CONNECTIONS] Starting SQL-based connections query for road {road_id}")
        
        # Convert meters to degrees
        tolerance_degrees = COORDINATE_TOLERANCE_DEGREES
        if tolerance_meters:
            tolerance_degrees = tolerance_meters / 111000.0
        
        logger.info(f"[API CONNECTIONS] Using tolerance: {tolerance_degrees:.6f} degrees (~{tolerance_degrees * 111000:.1f}m)")
        
        # Perform SQL-based connection query
        result = await get_road_connections_sql(
            road_id=road_id,
            project_id=project_id,
            tolerance_degrees=tolerance_degrees
        )
        
        execution_time = (time.time() - start_time) * 1000
        
        logger.info(f"[API CONNECTIONS] SQL query complete: {result['total_connections']} connections, {execution_time:.2f}ms")
        logger.info(f"=" * 80)
        
        return RoadConnectionsResponse(
            success=True,
            data={
                'road_id': result['road_id'],
                'connections': result['connections'],
                'is_intersection': result['is_intersection'],
                'total_connections': result['total_connections'],
                'tolerance_meters': tolerance_degrees * 111000
            },
            execution_time_ms=round(execution_time, 2)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching connections: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch connections: {str(e)}")

@router.post("/batch", response_model=Dict[str, Any])
async def batch_fetch_roads(request: BatchFetchRequest):
    """
    Fetch multiple roads by IDs in a single request.
    Optimized for highlighting selected roads on the map.
    
    **Use case:** Fetch road geometries for visual feedback during multi-selection
    """
    start_time = time.time()
    
    try:
        logger.info(f"Batch fetching {len(request.road_ids)} roads for project {request.project_id}")
        
        if not request.road_ids:
            return {
                'success': True,
                'data': {'roads': []},
                'execution_time_ms': 0
            }
        
        # Fetch roads
        roads = await fetch_roads_by_ids(request.road_ids, request.project_id)
        
        # Format response
        formatted_roads = []
        for road in roads:
            formatted_roads.append({
                'id': road['id'],
                'polyline': road['polyline'],
                'length': road.get('length'),
                'name': road.get('name'),
                'is_enabled': road.get('is_enabled', False)
            })
        
        execution_time = (time.time() - start_time) * 1000
        
        logger.info(f"Batch fetch complete: {len(formatted_roads)} roads, {execution_time:.2f}ms")
        
        return {
            'success': True,
            'data': {
                'roads': formatted_roads,
                'requested_count': len(request.road_ids),
                'found_count': len(formatted_roads)
            },
            'execution_time_ms': round(execution_time, 2)
        }
        
    except Exception as e:
        logger.error(f"Error in batch fetch: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch fetch failed: {str(e)}")


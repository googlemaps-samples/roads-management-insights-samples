# server/routes/roads.py
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from shapely.geometry import LineString, shape

from server.db.database import query_db

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("roads_api")

router = APIRouter(prefix="/roads", tags=["Roads"])

# --------------------------
# Pydantic Models
# --------------------------

class RoadOut(BaseModel):
    """Model for road responses"""
    id: int
    project_id: int
    polyline: str  # GeoJSON LineString
    center: Optional[str] = None
    length: Optional[float] = None
    name: Optional[str] = None
    is_enabled: bool = True
    is_selected: Optional[bool] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class RoadSelectionRequest(BaseModel):
    """Request body for selecting roads inside a polygon"""
    project_id: int
    polygon: Dict[str, Any]
    priorities: Optional[List[str]] = Field(
        None, description="Optional list of priorities to filter the roads",
    )

class RoadUpdate(BaseModel):
    """Model for road update requests"""
    is_enabled: Optional[bool] = None
    is_selected: Optional[bool] = None
    name: Optional[str] = None
    deleted_at: Optional[str] = None  # For soft delete via PUT

# --------------------------
# API Endpoints
# --------------------------

@router.get("/project/{project_id}", response_model=List[RoadOut])
async def get_roads_by_project(project_id: int):
    """
    Get ALL roads in a project (entire road network).
    This is used to display the light gray road network on the map.
    Returns roads regardless of whether they belong to a route or not.
    """
    try:
        logger.info(f"Fetching all roads for project ID: {project_id}")
        
        query = """
        SELECT id, project_id, polyline, center_lat, center_lng, length, is_enabled, name,
               created_at, updated_at, is_selected
        FROM roads 
        WHERE project_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC
        """
        
        rows = await query_db(query, (project_id,))
        
        roads = [
            RoadOut(
                id=row["id"],
                project_id=row["project_id"],
                polyline=row["polyline"],
                center=json.dumps({"lat": row["center_lat"], "lng": row["center_lng"]}),
                length=row["length"],
                is_enabled=bool(row["is_enabled"]),
                is_selected=bool(row["is_selected"]) if "is_selected" in row.keys() else None,
                name=row["name"],
                created_at=row["created_at"],
                updated_at=row["updated_at"]
            )
            for row in rows
        ]
        
        logger.info(f"Found {len(roads)} roads for project {project_id}")
        
        return roads
        
    except Exception as e:
        logger.error(f"Error fetching roads for project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch roads")


@router.post("/selection", response_model=List[RoadOut])
async def select_roads_by_polygon(selection: RoadSelectionRequest):
    """
    Return already ingested roads that intersect the provided polygon and match
    the optional priority filters.
    """
    try:
        polygon_shape = shape(selection.polygon)
    except Exception as e:
        logger.error("Invalid polygon payload for road selection: %s", e)
        raise HTTPException(status_code=400, detail="Invalid polygon payload")

    min_lng, min_lat, max_lng, max_lat = polygon_shape.bounds
    query = """
    SELECT
        id,
        project_id,
        polyline,
        center_lat,
        center_lng,
        length,
        is_enabled,
        name,
        created_at,
        updated_at,
        is_selected
    FROM roads
    WHERE project_id = ?
      AND deleted_at IS NULL
      AND is_enabled = 1
      AND max_lat >= ?
      AND min_lat <= ?
      AND max_lng >= ?
      AND min_lng <= ?
    """

    params: List[Any] = [
        selection.project_id,
        min_lat,
        max_lat,
        min_lng,
        max_lng,
    ]

    if not selection.priorities:
        return []

    placeholders = ", ".join(["?"] * len(selection.priorities))
    query += f" AND priority IN ({placeholders})"
    params.extend(selection.priorities)

    rows = await query_db(query, tuple(params))

    roads: List[RoadOut] = []
    for row in rows:
        polyline_text = row["polyline"]
        if not polyline_text:
            continue
        try:
            geojson = json.loads(polyline_text)
            coordinates = geojson.get("coordinates") if isinstance(geojson, dict) else None
            if not coordinates or not isinstance(coordinates, list):
                continue
            road_line = LineString(coordinates)
            if not road_line.is_empty and road_line.intersects(polygon_shape):
                road = RoadOut(
                    id=row["id"],
                    project_id=row["project_id"],
                    polyline=polyline_text,
                    center=json.dumps(
                        {"lat": row["center_lat"], "lng": row["center_lng"]}
                        if row["center_lat"] and row["center_lng"]
                        else {"lat": None, "lng": None},
                    ),
                    length=row["length"],
                    is_enabled=bool(row["is_enabled"]),
                    is_selected=bool(row["is_selected"]) if "is_selected" in row.keys() else None,
                    name=row["name"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                roads.append(road)
        except Exception as e:
            logger.warning("Failed to decode road polyline %s: %s", row["id"], e)
            continue

    logger.info(
        "Selected %s roads for project_id=%s using polygon bounds %s",
        len(roads),
        selection.project_id,
        (min_lat, min_lng, max_lat, max_lng),
    )
    return roads

@router.get("/{road_id}", response_model=RoadOut)
async def get_road_by_id(road_id: int):
    """Get a specific road by ID"""
    try:
        logger.info(f"Fetching road with ID: {road_id}")
        
        query = """
        SELECT id, project_id, polyline, center_lat, center_lng, length, is_enabled, name,
               created_at, updated_at, is_selected
        FROM roads 
        WHERE id = ? AND deleted_at IS NULL
        """
        
        row = await query_db(query, (road_id,), one=True)
        
        if not row:
            raise HTTPException(status_code=404, detail="Road not found")
        
        road = RoadOut(
            id=row["id"],
            project_id=row["project_id"],
            polyline=row["polyline"],
            center=json.dumps({"lat": row["center_lat"], "lng": row["center_lng"]}),
            length=row["length"],
            is_enabled=bool(row["is_enabled"]),
            is_selected=bool(row["is_selected"]) if "is_selected" in row.keys() else None,
            name=row["name"],
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )
        
        logger.info(f"Found road: {road.id}")
        
        return road
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching road {road_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch road")

@router.put("/{road_id}", response_model=RoadOut)
async def update_road(road_id: int, updates: RoadUpdate):
    """Update a road's properties (e.g., is_enabled, name)"""
    try:
        logger.info(f"Updating road ID: {road_id} with updates: {updates}")
        
        # First, check if road exists
        check_query = "SELECT id, project_id FROM roads WHERE id = ? AND deleted_at IS NULL"
        existing_road = await query_db(check_query, (road_id,), one=True)
        
        if not existing_road:
            raise HTTPException(status_code=404, detail="Road not found")
        
        # Build update query dynamically based on provided fields
        update_fields = []
        params = []
        
        if updates.is_enabled is not None:
            update_fields.append("is_enabled = ?")
            params.append(int(updates.is_enabled))  # Convert bool to int for SQLite
        if updates.is_selected is not None:
            update_fields.append("is_selected = ?")
            params.append(int(updates.is_selected))
        
        if updates.name is not None:
            update_fields.append("name = ?")
            params.append(updates.name)
        
        if updates.deleted_at is not None:
            update_fields.append("deleted_at = ?")
            params.append(updates.deleted_at)
        
        # Always update updated_at timestamp
        update_fields.append("updated_at = datetime('now')")
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        # Add road_id to params for WHERE clause
        params.append(road_id)

        
        # Execute update
        update_query = f"""
        UPDATE roads 
        SET {', '.join(update_fields)}
        WHERE id = ?
        """
        
        await query_db(update_query, tuple(params), one=False , commit=True)
        
        # Fetch and return updated road
        updated_road_query = """
        SELECT id, project_id, polyline, center_lat, center_lng, length, is_enabled, name,
               created_at, updated_at, is_selected
        FROM roads 
        WHERE id = ?
        """
        
        row = await query_db(updated_road_query, (road_id,), one=True)
        
        road = RoadOut(
            id=row["id"],
            project_id=row["project_id"],
            polyline=row["polyline"],
            center=json.dumps({"lat": row["center_lat"], "lng": row["center_lng"]}),
            length=row["length"],
            is_enabled=bool(row["is_enabled"]),
            is_selected=bool(row["is_selected"]) if "is_selected" in row.keys() else None,
            name=row["name"],
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )
        
        logger.info(f"Successfully updated road {road_id}")
        return road
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating road {road_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update road")

@router.put("/{road_id}/delete", response_model=dict)
async def soft_delete_road(road_id: int):
    """Soft delete a road by setting deleted_at timestamp (using PUT)"""
    try:
        logger.info(f"Soft deleting road ID: {road_id}")
        
        # Check if road exists
        check_query = "SELECT id, project_id FROM roads WHERE id = ? AND deleted_at IS NULL"
        existing_road = await query_db(check_query, (road_id,), one=True)
        
        if not existing_road:
            raise HTTPException(status_code=404, detail="Road not found")
        
        # Soft delete by setting deleted_at
        delete_query = """
        UPDATE roads 
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
        """
        
        await query_db(delete_query, (road_id,), one=False , commit=True)
        
        logger.info(f"Successfully soft deleted road {road_id}")
        
        return {
            "success": True,
            "message": f"Road {road_id} deleted successfully",
            "data": {"id": road_id, "project_id": existing_road["project_id"]}
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting road {road_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete road")

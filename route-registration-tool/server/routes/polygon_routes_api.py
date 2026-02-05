import asyncio
import logging
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from geographiclib.geodesic import Geodesic
from server.db.database import query_db
from server.utils.polygon_roads_api import fetch_roads_generator, create_roads_sqlite

router = APIRouter()
logger = logging.getLogger(__name__)

class PolygonCreateRequest(BaseModel):
    project_id: int
    polygon_name: str
    priority_type: Optional[List[str]] = None
    road_priorities: Optional[List[str]] = None  # Alias for priority_type
    geometry: Dict[str, Any]


class RoadData(BaseModel):
    road_id: str
    distance_km: float
    polyline: Optional[Dict[str, Any]] = None
    priority: str
    name: str
    endpoints: Dict[str, Any]

class PolygonCreateResponse(BaseModel):
    geojson_feature_collection: Dict[str, Any]
    message: str
    roads_created: int
    total_roads: int = 0
    roads_of_required_priority: int = 0

def calculate_direction(polyline: Dict[str, Any]) -> Optional[int]:
    """
    Calculate the direction (bearing) of a road from its polyline coordinates.
    Returns a value between 0 and 359 representing the deviation from north direction.
    
    Uses geographiclib for precise geodesic calculations.
    
    Args:
        polyline: GeoJSON LineString with coordinates in [lng, lat] format
        
    Returns:
        Direction in degrees (0-359), where 0 is north, or None if calculation fails
    """
    if not polyline or "coordinates" not in polyline:
        return None
    
    coords = polyline.get("coordinates", [])
    if len(coords) < 2:
        return None
    
    try:
        # Get start and end coordinates
        # GeoJSON format: [lng, lat]
        start_lng, start_lat = coords[0]
        end_lng, end_lat = coords[-1]
        
        # Calculate initial bearing using geographiclib
        # Geodesic.Inverse expects (lat, lng) in degrees
        geod = Geodesic.WGS84.Inverse(start_lat, start_lng, end_lat, end_lng)
        
        # Extract initial azimuth (bearing from north)
        # azi1 is the initial bearing in degrees (-180 to 180)
        initial_bearing = geod['azi1']
        
        # Normalize to 0-359 range
        direction = int(round(initial_bearing)) % 360
        if direction < 0:
            direction += 360
        
        return direction
    except Exception as e:
        logger.warning(f"Failed to calculate direction: {e}")
        return None


def convert_custom_to_geojson_polygon(obj):
    """
    Converts:
    {
        "coordinates": [
            {"latitude": ..., "longitude": ...},
            ...
        ]
    }
    into valid GeoJSON Polygon.
    """
    if "coordinates" not in obj:
        raise ValueError("Missing 'coordinates' field")

    coords = obj["coordinates"]
    if not isinstance(coords, list) or len(coords) < 3:
        raise ValueError("Polygon must have at least 3 coordinate points")

    # Convert list of dicts → list [lng, lat]
    ring = []
    for p in coords:
        lat = p.get("latitude")
        lng = p.get("longitude")
        if lat is None or lng is None:
            raise ValueError("Each coordinate must contain latitude & longitude")
        ring.append([lng, lat])

    # Ensure polygon is closed
    if ring[0] != ring[-1]:
        ring.append(ring[0])

    return {
        "type": "Polygon",
        "coordinates": [ring]
    }

def convert_roads_to_feature_collection(geometry: Dict[str, Any], roads: List[RoadData]) -> Dict[str, Any]:
    """
    Converts list of RoadData objects to GeoJSON FeatureCollection format.
    
    Input: List of RoadData objects with polyline (GeoJSON LineString)
    Output: GeoJSON FeatureCollection with each road as a Feature
    """
    polygon_geojson = convert_custom_to_geojson_polygon(geometry)
    features = []
    
    polygon_feature = {
        "type": "Feature",
        "geometry": polygon_geojson,
        "properties": {}
        }

    features.append(polygon_feature)
    
    for road in roads:
        if not road.polyline:
            continue
        
        # Calculate direction from polyline
        direction = calculate_direction(road.polyline)
            
        road_feature = {
            "type": "Feature",
            "geometry": road.polyline,
            "properties": {
                "road_id": road.road_id,
                "length": road.distance_km,
                "priority": road.priority,
                "name": road.name,
                "start_point": road.endpoints.get("start", None),
                "end_point": road.endpoints.get("end", None),
                "direction": direction
            }
        }
        features.append(road_feature)
    
    return {
        "type": "FeatureCollection",
        "features": features
    }


def _process_polygon_create(project_id: int, geometry: Dict[str, Any], priority_list: Optional[List[str]], polygon_name: str) -> PolygonCreateResponse:
    logger.info(f"Polygon boundary creation started")

    all_road_data_for_response: List[RoadData] = []
    
    stats: Dict[str, List[int]] = {
        "successfully_added": [],
        "failed_to_add": [],
    }
    total_roads_processed = 0

    try:
        for road_batch in fetch_roads_generator(geometry):
            total_roads_processed += len(road_batch)
            batch_result = create_roads_sqlite(road_batch, project_id=project_id, priority_list=priority_list)
            successfully_added: Dict[int, float] = batch_result["successfully_added"]
            endpoints_data: Dict[int, str] = batch_result["endpoints_data"]
            failed_to_add: List[int] = batch_result["failed_to_add"]
            road_id_to_db_id: Dict[int, int] = batch_result.get("road_id_to_db_id", {})
            stats["successfully_added"].extend(successfully_added)
            stats["failed_to_add"].extend(failed_to_add)

            for road in road_batch:
                if road.road_id in successfully_added:
                    # Use the database id if available, otherwise fall back to the original road_id
                    db_id = road_id_to_db_id.get(road.road_id, road.road_id)
                    all_road_data_for_response.append(
                        RoadData(
                            road_id=str(db_id),
                            distance_km=successfully_added[road.road_id],
                            polyline=road.polyline,
                            priority=road.priority,
                            endpoints=endpoints_data[road.road_id],
                            name=road.name
                        )
                    )
                    
    except HTTPException as http_exc:
        logger.error(f"Road fetch limit exceeded: {http_exc.detail}")
        raise http_exc
    
    except Exception as e:
        logger.error(f"Stream processing interrupted: {e}")
        raise e

    if not all_road_data_for_response:
        raise HTTPException(status_code=404, detail="No roads found within the polygon area")

    roads_of_required_priority = len(stats["successfully_added"])
    total_roads = total_roads_processed
    roads_created = roads_of_required_priority  # Same as roads_of_required_priority
    
    message = (
        f"Polygon boundary successfully created with {roads_created} roads"
    )

    logger.info(message)   
    # Convert roads to GeoJSON FeatureCollection
    feature_collection = convert_roads_to_feature_collection(geometry, all_road_data_for_response)

    return PolygonCreateResponse(
        geojson_feature_collection=feature_collection,
        message=message,
        roads_created=roads_created,
        total_roads=total_roads,
        roads_of_required_priority=roads_of_required_priority,
    )


@router.post("/ingest", response_model=PolygonCreateResponse)
async def create_polygon(payload: PolygonCreateRequest):
    project_id = payload.project_id
    polygon_name = payload.polygon_name
    geometry = payload.geometry
    priority_list = payload.road_priorities or payload.priority_type

    if not project_id or not polygon_name or not geometry:
        raise HTTPException(
            status_code=400,
            detail="project_id, polygon_name, and geometry are required"
        )

    project = await query_db("SELECT id FROM projects WHERE id=:id", {"id": project_id}, one=True)
    if not project:
        raise HTTPException(status_code=400, detail=f"Project with id={project_id} does not exist")

    try:
        response = await asyncio.to_thread(
            _process_polygon_create,
            project_id,
            geometry,
            priority_list,
            polygon_name,
        )
        return response

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.exception("Failed to create polygon")
        raise HTTPException(status_code=500, detail=f"Failed to create polygon: {str(e)}")

@router.delete("/delete/{project_id}")
async def delete_roads(project_id: int):
    try:
        await query_db("DELETE FROM roads WHERE project_id = ?", (project_id,), commit=True)
        return {"message": "Roads deleted successfully"}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.exception("Failed to delete roads")
        raise HTTPException(status_code=500, detail=f"Failed to delete roads: {str(e)}")

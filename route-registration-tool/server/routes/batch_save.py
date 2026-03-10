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


from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
import json
import logging
import os
from shapely.geometry import LineString, shape
from pyproj import Proj

from .routes import RouteCoordinates, RouteSaveRequest
from server.db.database import query_db, get_db_transaction
from server.utils.firebase_logger import log_route_creation_async

router = APIRouter(prefix="/routes", tags=["Batch Save"])
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

MAX_ROUTES_PER_PROJECT = int(os.getenv("MAX_ROUTES_PER_PROJECT", "1000"))

wgs84 = Proj(init="epsg:4326")
utm = Proj(init="epsg:32633")

# Request & Response Models
class BatchSaveRoutesRequest(BaseModel):
    routes: List[RouteSaveRequest]  # Each route matches single-route format

class BatchSaveRoutesResponse(BaseModel):
    success: bool
    data: List[Dict[str, Any]]  # List of single-route responses
    message: str

class BatchSoftDeleteRequest(BaseModel):
    """Request model for batch soft delete"""
    route_ids: List[str] = Field(..., description="List of route UUIDs to soft delete")

class BatchMoveRequest(BaseModel):
    """Request model for batch move (update tags)"""
    route_ids: List[str] = Field(..., description="List of route UUIDs to move")
    tag: Optional[str] = Field(None, description="Destination tag (null for Untagged)")


@router.post("/batch-save", response_model=BatchSaveRoutesResponse)
async def batch_save_routes(request: BatchSaveRoutesRequest, background_tasks: BackgroundTasks):
    if not request.routes:
        logger.warning("No routes provided for batch save")
        raise HTTPException(status_code=400, detail="No routes provided for batch save")

    processed = {}
    added_routes = 0
    excluded_routes = 0

    # Fetch jurisdiction boundary and project_uuid once for the project
    region_id = request.routes[0].region_id
    logger.debug(f"Fetching project with region_id: {region_id}")
    project = await query_db(
        "SELECT jurisdiction_boundary_geojson, project_uuid FROM projects WHERE id = ? AND deleted_at IS NULL",
        (region_id,),
        one=True
    )
    if not project:
        logger.error(f"Project with region_id {region_id} not found")
        raise HTTPException(status_code=404, detail="Project not found")

    # Check current route count for the project (top-level routes only)
    count_row = await query_db(
        "SELECT COUNT(*) AS cnt FROM routes WHERE project_id = ? AND deleted_at IS NULL",
        (region_id,),
        one=True
    )
    current_route_count = (count_row["cnt"] or 0) if count_row else 0

    project_uuid = project["project_uuid"] or ""
    boundary_geojson = project["jurisdiction_boundary_geojson"]
    if not boundary_geojson:
        logger.warning("No jurisdiction boundary defined for the project")
        raise HTTPException(status_code=400, detail="No jurisdiction boundary defined")

    # Convert the boundary_geojson into a shapely geometry
    boundary = json.loads(boundary_geojson)

    if boundary["type"].lower() == "featurecollection":
        # Combine all geometries in the FeatureCollection
        geoms = [shape(f["geometry"]) for f in boundary["features"]]
        if len(geoms) == 1:
            boundary_shape = geoms[0]
        else:
            from shapely.geometry import GeometryCollection
            boundary_shape = GeometryCollection(geoms)
    else:
        boundary_shape = shape(boundary)

    to_insert = []
    responses = []

    for route in request.routes:
        try:
            logger.debug(f"Processing route with UUID: {route.uuid}")
            coords = RouteCoordinates(**route.coordinates.model_dump(mode="json"))

            if len(coords.origin) != 2 or len(coords.destination) != 2:
                logger.warning(f"Invalid origin/destination for route {route.uuid}: {coords.origin}, {coords.destination}")
                raise ValueError("Origin/destination must be [lng, lat]")

            for wp in coords.waypoints:
                if len(wp) != 2:
                    logger.warning(f"Invalid waypoint for route {route.uuid}: {wp}")
                    raise ValueError("Each waypoint must be [lng, lat]")

            # Create a LineString from the route's coordinates
            points = [coords.origin] + coords.waypoints + [coords.destination]
            route_line = LineString([(p[0], p[1]) for p in points])

            # Check if the route line is within the jurisdiction boundary
            if not boundary_shape.contains(route_line):
                logger.info(f"Route {route.uuid} is outside the jurisdiction boundary. Skipping.")
                excluded_routes += 1
                continue  # Skip this route since it is out of jurisdiction

            # Calculate route length if not provided
            if not route.length:
                route_length_deg = route_line.length
                route_length_km = route_length_deg * 100  # Approximate conversion
                logger.debug(f"Calculated route length for {route.uuid}: {route_length_km} km")
            else:
                route_length_km = route.length

            center = {
                "lat": (coords.origin[1] + coords.destination[1]) / 2,
                "lng": (coords.origin[0] + coords.destination[0]) / 2
            }

            # Process spatial fields (assuming you have a more efficient built-in function here)
            spatial = {
                "start_lat": coords.origin[1],
                "start_lng": coords.origin[0],
                "end_lat": coords.destination[1],
                "end_lng": coords.destination[0],
                "min_lat": min(coords.origin[1], coords.destination[1]),
                "max_lat": max(coords.origin[1], coords.destination[1]),
                "min_lng": min(coords.origin[0], coords.destination[0]),
                "max_lng": max(coords.origin[0], coords.destination[0]),
            }

            original_geojson = route.original_route_geo_json
            if original_geojson and not isinstance(original_geojson, str):
                original_geojson = json.dumps(original_geojson)

            processed[route.uuid] = {
                "route": route,
                "coords": coords,
                "center": center,
                "spatial": spatial,
                "length_km": route_length_km,
                "original_geojson": original_geojson,
                "match_percentage": route.match_percentage
            }
            added_routes += 1
            logger.info(f"Successfully processed route {route.uuid}")

        except Exception as e:
            logger.error(f"Error processing route {route.uuid}: {str(e)}")
            processed[route.uuid] = {"error": str(e)}

    for uuid, item in processed.items():
        if "error" in item:
            logger.debug(f"Route {uuid} failed with error: {item['error']}")
            responses.append({
                "success": False,
                "data": {"uuid": uuid},
                "message": item["error"]
            })
            continue

        r = item["route"]
        c = item["coords"]
        s = item["spatial"]
        center = item["center"]
        length_km = item["length_km"]
        original_geojson = item["original_geojson"]
        match_percentage = item.get("match_percentage")

        origin_json = json.dumps({"lat": c.origin[1], "lng": c.origin[0]})
        dest_json = json.dumps({"lat": c.destination[1], "lng": c.destination[0]})
        waypoints_json = json.dumps(c.waypoints) if c.waypoints else None
        center_json = json.dumps(center)

        now = datetime.now().isoformat()
        to_insert.append((  # Prepare data for insertion
                uuid,
                r.region_id,
                project_uuid,
                r.route_name,
                origin_json,
                dest_json,
                waypoints_json,
                center_json,
                r.route_type or "individual",
                length_km,
                r.encoded_polyline,
                s["start_lat"], s["start_lng"], s["end_lat"], s["end_lng"],
                s["min_lat"], s["max_lat"], s["min_lng"], s["max_lng"],
                r.tag if r.tag else "",
                original_geojson,
                match_percentage
            ))

        responses.append({
            "success": True,
            "data": {
                "id": r.region_id,
                "uuid": uuid,
                "route_name": r.route_name,
                "created_at": now,
                "updated_at": now
            },
            "message": "Route created successfully"
        })
        logger.info(f"Prepared route {uuid} for insertion.")

    # Enforce max routes per project before inserting
    if to_insert:
        new_total = current_route_count + len(to_insert)
        if new_total > MAX_ROUTES_PER_PROJECT:
            raise HTTPException(
                status_code=400,
                detail=f"Project cannot have more than {MAX_ROUTES_PER_PROJECT} routes. Current: {current_route_count}, attempted to add: {len(to_insert)}. Please remove some routes or split across projects."
            )

    if to_insert:
        logger.debug(f"Inserting {len(to_insert)} new routes into the database.")
        async with get_db_transaction() as conn:
            await conn.executemany(""" 
                INSERT INTO routes (
                    uuid, project_id, project_uuid, route_name, origin, destination, waypoints, center,
                    route_type, length, encoded_polyline,
                    start_lat, start_lng, end_lat, end_lng,
                    min_lat, max_lat, min_lng, max_lng,
                    tag, original_route_geo_json, match_percentage,
                    is_enabled, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'unsynced')
            """, to_insert)
        
        # Log each route creation to Firestore asynchronously (non-blocking)
        # Only log routes that were successfully inserted (those in to_insert)
        for route_tuple in to_insert:
            uuid = route_tuple[0]
            if uuid in processed and "error" not in processed[uuid]:
                item = processed[uuid]
                r = item["route"]
                route_metadata = {
                    "project_id": r.region_id,
                    "route_name": r.route_name,
                    "route_type": r.route_type or "individual",
                    "length": item["length_km"],
                    "tag": r.tag,
                    "distance": item["length_km"],  # Distance in km
                }
                background_tasks.add_task(log_route_creation_async, uuid, route_metadata)

    logger.info(f"Batch save complete: Added {added_routes} routes, Excluded {excluded_routes} routes.")
    return BatchSaveRoutesResponse(
        success=True,
        data=responses,
        message=f"Processed {added_routes} routes. {excluded_routes} routes were excluded due to being outside jurisdiction."
    )

@router.post("/batch/soft-delete")
async def batch_soft_delete_routes(request: BatchSoftDeleteRequest):
    """Batch soft delete multiple routes by UUID"""
    try:
        if not request.route_ids or len(request.route_ids) == 0:
            raise HTTPException(status_code=400, detail="route_ids cannot be empty")
        
        logger.info(f"Batch soft deleting {len(request.route_ids)} routes")
        
        # Validate that all routes exist and belong to the same project (for security)
        placeholders = ",".join(["?" for _ in request.route_ids])
        validation_query = f"""
        SELECT DISTINCT project_id 
        FROM routes 
        WHERE uuid IN ({placeholders}) AND deleted_at IS NULL
        """
        projects = await query_db(validation_query, tuple(request.route_ids))
        
        if len(projects) == 0:
            raise HTTPException(status_code=404, detail="No valid routes found to delete")
        
        if len(projects) > 1:
            raise HTTPException(
                status_code=400, 
                detail="All routes must belong to the same project"
            )
        
        # Perform batch soft delete
        update_query = f"""
        UPDATE routes 
        SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE uuid IN ({placeholders}) AND deleted_at IS NULL
        """


        # Delete all child routes
        query_delete_child_routes = f"""
        UPDATE routes 
        SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE parent_route_id IN ({placeholders}) AND deleted_at IS NULL
        """

        await query_db(update_query, tuple(request.route_ids), commit=True)
        
        await query_db(query_delete_child_routes, tuple(request.route_ids), commit=True)
        
        deleted_count = len(request.route_ids)
        logger.info(f"Successfully soft deleted {deleted_count} routes")
        
        return {
            "success": True,
            "message": f"Successfully deleted {deleted_count} route(s)",
            "deleted_count": deleted_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error batch soft deleting routes: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to batch soft delete routes")

@router.post("/batch/move")
async def batch_move_routes(request: BatchMoveRequest):
    """Batch move routes (update tags)"""
    try:
        if not request.route_ids or len(request.route_ids) == 0:
            raise HTTPException(status_code=400, detail="route_ids cannot be empty")
        
        logger.info(f"Batch moving {len(request.route_ids)} routes to tag: {request.tag or 'Untagged'}")
        
        # Validate that all routes exist and belong to the same project (for security)
        placeholders = ",".join(["?" for _ in request.route_ids])
        validation_query = f"""
        SELECT DISTINCT project_id 
        FROM routes 
        WHERE uuid IN ({placeholders}) AND deleted_at IS NULL
        """
        projects = await query_db(validation_query, tuple(request.route_ids))
        
        if len(projects) == 0:
            raise HTTPException(status_code=404, detail="No valid routes found to move")
        
        if len(projects) > 1:
            raise HTTPException(
                status_code=400, 
                detail="All routes must belong to the same project"
            )
        
        # Normalize tag: empty string or None becomes NULL
        tag_value = request.tag.strip() if request.tag and request.tag.strip() else ""
        
        # Perform batch update
        update_query = f"""
        UPDATE routes 
        SET tag = ?, updated_at = CURRENT_TIMESTAMP, synced_at = NULL, sync_status = 'unsynced',
        latest_data_update_time = NULL, static_duration_seconds = NULL, current_duration_seconds = NULL,
        routes_status = NULL, validation_status = NULL, traffic_status = NULL
        WHERE uuid IN ({placeholders}) AND deleted_at IS NULL
        """
        
        # Combine tag_value with route_ids for the query parameters
        params = (tag_value,) + tuple(request.route_ids)
        await query_db(update_query, params, commit=True)
        
        updated_count = len(request.route_ids)
        tag_display = tag_value or "Untagged"
        logger.info(f"Successfully moved {updated_count} routes to tag: {tag_display}")
        
        return {
            "success": True,
            "message": f"Successfully moved {updated_count} route(s) to '{tag_display}'",
            "updated_count": updated_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error batch moving routes: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to batch move routes")


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


import json
import uuid
from fastapi import APIRouter, HTTPException, BackgroundTasks
from server.db.database import query_db, get_db_transaction
from server.routes.routes import get_route_by_uuid
from server.utils.compute_parent_sync_status import update_parent_sync_status
from server.utils.firebase_logger import log_route_creation_async
import logging
import polyline
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

router = APIRouter(prefix="/routes", tags=["Routes"])

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)

class SegmentationResponse(BaseModel):
    """Response for segmentation"""
    success: bool
    message: str
    segmentsCreated: int
    newRouteUuid: str  # The new UUID after segmentation (old route is soft-deleted)

class SegmentationRequest(BaseModel):
    """Request for applying segmentation"""
    type: str = Field(..., description="Segmentation type: 'manual', 'distance', or 'intersections'")
    cutPoints: Optional[List[List[float]]] = Field(None, description="Cut points for manual segmentation")
    distanceKm: Optional[float] = Field(None, description="Distance for distance-based segmentation")
    segments: List[Dict[str, Any]] = Field(..., description="Generated segments")

@router.post("/{route_uuid}/segment", response_model=SegmentationResponse)
async def apply_segmentation(route_uuid: str, segmentation_data: SegmentationRequest, background_tasks: BackgroundTasks):
    """Apply segmentation to a route"""
    try:
        logger.info(f"Applying segmentation to route: {route_uuid}")
        
        # Check if route exists
        route = await get_route_by_uuid(route_uuid)
        
        async with get_db_transaction() as conn:
            # Step 0: Fetch all fields from the original route to create a copy
            fetch_original_query = """
            SELECT project_id, route_name, origin, destination, waypoints, center,
                   encoded_polyline, route_type, length, parent_route_id, has_children,
                   is_segmented, segmentation_type, segmentation_points, segmentation_config,
                   sync_status, is_enabled, tag, original_route_geo_json, match_percentage,
                   temp_geometry, routes_status, start_lat, start_lng, end_lat, end_lng,
                   min_lat, max_lat, min_lng, max_lng, latest_data_update_time,
                   static_duration_seconds, current_duration_seconds, synced_at,
                   validation_status, traffic_status
            FROM routes 
            WHERE uuid = ? AND deleted_at IS NULL
            """
            
            original_route_row = await query_db(fetch_original_query, (route_uuid,), conn=conn, one=True)
            
            if not original_route_row:
                raise HTTPException(status_code=404, detail="Route not found")

            project_uuid_row = await query_db(
                "SELECT project_uuid FROM projects WHERE id = ? AND deleted_at IS NULL",
                (original_route_row["project_id"],),
                conn=conn,
                one=True
            )
            project_uuid = project_uuid_row["project_uuid"] if project_uuid_row and "project_uuid" in project_uuid_row.keys() and project_uuid_row["project_uuid"] else None
            
            # Step 0.5: Create new route UUID for the copy
            new_route_uuid = str(uuid.uuid4())
            
            # Step 0.6: Soft delete the original route
            delete_original_query = """
            UPDATE routes 
            SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE uuid = ?
            """
            await query_db(delete_original_query, (route_uuid,), conn=conn)
            logger.info(f"Soft deleted original route: {route_uuid}")
            
            # Step 0.7: Clean up existing child routes of original route (if any)
            child_routes_query = """
            SELECT uuid FROM routes WHERE parent_route_id = ?
            """
            child_route_rows = await query_db(child_routes_query, (route_uuid,), conn=conn)
            child_route_ids_old = [row["uuid"] for row in child_route_rows]

            logger.info(f"Found {len(child_route_ids_old)} existing child routes to clean up")

            # Delete existing child routes
            for child_route_id in child_route_ids_old:                                
                delete_child_route_query = """
                UPDATE routes SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?
                """
                await query_db(delete_child_route_query, (child_route_id,), conn=conn)
                logger.info(f"Deleted child route: {child_route_id}")
            
            # Step 1: Create new route as a copy of the original with segmentation updates
            # Prepare segmentation data
            cut_points_json = None
            if segmentation_data.cutPoints:
                cut_points_json = json.dumps(segmentation_data.cutPoints)
            
            config_json = json.dumps({
                "type": segmentation_data.type,
                "distanceKm": segmentation_data.distanceKm,
                "cutPointsCount": len(segmentation_data.cutPoints) if segmentation_data.cutPoints else 0
            })
            
            insert_new_route_query = """
            INSERT INTO routes (
                uuid, project_id, project_uuid, route_name, origin, destination, waypoints, center,
                encoded_polyline, route_type, length, parent_route_id, has_children,
                is_segmented, segmentation_type, segmentation_points, segmentation_config,
                sync_status, synced_at, is_enabled, tag, original_route_geo_json, match_percentage,
                temp_geometry, routes_status, start_lat, start_lng, end_lat, end_lng,
                min_lat, max_lat, min_lng, max_lng, latest_data_update_time,
                static_duration_seconds, current_duration_seconds, validation_status, traffic_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """

            await query_db(
                insert_new_route_query,
                (
                    new_route_uuid,
                    original_route_row["project_id"],
                    project_uuid,
                    original_route_row["route_name"],
                    original_route_row["origin"],
                    original_route_row["destination"],
                    original_route_row["waypoints"],
                    original_route_row["center"],
                    original_route_row["encoded_polyline"],
                    original_route_row["route_type"],
                    original_route_row["length"],
                    original_route_row["parent_route_id"],  # Keep original parent if any
                    True,  # has_children = TRUE (will have children)
                    True,  # is_segmented = TRUE
                    segmentation_data.type,  # segmentation_type
                    cut_points_json,  # segmentation_points
                    config_json,  # segmentation_config
                    "unsynced",  # sync_status
                    None,  # synced_at = NULL
                    original_route_row["is_enabled"],
                    original_route_row["tag"],
                    original_route_row["original_route_geo_json"],
                    original_route_row["match_percentage"],
                    original_route_row["temp_geometry"],
                    original_route_row["routes_status"],
                    original_route_row["start_lat"],
                    original_route_row["start_lng"],
                    original_route_row["end_lat"],
                    original_route_row["end_lng"],
                    original_route_row["min_lat"],
                    original_route_row["max_lat"],
                    original_route_row["min_lng"],
                    original_route_row["max_lng"],
                    original_route_row["latest_data_update_time"],
                    original_route_row["static_duration_seconds"],
                    original_route_row["current_duration_seconds"],
                    original_route_row["validation_status"],
                    original_route_row["traffic_status"]
                ),
                conn=conn
            )
            
            logger.info(f"Created new route copy: {new_route_uuid} from original route: {route_uuid}")
            
            # Log new parent route creation to Firestore asynchronously (non-blocking)
            parent_metadata = {
                "project_id": original_route_row["project_id"],
                "route_name": original_route_row["route_name"],
                "route_type": original_route_row["route_type"] or "individual",
                "length": original_route_row["length"],
                "distance": original_route_row["length"],
                "tag": original_route_row["tag"],
                "is_segmented": True,
                "segmentation_type": segmentation_data.type,
            }
            background_tasks.add_task(log_route_creation_async, new_route_uuid, parent_metadata)
            
            # Step 2: Create child routes under the new route
            child_route_ids = []
            for i, segment in enumerate(segmentation_data.segments):
                # Get coordinates from GeoJSON LineString
                coords = segment.get("linestringGeoJson", {}).get("coordinates", [])
                
                if not coords or len(coords) == 0:
                    logger.error(f"Segment {i + 1} has no coordinates, skipping")
                    continue
                
                # Create child route UUID
                child_route_uuid = str(uuid.uuid4())
                
                # Get origin and destination from segment data if provided, otherwise calculate from coordinates
                if segment.get("origin") and segment.get("destination"):
                    # Use provided origin and destination
                    origin = json.dumps({"lat": segment["origin"]["lat"], "lng": segment["origin"]["lng"]})
                    destination = json.dumps({"lat": segment["destination"]["lat"], "lng": segment["destination"]["lng"]})
                    origin_coord = [segment["origin"]["lng"], segment["origin"]["lat"]]
                    destination_coord = [segment["destination"]["lng"], segment["destination"]["lat"]]
                else:
                    # Calculate origin and destination from coordinates
                    origin_coord = coords[0]
                    destination_coord = coords[-1]
                    origin = json.dumps({"lat": origin_coord[1], "lng": origin_coord[0]})
                    destination = json.dumps({"lat": destination_coord[1], "lng": destination_coord[0]})
                
                # Get waypoints from segment data - use None if null/empty, otherwise use provided waypoints
                segment_waypoints = segment.get("waypoints")
                if segment_waypoints is None or (isinstance(segment_waypoints, list) and len(segment_waypoints) == 0):
                    waypoints_json = None  # Set to NULL in database
                else:
                    # segment_waypoints should be in format [[lng, lat], ...]
                    waypoints_json = json.dumps(segment_waypoints)
                
                coords_rev = [[coord[1], coord[0]] for coord in coords]

                # Encode coordinates to polyline format
                encoded_polyline = polyline.encode(coords_rev)
                
                # Calculate center coordinates
                center_lat = (origin_coord[1] + destination_coord[1]) / 2
                center_lng = (origin_coord[0] + destination_coord[0]) / 2
                
                # Get segment name - use custom name if provided, otherwise auto-generate
                segment_name = segment.get("route_name") or segment.get("name")
                if not segment_name:
                    segment_name = f"{route.route_name} - Segment {i + 1}"
                else:
                    logger.info(f"Using custom segment name: '{segment_name}' for segment {i + 1}")
                
                # Create child route with segment_order
                insert_child_route_query = """
                INSERT INTO routes (
                    uuid, project_id, project_uuid, route_name, origin, destination, waypoints, center,
                    encoded_polyline, route_type, length, parent_route_id, has_children,
                    is_segmented, segmentation_type, sync_status, is_enabled, segment_order, tag
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """

                await query_db(
                    insert_child_route_query,
                    (
                        child_route_uuid,
                        route.project_id,
                        project_uuid,
                        segment_name,  # Use custom name or auto-generated name
                        origin,
                        destination,
                        waypoints_json,  # Use waypoints from segment data (None if empty/null)
                        json.dumps({"lat": center_lat, "lng": center_lng}),
                        encoded_polyline,
                        "segment",  # Route type for child routes
                        segment.get("length", 0),
                        new_route_uuid,  # Parent route ID - use new route UUID
                        False,  # Child routes don't have children
                        False,  # Child routes are not segmented
                        None,   # No segmentation type for child routes
                        "unsynced",  # Sync status
                        bool(segment.get("is_enabled", True)),  # Use is_enabled from segment data, default to True
                        i + 1,  # segment_order (1-indexed)
                        original_route_row["tag"] if original_route_row["tag"] else ""
                    ),
                    conn=conn
                )
                
                child_route_ids.append(child_route_uuid)
                logger.info(f"Created child route: {child_route_uuid} for segment {i + 1} with segment_order {i + 1}")
                
                # Log segment creation to Firestore asynchronously (non-blocking)
                segment_metadata = {
                    "project_id": route.project_id,
                    "route_name": segment_name,
                    "route_type": "segment",
                    "length": segment.get("length", 0),
                    "distance": segment.get("length", 0),
                    "parent_route_id": route_uuid,
                    "segment_order": i + 1,
                    "segmentation_type": segmentation_data.type,
                }
                background_tasks.add_task(log_route_creation_async, child_route_uuid, segment_metadata)
            
            # Step 3: Compute and update parent route sync status based on enabled children
            await update_parent_sync_status(new_route_uuid, conn=conn)
            
            logger.info(f"Applied segmentation to route: {new_route_uuid}, created {len(child_route_ids)} child routes")
            
            return SegmentationResponse(
                success=True,
                message="Segmentation applied successfully",
                segmentsCreated=len(child_route_ids),
                newRouteUuid=new_route_uuid  # Return the new UUID so frontend can update
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error applying segmentation to route {route_uuid}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to apply segmentation")

@router.post("/{route_uuid}/clear-segmentation", response_model=SegmentationResponse)
async def clear_segmentation(route_uuid: str):
    """Clear segmentation from a route - restore to single road"""
    try:
        logger.info(f"Clearing segmentation for route: {route_uuid}")
        
        async with get_db_transaction() as conn:
            # Get project_id from route
            route_info_query = """
            SELECT project_id FROM routes WHERE uuid = ? AND deleted_at IS NULL
            """
            route_info = await query_db(route_info_query, (route_uuid,), conn=conn, one=True)
            if not route_info:
                raise HTTPException(status_code=404, detail="Route not found")
            
            project_id = route_info["project_id"]
            
            # Step 1: Soft delete child routes
            child_routes_query = """
            SELECT uuid FROM routes WHERE parent_route_id = ?
            """
            child_route_rows = await query_db(child_routes_query, (route_uuid,), conn=conn)
            child_route_ids = [row["uuid"] for row in child_route_rows]
            
            logger.info(f"Found {len(child_route_ids)} child routes for route {route_uuid}")
            
            # Soft delete child routes
            for child_route_id in child_route_ids:
                # Soft delete the child route
                update_child_route_query = """
                UPDATE routes SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?
                """
                await query_db(update_child_route_query, (child_route_id,), conn=conn, commit=True)
                logger.info(f"Soft deleted child route: {child_route_id}")
            
            # Step 2: Update route to clear segmentation metadata
            # Note: sync_status is set to 'unsynced' since there are no children anymore
            update_query = """
            UPDATE routes 
            SET is_segmented = FALSE, 
                has_children = FALSE,
                segmentation_type = NULL,
                segmentation_points = NULL,
                segmentation_config = NULL,
                sync_status = 'unsynced',
                synced_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE uuid = ?
            """
            
            await query_db(update_query, (route_uuid,), conn=conn)
            
            # Note: No need to compute parent sync status here since we're clearing segmentation
            # and setting sync_status to 'unsynced' directly (no children remain)
            
            logger.info(f"Cleared segmentation for route: {route_uuid}")
            
            return {
                "success": True,
                "message": "Segmentation cleared successfully",
                "segmentsCreated": 1
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing segmentation for route {route_uuid}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to clear segmentation")


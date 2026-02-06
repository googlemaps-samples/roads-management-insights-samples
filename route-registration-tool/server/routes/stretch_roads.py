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
import time
from typing import List, Dict, Optional, Tuple
from sqlalchemy import text, bindparam
from server.utils.create_engine import engine
import logging
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)


router = APIRouter(prefix="/roads", tags=["Stretch Roads"])

class StretchRoadsRequest(BaseModel):
    road_id: int
    db_project_id: int
    priority_list: List[str]

# Tolerance for coordinate matching (in degrees)
EPSILON = 0.000001

async def get_stretched_road(road_id: int, db_project_id: int, priority_list: List[str]) -> str:
    """
    Stretch a road by finding connecting roads in forward or backward direction.
    Only stretches if exactly 1 connecting road is found in a direction.
    Excludes mirror roads and roads where start meets start or end meets end.
    
    Args:
        road_id: ID of the initial road to stretch from
        db_project_id: Project ID to filter roads
        priority_list: List of priority strings to filter roads (only roads with these priorities)
    
    Returns:
        JSON string with success, data (stretched_roads, total_length, endpoints, etc.), and execution_time_ms
    """
    start_time = time.time()
    
    with engine.begin() as conn:
        try:
            # 1. Fetch the initial road
            initial_road_result = conn.execute(
                text("SELECT * FROM roads WHERE id = :road_id AND project_id = :project_id AND deleted_at IS NULL"),
                {"road_id": road_id, "project_id": db_project_id}
            ).fetchone()
            
            if not initial_road_result:
                execution_time = (time.time() - start_time) * 1000
                return {
                    "success": False,
                    "message": f"Road ID {road_id} not found",
                    "execution_time_ms": round(execution_time, 2)
                }
            
            initial_road = dict(initial_road_result._mapping)
            
            # Track all selected roads
            selected_road_ids = {road_id}
            road_chain = [initial_road]
            
            # 2. Stretch in forward direction (from end point)
            current_road = initial_road
            while True:
                next_road = await find_next_road(conn, current_road, db_project_id, priority_list, selected_road_ids, direction="forward")
                
                if next_road:
                    selected_road_ids.add(next_road['id'])
                    road_chain.append(next_road)
                    current_road = next_road
                else:
                    break
            
            # 3. Stretch in backward direction (from start point)
            current_road = initial_road
            while True:
                prev_road = await find_next_road(conn, current_road, db_project_id, priority_list, selected_road_ids, direction="backward")
                
                if prev_road:
                    selected_road_ids.add(prev_road['id'])
                    road_chain.insert(0, prev_road)
                    current_road = prev_road
                else:
                    break
            
            # 4. Format stretched roads
            formatted_roads = []
            total_length = 0.0
            
            for index, road in enumerate(road_chain):
                road_length = road.get('length', 0) or 0
                total_length += road_length
                
                formatted_roads.append({
                    "id": road['id'],
                    "polyline": road.get('polyline', '{}'),
                    "length": round(road_length, 2),
                    "name": road.get('name', ''),
                    "is_enabled": road.get('is_enabled', 0),
                    "order": index
                })
            
            # 5. Calculate endpoints from polylines
            first_road = road_chain[0]
            last_road = road_chain[-1]
            
            # Helper to get first coordinate from polyline
            def get_first_coord(road):
                polyline_data = road.get('polyline', '{}')
                try:
                    if isinstance(polyline_data, str):
                        polyline_obj = json.loads(polyline_data)
                    else:
                        polyline_obj = polyline_data
                    coords = polyline_obj.get('coordinates', [])
                    if coords:
                        return coords[0]  # [lng, lat]
                except Exception:
                    pass
                return None
            
            # Helper to get last coordinate from polyline
            def get_last_coord(road):
                polyline_data = road.get('polyline', '{}')
                try:
                    if isinstance(polyline_data, str):
                        polyline_obj = json.loads(polyline_data)
                    else:
                        polyline_obj = polyline_data
                    coords = polyline_obj.get('coordinates', [])
                    if coords:
                        return coords[-1]  # [lng, lat]
                except Exception:
                    pass
                return None
            
            # Determine start endpoint
            # First road's start coordinate (from polyline) is the chain start
            first_coord = get_first_coord(first_road)
            first_last_coord = get_last_coord(first_road)
            
            if len(road_chain) > 1:
                # Check how first road connects to second road
                second_first_coord = get_first_coord(road_chain[1])
                if first_last_coord and second_first_coord:
                    # If first road's end matches second road's start, use first road's start
                    if (abs(first_last_coord[0] - second_first_coord[0]) < EPSILON and 
                        abs(first_last_coord[1] - second_first_coord[1]) < EPSILON):
                        start_coord = first_coord
                    else:
                        # Otherwise, first road might be reversed, use its end
                        start_coord = first_last_coord
                else:
                    start_coord = first_coord if first_coord else [first_road.get('start_lng', 0), first_road.get('start_lat', 0)]
            else:
                start_coord = first_coord if first_coord else [first_road.get('start_lng', 0), first_road.get('start_lat', 0)]
            
            # Determine end endpoint
            # Last road's end coordinate (from polyline) is the chain end
            last_coord = get_last_coord(last_road)
            last_first_coord = get_first_coord(last_road)
            
            if len(road_chain) > 1:
                # Check how second-to-last road connects to last road
                second_last_coord = get_last_coord(road_chain[-2])
                if second_last_coord and last_first_coord:
                    # If second-to-last road's end matches last road's start, use last road's end
                    if (abs(second_last_coord[0] - last_first_coord[0]) < EPSILON and 
                        abs(second_last_coord[1] - last_first_coord[1]) < EPSILON):
                        end_coord = last_coord
                    else:
                        # Otherwise, last road might be reversed, use its start
                        end_coord = last_first_coord
                else:
                    end_coord = last_coord if last_coord else [last_road.get('end_lng', 0), last_road.get('end_lat', 0)]
            else:
                end_coord = last_coord if last_coord else [last_road.get('end_lng', 0), last_road.get('end_lat', 0)]
            
            # Format endpoints (polyline coordinates are [lng, lat], convert to {lat, lng})
            endpoints = {
                "start": {
                    "lat": start_coord[1] if start_coord else first_road.get('start_lat', 0),
                    "lng": start_coord[0] if start_coord else first_road.get('start_lng', 0),
                    "type": "intersection"
                },
                "end": {
                    "lat": end_coord[1] if end_coord else last_road.get('end_lat', 0),
                    "lng": end_coord[0] if end_coord else last_road.get('end_lng', 0),
                    "type": "intersection"
                }
            }
            
            execution_time = (time.time() - start_time) * 1000
            
            response = {
                "success": True,
                "data": {
                    "stretched_roads": formatted_roads,
                    "total_length": round(total_length, 2),
                    "total_count": len(formatted_roads),
                    "endpoints": endpoints,
                    "initial_road_id": road_id
                },
                "execution_time_ms": round(execution_time, 2)
            }
            
            return response
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            execution_time = (time.time() - start_time) * 1000
            return {
                "success": False,
                "error": str(e),
                "execution_time_ms": round(execution_time, 2)
            }


async def find_next_road(conn, current_road: Dict, db_project_id: int, priority_list: List[str], exclude_ids: set, direction: str) -> Optional[Dict]:
    """
    Find the next connecting road in the specified direction.
    Returns a road only if exactly 1 valid connecting road is found.
    
    Args:
        conn: Database connection
        current_road: Current road dictionary
        db_project_id: Project ID
        priority_list: List of priorities to filter
        exclude_ids: Set of road IDs to exclude
        direction: "forward" (from end point) or "backward" (from start point)
    
    Returns:
        Road dictionary if exactly 1 valid connection found, None otherwise
    """
    # Determine target point based on direction
    if direction == "forward":
        target_lat = current_road['end_lat']
        target_lng = current_road['end_lng']
    else:  # backward
        target_lat = current_road['start_lat']
        target_lng = current_road['start_lng']
    
    # Current road endpoints
    curr_start_lat = current_road['start_lat']
    curr_start_lng = current_road['start_lng']
    curr_end_lat = current_road['end_lat']
    curr_end_lng = current_road['end_lng']
    
    # Prepare exclude list (ensure it's not empty)
    safe_exclude_ids = list(exclude_ids) if exclude_ids else [-1]
    safe_priorities = list(priority_list) if priority_list else []
    
    if not safe_priorities:
        return None
    
    # Query for roads that connect at the target point
    sql = text("""
        SELECT * FROM roads 
        WHERE project_id = :project_id
        AND deleted_at IS NULL
        AND priority IN :priorities
        AND id NOT IN :exclude_ids
        AND is_enabled = 1
        AND (
            (ABS(start_lat - :target_lat) < :eps AND ABS(start_lng - :target_lng) < :eps) OR
            (ABS(end_lat - :target_lat) < :eps AND ABS(end_lng - :target_lng) < :eps)
        )
    """)
    
    # Bind expanding parameters
    sql = sql.bindparams(
        bindparam('priorities', expanding=True),
        bindparam('exclude_ids', expanding=True)
    )
    
    params = {
        "project_id": db_project_id,
        "target_lat": target_lat,
        "target_lng": target_lng,
        "eps": EPSILON,
        "priorities": safe_priorities,
        "exclude_ids": safe_exclude_ids
    }
    
    candidates_result = conn.execute(sql, params).fetchall()
    candidates = [dict(row._mapping) for row in candidates_result]
    
    # Filter candidates based on connection rules
    valid_candidates = []
    
    for road in candidates:
        road_start_lat = road['start_lat']
        road_start_lng = road['start_lng']
        road_end_lat = road['end_lat']
        road_end_lng = road['end_lng']
        
        # Check if this is a mirror road
        # Mirror: road's start matches current's end AND road's end matches current's start
        is_mirror = (
            (abs(road_start_lat - curr_end_lat) < EPSILON and 
             abs(road_start_lng - curr_end_lng) < EPSILON and
             abs(road_end_lat - curr_start_lat) < EPSILON and 
             abs(road_end_lng - curr_start_lng) < EPSILON) or
            (abs(road_start_lat - curr_start_lat) < EPSILON and 
             abs(road_start_lng - curr_start_lng) < EPSILON and
             abs(road_end_lat - curr_end_lat) < EPSILON and 
             abs(road_end_lng - curr_end_lng) < EPSILON)
        )
        
        if is_mirror:
            continue
        
        road_connects_at_start = (
            abs(road_start_lat - target_lat) < EPSILON and 
            abs(road_start_lng - target_lng) < EPSILON
        )
        road_connects_at_end = (
            abs(road_end_lat - target_lat) < EPSILON and 
            abs(road_end_lng - target_lng) < EPSILON
        )

        # Check connection type based on direction
        if direction == "forward":
            # Forward: we're looking from current road's end point
            # Valid: road's start point matches current's end point (road continues forward)
            # Invalid: road's end point matches current's end point (start-start or end-end)

            # Only accept if road's start connects to our end (forward continuation)
            if road_connects_at_start and not road_connects_at_end:
                valid_candidates.append(road)
        
        else:  # backward
            # Backward: we're looking from current road's start point
            # Valid: road's end point matches current's start point (road continues backward)
            # Invalid: road's start point matches current's start point (start-start or end-end)

            # Only accept if road's end connects to our start (backward continuation)
            if road_connects_at_end and not road_connects_at_start:
                valid_candidates.append(road)
    
    # Only return if exactly 1 valid candidate
    if len(valid_candidates) == 1:
        return valid_candidates[0]
    else:
        return None


@router.post("/stretch", response_model=dict)
async def stretch_roads(request: StretchRoadsRequest):
    return await get_stretched_road(request.road_id, request.db_project_id, request.priority_list)

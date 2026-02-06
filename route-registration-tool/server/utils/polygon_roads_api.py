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


import requests
from fastapi import HTTPException
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
import logging
import math
import json
from sqlalchemy import text
from .create_engine import engine


# Load env
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

API_URL = os.getenv("POLYGON_ROADS_API_URL")
API_KEY = os.getenv('GOOGLE_API_KEY')
if not API_KEY:
    raise ValueError("GOOGLE_API_KEY is not set")

@dataclass
class RoadData:
    road_id: int
    polyline: Dict[str, Any]
    priority: str
    name: str

def _haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on Earth using Haversine formula.
    Faster than geopy.distance.geodesic for batch processing.
    Returns distance in kilometers.
    """
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def _calculate_road_length(coords: List[List[float]]) -> float:
    """
    Calculate road length by summing distances between consecutive coordinate pairs.
    Optimized for batch processing.
    """
    if len(coords) < 2:
        return 0.0
    
    total_length = 0.0
    for i in range(1, len(coords)):
        lng1, lat1 = coords[i - 1]
        lng2, lat2 = coords[i]
        total_length += _haversine_distance_km(lat1, lng1, lat2, lng2)
    
    return round(total_length, 2)

def create_roads_sqlite(roads: list, project_id: int, priority_list: Optional[List[str]] = None):
    if not project_id:
        raise ValueError("Project ID is required")

    batch_values = []
    successfully_added: Dict[int, float] = {}
    endpoints_data: Dict[int, str] = {}
    failed_to_add = []

    # Process all roads in batch
    for road in roads:
        try:
            coords = road.polyline.get("coordinates", [])
            if len(coords) < 2:
                failed_to_add.append(road.road_id)
                continue

            start_lng, start_lat = coords[0]
            end_lng, end_lat = coords[-1]
            lats = [lat for lng, lat in coords]
            lngs = [lng for lng, lat in coords]

            min_lat, max_lat = min(lats), max(lats)
            min_lng, max_lng = min(lngs), max(lngs)
            center_lat = sum(lats) / len(lats)
            center_lng = sum(lngs) / len(lngs)

            name = f"{road.name}"
            endpoints = json.dumps({"start": [start_lng, start_lat], "end": [end_lng, end_lat]})
            polyline_json = json.dumps(road.polyline)
            road_priority = road.priority

            # Calculate length using optimized haversine formula
            length = _calculate_road_length(coords)

            # Priority check with set lookup (O(1) instead of O(n))
            successfully_added[road.road_id] = length
            endpoints_data[road.road_id] = {"start": [start_lng, start_lat], "end": [end_lng, end_lat]}
            batch_values.append({
                "project_id": project_id,
                "polyline": polyline_json,
                "center_lat": center_lat,
                "center_lng": center_lng,
                "length": length,
                "is_enabled": 1,
                "name": name,
                "endpoints": endpoints,
                "start_lat": start_lat,
                "start_lng": start_lng,
                "end_lat": end_lat,
                "end_lng": end_lng,
                "min_lat": min_lat,
                "max_lat": max_lat,
                "min_lng": min_lng,
                "max_lng": max_lng,
                "priority": road_priority,
                "road_id": road.name
            })

        except Exception as e:
            logging.error(f"Error processing road {road.road_id}: {e}")
            failed_to_add.append(road.road_id)

    road_id_to_db_id: Dict[int, int] = {}
    
    if batch_values:
        try:
            insert_sql = """
            INSERT INTO roads (
                project_id, polyline, center_lat, center_lng, length, is_enabled,
                name, endpoints, start_lat, start_lng, end_lat, end_lng,
                min_lat, max_lat, min_lng, max_lng, priority, road_id
            )
            VALUES (
                :project_id, :polyline, :center_lat, :center_lng, :length, :is_enabled,
                :name, :endpoints, :start_lat, :start_lng, :end_lat, :end_lng,
                :min_lat, :max_lat, :min_lng, :max_lng, :priority, :road_id
            );
            """
            with engine.begin() as conn:
                # Get the last rowid before insertion
                result = conn.execute(text("SELECT MAX(id) FROM roads WHERE project_id = :project_id"), {"project_id": project_id})
                last_id_before = result.scalar() or 0
                
                # Execute the bulk insert
                conn.execute(text(insert_sql), batch_values)
                
                # Query the newly inserted roads to get their IDs (ordered by insertion)
                query_sql = """
                SELECT id FROM roads 
                WHERE project_id = :project_id 
                AND id > :last_id_before
                ORDER BY id ASC
                """
                result = conn.execute(text(query_sql), {
                    "project_id": project_id,
                    "last_id_before": last_id_before
                })
                inserted_rows = result.fetchall()
                
                # Map inserted rows back to original road.road_id by matching order
                # Since we insert in the same order as the roads list, we can match sequentially
                inserted_index = 0
                for road in roads:
                    if road.road_id in successfully_added and inserted_index < len(inserted_rows):
                        db_id, = inserted_rows[inserted_index]
                        road_id_to_db_id[road.road_id] = db_id
                        inserted_index += 1
                
                logging.info(f"--> Successfully committed batch of {len(batch_values)} roads to DB.")
        except Exception as e:
            logging.exception(f"Critical Bulk Insert Error: {e}")

    return {
        "successfully_added": successfully_added,
        "failed_to_add": failed_to_add,
        "road_id_to_db_id": road_id_to_db_id,
        "endpoints_data": endpoints_data,
    }


def fetch_roads_generator(polygon_geometry: Dict[str, Any]):
    page_token = None
    total_fetched = 0

    while True:
        request_payload = {
            "geoAreaFilter": {"polygon": polygon_geometry},
            "pageSize": 5000
        }

        if page_token:
            request_payload["pageToken"] = page_token

        logging.info(f"Sending API request... (Total fetched so far: {total_fetched})")

        headers = {
            'X-Goog-Api-Key': API_KEY,
            'Content-Type': 'application/json'
        }

        try:
            response = requests.post(API_URL, json=request_payload, headers=headers)
            print(response.json(),"::::response")
            if response.status_code != 200:
                raise Exception(f"Error fetching data from API: {response.status_code}")

            response_json = response.json()
            batch_roads = []

            for i, road in enumerate(response_json.get("roads", [])):
                coordinates = [
                    (loc['location']['longitude'], loc['location']['latitude'])
                    for loc in road.get('coordinates', [])
                ]

                priority = road.get("priority", "NONE")
                # name = road.get("name", "NONE")
                name = next(
                    (
                        ln["text"]
                        for display in road.get("displayNames", [])
                        for ln in display.get("localizedNames", [])
                        if ln.get("languageCode") == "en"
                    ),
                    road.get("name", "NONE")
                )

                road_data = RoadData(
                    road_id=total_fetched + i + 1,
                    polyline={"type": "LineString", "coordinates": coordinates},
                    priority=priority,
                    name=name
                )
                batch_roads.append(road_data)

            if batch_roads:
                yield batch_roads
                total_fetched += len(batch_roads)

            page_token = response_json.get("nextPageToken")
            if total_fetched > 5000:
                logging.error(f"Fetched {total_fetched} roads — exceeds limit.")
                raise HTTPException(
                    status_code=400,
                    detail=f"Too many roads returned by API (limit is 5000)."
                )
            if not page_token:
                break

        except HTTPException:
            # Re-raise HTTPException without logging (will be handled upstream)
            raise
        except Exception as e:
            logging.error(f"API Fetch Error: {e}")
            raise e
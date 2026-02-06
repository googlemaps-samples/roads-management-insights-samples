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


import os
import json
import aiohttp
import polyline
from dotenv import load_dotenv
import shapely
from shapely.geometry import LineString, Point
from shapely.geometry.polygon import orient
import logging

# -------------------------------------------------
# Logging config
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
# -------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

API_KEY = os.getenv('GOOGLE_API_KEY')
FETCH_ROADS_URL = os.getenv("POLYGON_ROADS_API_URL")

if not API_KEY:
    raise ValueError("GOOGLE_API_KEY not found in .env file.")

# Config
PROXIMITY_TOLERANCE_METERS = 5       # Max distance to consider a point "touching" the route
BUFFER_METERS = 10                   # Size of the search box around the route for API fetching
EXCLUSION_TOLERANCE_METERS = 15      # Width of the route to identify "duplicate" main road segments

# Approximate conversion factor: 1 degree lat ~ 111,320 meters
DEG_PER_METER = 1 / 111320

# Async helper to decode polyline or coordinates
async def decode_polyline_or_coords(value):
    if isinstance(value, list):
        return [(p[1], p[0]) for p in value]  # always (lat, lng)
    
    if isinstance(value, str) and value.strip().startswith('['):
        raw = json.loads(value)
        return [(p[1], p[0]) for p in raw]

    return polyline.decode(value)

# Async helper to convert Google coordinates to Shapely (lon, lat) tuples
async def google_coords_to_shapely(google_coords_list):
    """Convert Google API coordinates to Shapely (lon, lat) tuples."""
    if not google_coords_list:
        return []
    return [(p['location']['longitude'], p['location']['latitude']) for p in google_coords_list]

# Fetch road data asynchronously
async def fetch_roads_from_api(polygon_geometry, api_key):
    """
    Fetches all road segments that fall within the provided polygon.
    Handles pagination (nextPageToken) to ensure all roads are retrieved.
    """
    polygon_geometry = orient(polygon_geometry, sign=1)

    polygon = [{'latitude': lat, 'longitude': lon} for lon, lat in polygon_geometry.exterior.coords]

    all_roads = []
    page_token = None

    headers = {
        'X-Goog-Api-Key': api_key,
        'Content-Type': 'application/json'
    }

    async with aiohttp.ClientSession() as session:
        while True:
            request_payload = {
                "geoAreaFilter": {
                    "polygon": {
                        "coordinates": polygon
                    }
                },
                "pageSize": 5000  # Requesting max page size as per reference
            }

            if page_token:
                request_payload["pageToken"] = page_token

            try:
                logging.info(f"Fetching roads... (Current count: {len(all_roads)})")
                async with session.post(FETCH_ROADS_URL, json=request_payload, headers=headers) as response:
                    if response.status != 200:
                        logging.error(f"API Error: {response.status} - {await response.text()}")
                        break

                    response_json = await response.json()
                    fetched_roads = response_json.get('roads', [])
                    all_roads.extend(fetched_roads)

                    page_token = response_json.get('nextPageToken')
                    if not page_token:
                        break

            except Exception as e:
                logging.error(f"Exception fetching roads: {e}")
                break

    return all_roads

# Main async function to find intersection points
async def find_intersection_points(encoded_polyline_str):
    # Decode polyline and convert to shapely coordinates
    decoded_coords = await decode_polyline_or_coords(encoded_polyline_str)
    shapely_coords = [(lon, lat) for lat, lon in decoded_coords]
    original_route_geom = LineString(shapely_coords)

    # Create a search buffer polygon
    search_polygon = shapely.buffer(original_route_geom, 0.001)

    # Fetch all roads within the search polygon
    fetched_roads_response = await fetch_roads_from_api(search_polygon, API_KEY)
    logging.info(f"Fetched {len(fetched_roads_response)} raw road segments.")

    # Create exclusion buffer for main route segments
    exclusion_radius_deg = EXCLUSION_TOLERANCE_METERS * DEG_PER_METER
    main_route_buffer = original_route_geom.buffer(exclusion_radius_deg)

    # Filter out main route segments and get candidate roads
    candidate_roads = []

    for road in fetched_roads_response:
        road_coords = await google_coords_to_shapely(road.get('coordinates', []))
        if not road_coords or len(road_coords) < 2:
            continue
            
        fetched_road_geom = LineString(road_coords)
        
        # Skip main roads that are within the exclusion buffer
        if main_route_buffer.covers(fetched_road_geom):
            continue
        
        # Otherwise, add the road to candidate roads
        candidate_roads.append(fetched_road_geom)

    # Find intersections (start/end points) of candidate roads
    proximity_deg = PROXIMITY_TOLERANCE_METERS * DEG_PER_METER
    final_intersection_points = []

    for road_geom in candidate_roads:
        start_pt = Point(road_geom.coords[0])
        end_pt = Point(road_geom.coords[-1])

        dist_start = original_route_geom.distance(start_pt)
        if dist_start < proximity_deg:
            final_intersection_points.append(start_pt)

        dist_end = original_route_geom.distance(end_pt)
        if dist_end < proximity_deg:
            final_intersection_points.append(end_pt)

    # Deduplicate points that are very close to each other
    unique_points = []
    dedupe_tolerance = PROXIMITY_TOLERANCE_METERS * DEG_PER_METER

    for pt in final_intersection_points:
        is_duplicate = False
        for existing in unique_points:
            if pt.distance(existing) < dedupe_tolerance:
                is_duplicate = True
                break
        if not is_duplicate:
            unique_points.append(pt)

    # Remove start and end points of the original route
    route_start_pt = Point(original_route_geom.coords[0])
    route_end_pt = Point(original_route_geom.coords[-1])
    filtered_points = []

    for pt in unique_points:
        dist_to_start = pt.distance(route_start_pt)
        dist_to_end = pt.distance(route_end_pt)

        if dist_to_start >= dedupe_tolerance and dist_to_end >= dedupe_tolerance:
            filtered_points.append(pt)

    logging.info(f"Found {len(filtered_points)} unique intersection points (excluding route start/end).")

    # Create GeoJSON output
    features = []
    for pt in filtered_points:
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [pt.x, pt.y] # Lon, Lat
            },
            "properties": {}
        })

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    return geojson
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


"""
Utility to calculate viewstate (center and zoom) from GeoJSON boundary.
"""
import json
import math
from typing import Dict, Any


def calculate_viewstate(geojson_str: str) -> Dict[str, Any]:
    """
    Calculate viewstate (center point and zoom level) from GeoJSON boundary.
    
    Args:
        geojson_str: JSON string of GeoJSON boundary (Polygon or MultiPolygon)
    
    Returns:
        Dictionary with 'center' (lat, lng) and 'zoom' (number)
    """
    try:
        geojson = json.loads(geojson_str)
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON string")
    
    # Extract coordinates from GeoJSON
    coords = []
    
    if geojson.get("type") == "FeatureCollection":
        if not geojson.get("features") or len(geojson["features"]) == 0:
            raise ValueError("FeatureCollection must contain at least one feature")
        geometry = geojson["features"][0].get("geometry", {})
    elif geojson.get("type") == "Feature":
        geometry = geojson.get("geometry", {})
    else:
        geometry = geojson
    
    geometry_type = geometry.get("type")
    
    if geometry_type == "Polygon":
        for ring in geometry.get("coordinates", []):
            for lon, lat in ring:
                coords.append((lat, lon))
    elif geometry_type == "MultiPolygon":
        for poly in geometry.get("coordinates", []):
            for ring in poly:
                for lon, lat in ring:
                    coords.append((lat, lon))
    else:
        raise ValueError(f"Unsupported geometry type: {geometry_type}")
    
    if not coords:
        raise ValueError("No coordinates found in GeoJSON")
    
    # Calculate bounding box
    lats = [lat for lat, _ in coords]
    lngs = [lng for _, lng in coords]
    
    min_lat = min(lats)
    max_lat = max(lats)
    min_lng = min(lngs)
    max_lng = max(lngs)
    
    # Calculate center point
    center_lat = (min_lat + max_lat) / 2
    center_lng = (min_lng + max_lng) / 2
    
    # Calculate zoom level based on bounding box size
    # Using a simple formula that works well for most cases
    lat_diff = max_lat - min_lat
    lng_diff = max_lng - min_lng
    max_diff = max(lat_diff, lng_diff)
    
    # Calculate zoom level (rough approximation)
    # This formula provides reasonable zoom levels for different bounding box sizes
    if max_diff > 0:
        # World view (very large area)
        if max_diff > 50:
            zoom = 3
        # Country/region view
        elif max_diff > 10:
            zoom = 5
        # State/province view
        elif max_diff > 5:
            zoom = 7
        # City view
        elif max_diff > 1:
            zoom = 9
        # District view
        elif max_diff > 0.5:
            zoom = 11
        # Neighborhood view
        elif max_diff > 0.1:
            zoom = 13
        # Street view
        else:
            zoom = 15
    else:
        zoom = 10  # Default zoom
    
    return {
        "center": {
            "lat": center_lat,
            "lng": center_lng
        },
        "zoom": zoom
    }


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
Spatial helper functions for road connectivity analysis
Uses Shapely for geometry operations
"""

import json
import math
from typing import Tuple, Dict, List, Optional
from shapely.geometry import Point, LineString
from shapely.ops import nearest_points

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points
    on the earth (specified in decimal degrees)
    Returns distance in meters
    """
    # Convert decimal degrees to radians
    lon1, lat1, lon2, lat2 = map(math.radians, [lon1, lat1, lon2, lat2])

    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    # Radius of earth in meters
    r = 6371000
    return c * r

def get_endpoints(coordinates: List[List[float]]) -> Tuple[Optional[List[float]], Optional[List[float]]]:
    """
    Extract start and end points from LineString coordinates
    Returns: (start_point, end_point) where each is [lng, lat]
    """
    if not coordinates or len(coordinates) < 2:
        return None, None
    
    start = coordinates[0]  # [lng, lat]
    end = coordinates[-1]   # [lng, lat]
    return start, end

def get_bbox(coordinates: List[List[float]]) -> Optional[Dict[str, float]]:
    """
    Calculate bounding box from coordinates
    Returns: {'min_lng', 'max_lng', 'min_lat', 'max_lat'}
    """
    if not coordinates:
        return None
    
    lngs = [c[0] for c in coordinates]
    lats = [c[1] for c in coordinates]
    
    return {
        'min_lng': min(lngs),
        'max_lng': max(lngs),
        'min_lat': min(lats),
        'max_lat': max(lats)
    }

def parse_polyline(polyline: str) -> List[List[float]]:
    """
    Parse polyline JSON string to coordinates array
    Handles both direct array and GeoJSON object formats
    """
    polyline_data = json.loads(polyline)
    
    # Handle GeoJSON object format
    if isinstance(polyline_data, dict) and 'coordinates' in polyline_data:
        return polyline_data['coordinates']
    # Handle direct array format
    elif isinstance(polyline_data, list):
        return polyline_data
    else:
        raise ValueError("Invalid polyline format")

def are_points_connected(
    p1: List[float], 
    p2: List[float], 
    tolerance_meters: float = 15.0
) -> Tuple[bool, float]:
    """
    Check if two points are within tolerance distance
    Args:
        p1: [lng, lat]
        p2: [lng, lat]
        tolerance_meters: maximum distance in meters
    Returns:
        (is_connected, distance_in_meters)
    """
    distance = haversine_distance(p1[1], p1[0], p2[1], p2[0])
    is_connected = distance <= tolerance_meters
    return is_connected, distance

def are_roads_connected(
    road1_coords: List[List[float]], 
    road2_coords: List[List[float]], 
    tolerance_meters: float = 15.0
) -> Dict:
    """
    Check if two roads are connected at their endpoints
    Returns: {
        'connected': bool,
        'connection_type': 'start-start' | 'start-end' | 'end-start' | 'end-end' | None,
        'distance': float,
        'connection_point': [lng, lat] or None
    }
    """
    start1, end1 = get_endpoints(road1_coords)
    start2, end2 = get_endpoints(road2_coords)
    
    if not all([start1, end1, start2, end2]):
        return {'connected': False, 'connection_type': None, 'distance': None, 'connection_point': None}
    
    # Check all possible endpoint combinations
    connections = [
        ('start-start', start1, start2),
        ('start-end', start1, end2),
        ('end-start', end1, start2),
        ('end-end', end1, end2)
    ]
    
    for conn_type, p1, p2 in connections:
        is_connected, distance = are_points_connected(p1, p2, tolerance_meters)
        if is_connected:
            return {
                'connected': True,
                'connection_type': conn_type,
                'distance': distance,
                'connection_point': p1  # Use first point as connection point
            }
    
    # Not connected - return closest distance
    min_distance = float('inf')
    for _, p1, p2 in connections:
        _, distance = are_points_connected(p1, p2, tolerance_meters * 10)  # Check up to 10x tolerance for gap info
        min_distance = min(min_distance, distance)
    
    return {
        'connected': False,
        'connection_type': None,
        'distance': min_distance,
        'connection_point': None
    }

def calculate_road_length(coordinates: List[List[float]]) -> float:
    """
    Calculate total length of a road in kilometers
    """
    if not coordinates or len(coordinates) < 2:
        return 0.0
    
    total_distance = 0.0
    for i in range(1, len(coordinates)):
        distance = haversine_distance(
            coordinates[i-1][1], coordinates[i-1][0],
            coordinates[i][1], coordinates[i][0]
        )
        total_distance += distance
    
    # Convert meters to kilometers
    return total_distance / 1000.0

def find_closest_road_from_point(
    point: List[float], 
    roads: List[Dict], 
    max_distance_meters: float = 100.0
) -> Optional[Dict]:
    """
    Find the closest road to a given point
    Args:
        point: [lng, lat]
        roads: List of road objects with 'id' and 'polyline'
        max_distance_meters: maximum search distance
    Returns:
        {'road_id': int, 'distance': float, 'closest_point': [lng, lat]} or None
    """
    point_geom = Point(point[0], point[1])
    closest_road = None
    min_distance = max_distance_meters
    
    for road in roads:
        try:
            coords = parse_polyline(road['polyline'])
            line = LineString(coords)
            
            # Find nearest point on line
            nearest_pt = nearest_points(point_geom, line)[1]
            distance = haversine_distance(
                point[1], point[0],
                nearest_pt.y, nearest_pt.x
            )
            
            if distance < min_distance:
                min_distance = distance
                closest_road = {
                    'road_id': road['id'],
                    'distance': distance,
                    'closest_point': [nearest_pt.x, nearest_pt.y]
                }
        except Exception as e:
            continue
    
    return closest_road

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


import logging
import json
import math
from typing import List
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from shapely.geometry import Polygon, shape
from server.db.database import query_db
import polyline


router = APIRouter()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("tiles_api")


# -----------------------------
# Utility Functions
# -----------------------------
def deg2num(lat_deg, lon_deg, zoom):
    """Convert lat/lon to tile coordinates."""
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    x = int((lon_deg + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (x, y)


def num2deg(xtile, ytile, zoom):
    """Convert tile coordinates to lat/lon bounds."""
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return (lat_deg, lon_deg)


# Arrow generation functions removed - now handled on client side


# -----------------------------
# Main Route
# -----------------------------
@router.get("/roads/{z}/{x}/{y}.geojson")
async def get_roads_tile(
    z: int,
    x: int,
    y: int,
    project_id: int = Query(..., description="Project ID")
):
    """
    Returns a GeoJSON tile of roads that intersect the tile bounds.
    Uses proper spatial intersection checking instead of center-point filtering.
    Arrow generation is handled on the client side.
    """
    try:
        logger.info(f"[TILE REQUEST] z={z}, x={x}, y={y}, project_id={project_id}")

        # Compute tile bounds
        lat_min, lon_min = num2deg(x, y + 1, z)
        lat_max, lon_max = num2deg(x + 1, y, z)

        # Create tile bounds polygon for spatial intersection check
        # Note: Shapely Polygon expects [lon, lat] coordinates
        tile_bounds_polygon = Polygon([
            [lon_min, lat_min],
            [lon_max, lat_min],
            [lon_max, lat_max],
            [lon_min, lat_max],
            [lon_min, lat_min]  # Close the polygon
        ])

        # First-pass filter: Use expanded bounding box to get candidate roads
        # This is a performance optimization - we'll do precise intersection check after
        # Expand by a small margin to ensure we don't miss roads near tile edges
        margin = 0.001  # ~100m at equator
        query = """
        SELECT id, polyline, length, is_enabled, center_lat, center_lng, name , priority
        FROM roads
        WHERE project_id = ?
          AND deleted_at IS NULL
          AND center_lat BETWEEN ? AND ?
          AND center_lng BETWEEN ? AND ?
          AND is_enabled = 1
        ORDER BY length DESC
        """

        rows = await query_db(
            query,
            (
                project_id,
                lat_min - margin,
                lat_max + margin,
                lon_min - margin,
                lon_max + margin,
            )
        )
        features = []

        for r in rows:
            try:
                geom = json.loads(r["polyline"])
                coords = geom.get("coordinates", [])
                if not coords or geom.get("type") != "LineString":
                    continue

                # Create Shapely LineString from road geometry
                road_linestring = shape(geom)

                # Check if road actually intersects the tile bounds
                if not tile_bounds_polygon.intersects(road_linestring):
                    continue

                # Road intersects tile - include it
                features.append({
                    "type": "Feature",
                    "geometry": geom,
                    "properties": {
                        "id": r["id"],
                        "length": r["length"],
                        "distance": r["length"],  # Add distance (same as length for roads)
                        "priority": r["priority"],
                        "is_enabled": r["is_enabled"],
                        "center_lat": r["center_lat"],
                        "center_lng": r["center_lng"],
                        "name": r["name"],
                        "stroke": "#6B7280" if r["is_enabled"] else "#D1D5DB",  # Gray for enabled, lighter for disabled
                        "stroke-opacity": 0.8 if r["is_enabled"] else 0.4,
                        "stroke-width": 2,
                        
                    }
                })

            except Exception as e:
                road_id = r["id"] if "id" in r.keys() else "Unknown"
                logger.warning(f"Skipping invalid road ID={road_id}: {e}")

        geojson = json.dumps({"type": "FeatureCollection", "features": features})

        logger.info(f"[TILE SUCCESS] Project {project_id} → {len(features)} features")

        return Response(
            content=geojson,
            media_type="application/json",
            headers={
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*"
            }
        )

    except Exception as e:
        logger.exception(f"[TILE ERROR] Failed to generate roads tile: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate roads tile")


@router.get("/routes/{z}/{x}/{y}.geojson")
async def get_routes_tile(
    z: int,
    x: int,
    y: int,
    project_id: int = Query(..., description="Project ID")
):
    """
    Returns a GeoJSON tile of routes that intersect the tile bounds.
    Uses proper spatial intersection checking instead of center-point filtering.
    """
    try:
        logger.info(f"[ROUTE TILE REQUEST] z={z}, x={x}, y={y}, project_id={project_id}")

        # Compute tile bounds
        lat_min, lon_min = num2deg(x, y + 1, z)
        lat_max, lon_max = num2deg(x + 1, y, z)

        # Create tile bounds polygon for spatial intersection check
        tile_bounds_polygon = Polygon([
            [lon_min, lat_min],
            [lon_max, lat_min],
            [lon_max, lat_max],
            [lon_min, lat_max],
            [lon_min, lat_min]
        ])

        # First-pass filter: Use bounding box to get candidate routes
        margin = 0.001  # ~100m at equator
        query = """
        SELECT uuid, route_name, encoded_polyline, sync_status, is_enabled,
               origin, destination, waypoints, length, start_lat, start_lng, end_lat, end_lng,
               tag, created_at, updated_at, project_id, route_type , current_duration_seconds, static_duration_seconds , traffic_status , latest_data_update_time , synced_at
        FROM routes
        WHERE project_id = ?
          AND deleted_at IS NULL
          AND encoded_polyline IS NOT NULL
          AND min_lat <= ?
          AND max_lat >= ?
          AND min_lng <= ?
          AND max_lng >= ? 
          AND parent_route_id IS NULL
        ORDER BY length DESC
        """

        rows = await query_db(
            query,
            (
                project_id,
                lat_max + margin,
                lat_min - margin,
                lon_max + margin,
                lon_min - margin,
            )
        )
        features = []

        for r in rows:
            try:
                # Parse encoded polyline
                polyline_str = r["encoded_polyline"]
                
                # Handle both JSON string and direct format
                if isinstance(polyline_str, str):
                    try:
                        polyline_data = json.loads(polyline_str)
                    except json.JSONDecodeError:
                        # If not JSON, decode as Google-encoded polyline
                        coords_decoded = polyline.decode(polyline_str)
                        polyline_data = {
                            "type": "LineString",
                            "coordinates": [[lng, lat] for lat, lng in coords_decoded]
                        }
                        # logger.info(f"Decoded Google polyline for route {r['uuid']}")
                else:
                    polyline_data = polyline_str

                # Extract coordinates based on format
                if isinstance(polyline_data, dict):
                    if 'coordinates' in polyline_data:
                        coords = polyline_data['coordinates']
                        geom_type = polyline_data.get('type', 'LineString')
                    else:
                        continue
                elif isinstance(polyline_data, list):
                    coords = polyline_data
                    geom_type = 'LineString'
                else:
                    continue

                if not coords or len(coords) < 2:
                    continue

                # Create geometry object
                geom = {
                    "type": geom_type,
                    "coordinates": coords
                }

                # Create Shapely LineString from route geometry
                route_linestring = shape(geom)

                # Check if route actually intersects the tile bounds
                if not tile_bounds_polygon.intersects(route_linestring):
                    continue

                # Route intersects tile - include it
                status = r["sync_status"] or "unsynced"
                is_enabled = r["is_enabled"]
                
                # Status-based colors (matching frontend logic)
                if status == "failed":
                    stroke = "#FF0000"  # Red
                    stroke_opacity = 1.0
                elif status == "unsynced":
                    stroke = "#FFB400"  # Orange
                    stroke_opacity = 1.0
                elif status == "synced":
                    stroke = "#00E676"  # Green
                    stroke_opacity = 1.0
                else:
                    stroke = "#2196F3"  # Blue (default)
                    stroke_opacity = 0.8

                # Calculate distance and duration if available
                # Note: distance is typically in km, duration might need calculation
                route_length = r["length"] if r["length"] is not None else 0  # length is in km
                distance = route_length
                duration = None  # Duration not stored directly, would need calculation
                
                features.append({
                    "type": "Feature",
                    "geometry": geom,
                    "properties": {
                        "id": r["uuid"],
                        "uuid": r["uuid"],
                        "name": r["route_name"] or f"Route {r['uuid']}",
                        "status": status,
                        "sync_status": status,  # Add sync_status explicitly
                        "is_enabled": is_enabled,
                        "length": route_length,
                        "distance": distance,  # Add distance (same as length)
                        "duration": duration,  # Duration (None if not available)
                        "tag": r["tag"] if r["tag"] is not None else None,
                        "created_at": r["created_at"],
                        "updated_at": r["updated_at"],
                        "project_id": r["project_id"],
                        "type": r["route_type"] if r["route_type"] is not None else None,
                        "stroke": stroke,
                        "stroke-opacity": stroke_opacity,
                        "stroke-width": 3,
                        "current_duration_seconds": r["current_duration_seconds"],
                        "static_duration_seconds": r["static_duration_seconds"],
                        "traffic_status": r["traffic_status"],
                        "latest_data_update_time": r["latest_data_update_time"],
                        "synced_at": r["synced_at"],
                        "origin": r["origin"],
                        "destination": r["destination"],
                        "waypoints": r["waypoints"],
                    }
                })

            except Exception as e:
                route_uuid = r["uuid"] if "uuid" in r.keys() else "Unknown"
                logger.warning(f"Skipping invalid route UUID={route_uuid}: {e}")

        geojson = json.dumps({"type": "FeatureCollection", "features": features})

        logger.info(f"[ROUTE TILE SUCCESS] Project {project_id} → {len(features)} features")

        return Response(
            content=geojson,
            media_type="application/json",
            headers={
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*"
            }
        )

    except Exception as e:
        logger.exception(f"[ROUTE TILE ERROR] Failed to generate routes tile: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate routes tile")
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
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from shapely.geometry import Polygon, shape
from server.db.common import query_db, SQL_TILES_CANDIDATE_ROADS, SQL_TILES_CANDIDATE_ROUTES
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
        rows = await query_db(
            SQL_TILES_CANDIDATE_ROADS,
            (
                project_id,
                lat_min - margin,
                lat_max + margin,
                lon_min - margin,
                lon_max + margin,
            )
        )
        logger.debug("[TILE REQUEST] candidate roads=%s", len(rows))
        features = []

        skipped = 0
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

        def _to_json_safe(v):
            if v is None:
                return None
            if isinstance(v, datetime):
                return v.isoformat()
            return v

        def _normalize_coords_to_geojson(
            coords: list,
            *,
            lon_min: float,
            lon_max: float,
            lat_min: float,
            lat_max: float,
        ) -> list:
            """
            Ensure coordinates are in GeoJSON order [lng, lat].
            We use the tile bbox to disambiguate [lat,lng] vs [lng,lat] when both
            values are within [-90, 90] (common for many regions).
            """
            if not coords:
                return coords

            # Compute bbox overlap for both interpretations:
            # - as_is: (x=a=lon, y=b=lat)
            # - swapped: (x=b=lon, y=a=lat)
            min_a = min_b = float("inf")
            max_a = max_b = float("-inf")
            for c in coords:
                if not (isinstance(c, (list, tuple)) and len(c) == 2):
                    continue
                try:
                    a = float(c[0])
                    b = float(c[1])
                except Exception:
                    continue
                min_a = min(min_a, a)
                max_a = max(max_a, a)
                min_b = min(min_b, b)
                max_b = max(max_b, b)

            if min_a == float("inf") or min_b == float("inf"):
                return coords

            # as_is bbox = [min_a,max_a]x[min_b,max_b]
            as_is_overlaps = not (
                max_a < lon_min or min_a > lon_max or max_b < lat_min or min_b > lat_max
            )
            # swapped bbox = [min_b,max_b]x[min_a,max_a]
            swapped_overlaps = not (
                max_b < lon_min or min_b > lon_max or max_a < lat_min or min_a > lat_max
            )

            if swapped_overlaps and not as_is_overlaps:
                return [[c[1], c[0]] for c in coords if isinstance(c, (list, tuple)) and len(c) == 2]
            return coords

        # Compute tile bounds
        lat_min, lon_min = num2deg(x, y + 1, z)
        lat_max, lon_max = num2deg(x + 1, y, z)

        tile_bounds_polygon = Polygon(
            [
                [lon_min, lat_min],
                [lon_max, lat_min],
                [lon_max, lat_max],
                [lon_min, lat_max],
                [lon_min, lat_min],
            ]
        )

        # First-pass filter: Use bounding box to get candidate routes
        margin = 0.001  # ~100m at equator
        rows = await query_db(
            SQL_TILES_CANDIDATE_ROUTES,
            (
                project_id,
                lat_max + margin,
                lat_min - margin,
                lon_max + margin,
                lon_min - margin,
            )
        )
        # `query_db` returns QueryRow adapters; avoid printing raw objects.
        logger.debug("[ROUTE TILE REQUEST] candidate rows=%s", len(rows))

        def _try_decode_google_polyline(s: str) -> list[list[float]] | None:
            # polyline.decode returns [(lat,lng), ...]
            for prec in (5, 6, 7):
                try:
                    pts = polyline.decode(s, precision=prec) if prec != 5 else polyline.decode(s)
                    if pts:
                        return [[float(lng), float(lat)] for (lat, lng) in pts]
                except Exception:
                    continue
            return None

        def _decode_geometry_from_encoded_polyline(raw) -> tuple[dict | None, str]:
            """
            Returns (geom, path) where path indicates how we decoded:
            - json-geojson
            - json-coords
            - google-polyline
            - unsupported
            """
            if raw is None:
                return None, "unsupported"
            if isinstance(raw, dict):
                if raw.get("type") and raw.get("coordinates"):
                    return {"type": raw.get("type"), "coordinates": raw.get("coordinates")}, "json-geojson"
                return None, "unsupported"
            if isinstance(raw, list):
                return {"type": "LineString", "coordinates": raw}, "json-coords"
            if isinstance(raw, str):
                s = raw.strip()
                if not s:
                    return None, "unsupported"
                try:
                    obj = json.loads(s)
                    if isinstance(obj, dict) and obj.get("coordinates"):
                        return {"type": obj.get("type", "LineString"), "coordinates": obj.get("coordinates")}, "json-geojson"
                    if isinstance(obj, list):
                        return {"type": "LineString", "coordinates": obj}, "json-coords"
                except Exception:
                    pass
                coords = _try_decode_google_polyline(s)
                if coords:
                    return {"type": "LineString", "coordinates": coords}, "google-polyline"
                return None, "unsupported"
            return None, "unsupported"

        features = []
        skipped = 0
        # Keep `skipped` for lightweight debugging in headers.

        for r in rows:
            try:
                raw = r["encoded_polyline"]
                geom, path = _decode_geometry_from_encoded_polyline(raw)
                if geom is None:
                    skipped += 1
                    continue

                coords = geom.get("coordinates")
                if not isinstance(coords, list) or len(coords) < 2:
                    skipped += 1
                    continue

                coords = _normalize_coords_to_geojson(
                    coords,
                    lon_min=lon_min,
                    lon_max=lon_max,
                    lat_min=lat_min,
                    lat_max=lat_max,
                )
                geom = {"type": "LineString", "coordinates": coords}

                try:
                    route_linestring = shape(geom)
                    intersects = tile_bounds_polygon.intersects(route_linestring)
                except Exception as ie:
                    intersects = False
                    skipped += 1
                    continue

                if not intersects:
                    skipped += 1
                    continue

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
                        "created_at": _to_json_safe(r["created_at"]),
                        "updated_at": _to_json_safe(r["updated_at"]),
                        "project_id": r["project_id"],
                        "type": r["route_type"] if r["route_type"] is not None else None,
                        "stroke": stroke,
                        "stroke-opacity": stroke_opacity,
                        "stroke-width": 3,
                        "current_duration_seconds": r["current_duration_seconds"],
                        "static_duration_seconds": r["static_duration_seconds"],
                        "traffic_status": r["traffic_status"],
                        "latest_data_update_time": _to_json_safe(r["latest_data_update_time"]),
                        "synced_at": _to_json_safe(r["synced_at"]),
                        "origin": r["origin"],
                        "destination": r["destination"],
                        "waypoints": r["waypoints"],
                    }
                })

            except Exception as e:
                skipped += 1
                route_uuid = r["uuid"] if "uuid" in r.keys() else "Unknown"
                logger.warning(
                    "Skipping invalid route UUID=%s: %s",
                    route_uuid,
                    e,
                )

        geojson = json.dumps({"type": "FeatureCollection", "features": features})

        return Response(
            content=geojson,
            media_type="application/json",
            headers={
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
            },
        )

    except Exception as e:
        logger.exception(f"[ROUTE TILE ERROR] Failed to generate routes tile: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate routes tile")
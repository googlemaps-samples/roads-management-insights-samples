import logging
from fastapi import HTTPException
from sqlalchemy import text
from datetime import datetime, timezone
import json
import uuid
from shapely.geometry import LineString, mapping
import polyline
from .create_engine import engine
from pyproj import Geod
from .compute_parent_sync_status import batch_update_parent_sync_statuses_sync
from .firebase_logger import log_route_creation
import threading

# Setup logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
ch = logging.StreamHandler()  # Logs to console
ch.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)

GEOD = Geod(ellps="WGS84")

def line_length_km(coords):
    total_m = 0
    for i in range(1, len(coords)):
        lat1, lon1 = coords[i-1]
        lat2, lon2 = coords[i]
        _, _, dist_m = GEOD.inv(lon1, lat1, lon2, lat2)
        total_m += dist_m
    return total_m / 1000.0

def compute_center(coords):
    line = LineString([(lng, lat) for lat, lng in coords])
    mid = line.interpolate(0.5, normalized=True)
    lng, lat = mid.x, mid.y
    return {"lat": lat, "lng": lng}

def compute_bbox(coords):
    lats = [p[0] for p in coords]
    lngs = [p[1] for p in coords]
    return min(lats), max(lats), min(lngs), max(lngs)

def interpolate_geodesic(p1, p2, fraction):
    lat1, lon1 = p1
    lat2, lon2 = p2
    lon, lat, _ = GEOD.fwd(lon1, lat1, GEOD.inv(lon1, lat1, lon2, lat2)[0], 
                           GEOD.inv(lon1, lat1, lon2, lat2)[2] * fraction)
    return (lat, lon)

def decode_polyline_or_coords(value):
    """
    Handles both Google encoded polylines (string)
    and raw coordinate arrays stored as JSON strings.
    """
    # If it's already a list, assume it's coordinates
    if isinstance(value, list):
        return value

    # If it's stored as a JSON list in string form
    if isinstance(value, str) and value.strip().startswith('['):
        try:
            coords = json.loads(value)
            coords = [(p[1], p[0]) for p in coords]
            if isinstance(coords, list) and len(coords) > 0 and isinstance(coords[0], (list, tuple)):
                return coords
        except Exception:
            pass  # Fall through to encoded polyline attempt

    # Otherwise treat it as a normal encoded polyline
    try:
        return polyline.decode(value)
    except Exception as e:
        raise ValueError(f"Unable to decode polyline or coordinate array: {e}")

def segment_polyline_by_distance(coords, distance_km):
    """
    Segments a polyline into pieces of approximately distance_km each.
    
    Args:
        coords: List of (lat, lng) tuples
        distance_km: Target length for each segment in kilometers
        
    Returns:
        List of segments, where each segment is a list of (lat, lng) tuples
    """
    if len(coords) < 2:
        return [coords] if coords else []
    
    segments = []
    current_segment = [coords[0]]
    accumulated = 0.0

    for i in range(1, len(coords)):
        p1 = coords[i-1]
        p2 = coords[i]

        # Calculate distance of this edge
        _, _, dist_m = GEOD.inv(p1[1], p1[0], p2[1], p2[0])
        edge_dist = dist_m / 1000.0

        # Track position along the current edge
        current_start = p1
        remaining_dist = edge_dist

        # Process this edge, potentially creating multiple segments from a single long edge
        while remaining_dist > 1e-9:  # Small epsilon to handle floating point
            space_in_segment = distance_km - accumulated
            
            if remaining_dist <= space_in_segment:
                # The rest of this edge fits in the current segment
                current_segment.append(p2)
                accumulated += remaining_dist
                remaining_dist = 0
                
                # If we've exactly reached the target distance, finalize segment
                if abs(accumulated - distance_km) < 1e-9:
                    segments.append(current_segment)
                    current_segment = [p2]
                    accumulated = 0.0
            else:
                # Need to cut - this edge extends beyond the current segment's capacity
                frac = space_in_segment / remaining_dist
                cut_point = interpolate_geodesic(current_start, p2, frac)

                current_segment.append(cut_point)
                segments.append(current_segment)

                # Start new segment from the cut point
                current_segment = [cut_point]
                accumulated = 0.0
                
                # Continue processing the remainder of this edge
                current_start = cut_point
                remaining_dist -= space_in_segment

    # Add the last segment if it has actual content
    if len(current_segment) > 1:
        segments.append(current_segment)

    return segments

def segment_routes_for_visualization(project_id, tag, distance_km):
    with engine.begin() as conn:
        query = text(""" 
            SELECT uuid, encoded_polyline 
            FROM routes 
            WHERE project_id = :project_id 
              AND deleted_at IS NULL 
              AND is_enabled = 1 
              AND tag = :tag
              AND length > :distance_km
              AND parent_route_id IS NULL;
        """)
        rows = conn.execute(query, {"project_id": project_id, "tag": tag, "distance_km": distance_km}).fetchall()

        query_update = text("""
            UPDATE routes
            SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE project_id = :project_id
            AND tag = :tag
            AND length > :distance_km;
        """)
        conn.execute(query_update, {"project_id": project_id, "tag": tag, "distance_km": distance_km})

    if len(rows) == 0:
        raise HTTPException(status_code=404, detail=f"No routes found to segment for tag {tag} with length greater than {distance_km} km.")

    logger.info(f"Found {len(rows)} routes to segment.")

    features = []

    for row in rows:
        route_uuid = row.uuid
        encoded_polyline = row.encoded_polyline
        coords = decode_polyline_or_coords(encoded_polyline)

        segments = segment_polyline_by_distance(coords, distance_km)

        for idx, seg in enumerate(segments):
            feature = {
                "type": "Feature",
                "properties": {
                    "parent_route_uuid": route_uuid,
                    "segment_index": idx,
                    "segment_encoded": polyline.encode(seg)
                },
                "geometry": mapping(LineString([(lng, lat) for lat, lng in seg]))
            }
            features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features
    }, len(rows)

def save_route_segments_from_geojson(project_id, tag, feature_collection, count):
    """
    Save segments from segmentation function to the database.
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    if feature_collection["type"] != "FeatureCollection":
        raise ValueError("Invalid FeatureCollection")

    parent_ids = {f["properties"]["parent_route_uuid"] for f in feature_collection["features"]}

    with engine.begin() as conn:
        # Fetch all parent route data
        parent_routes = {}
        for parent_uuid in parent_ids:
            parent_route = conn.execute(text(""" 
                SELECT project_id, route_name, origin, destination, waypoints, center, encoded_polyline, 
                       route_type, length, start_lat, start_lng, end_lat, end_lng, 
                       min_lat, max_lat, min_lng, max_lng, routes_status, original_route_geo_json, 
                       validation_status 
                FROM routes 
                WHERE uuid = :uuid
            """), {"uuid": parent_uuid}).fetchone()

            conn.execute(text(""" 
                Update routes set deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP where uuid = :uuid
            """), {"uuid": parent_uuid})

            if parent_route:
                parent_routes[parent_uuid] = parent_route
        
        parent_to_new_uuid = {}
        for parent_uuid, parent_route in parent_routes.items():
            new_route_uuid = str(uuid.uuid4())
            parent_to_new_uuid[parent_uuid] = new_route_uuid
            
            conn.execute(text(""" 
                INSERT INTO routes (
                    uuid, project_id, route_name, origin, destination, waypoints, center, 
                    encoded_polyline, route_type, length, parent_route_id, has_children, 
                    is_segmented, segmentation_type, segmentation_config, sync_status, is_enabled, 
                    created_at, updated_at, tag, start_lat, start_lng, end_lat, end_lng, 
                    min_lat, max_lat, min_lng, max_lng, routes_status, original_route_geo_json, 
                    validation_status
                )
                VALUES (
                    :new_uuid, :project_id, :route_name, :origin, :destination, :waypoints, :center,
                    :encoded_polyline, :route_type, :length, :parent_uuid, 1, 1, 'distance', :cfg,
                    'unsynced', 1, :created, :updated, :tag, :start_lat, :start_lng, :end_lat, :end_lng,
                    :min_lat, :max_lat, :min_lng, :max_lng, :routes_status, :original_route_geo_json,
                    :validation_status
                )
            """), {
                "new_uuid": new_route_uuid,
                "project_id": parent_route.project_id,
                "route_name": parent_route.route_name,
                "origin": parent_route.origin,
                "destination": parent_route.destination,
                "waypoints": parent_route.waypoints,
                "center": parent_route.center,
                "encoded_polyline": parent_route.encoded_polyline,
                "route_type": parent_route.route_type,
                "length": parent_route.length,
                "parent_uuid": None,  # Copied route is standalone, not a child
                "cfg": json.dumps({
                    "type": "distance",
                    "distanceKm": feature_collection["features"][0]["properties"]["segment_index"] + 1,
                    "cutPointsCount": 0
                }),
                "created": now,
                "updated": now,
                "tag": tag,
                "start_lat": parent_route.start_lat,
                "start_lng": parent_route.start_lng,
                "end_lat": parent_route.end_lat,
                "end_lng": parent_route.end_lng,
                "min_lat": parent_route.min_lat,
                "max_lat": parent_route.max_lat,
                "min_lng": parent_route.min_lng,
                "max_lng": parent_route.max_lng,
                "routes_status": parent_route.routes_status,
                "original_route_geo_json": parent_route.original_route_geo_json,
                "validation_status": parent_route.validation_status
            })
            
            # Log parent route copy creation to Firestore asynchronously (non-blocking)
            parent_metadata = {
                "project_id": parent_route.project_id,
                "route_name": parent_route.route_name,
                "route_type": parent_route.route_type or "drawn",
                "length": parent_route.length,
                "tag": tag,
                "distance": parent_route.length,
                "is_segmented": True,
                "segmentation_type": "distance",
            }
            # Schedule logging in background thread (fire and forget)
            def log_parent():
                log_route_creation(new_route_uuid, parent_metadata, None, False)
            threading.Thread(target=log_parent, daemon=True).start()

        for feature in feature_collection["features"]:

            original_parent_uuid = feature["properties"]["parent_route_uuid"]
            # Use the new copied route UUID as the parent for segments
            new_parent_uuid = parent_to_new_uuid.get(original_parent_uuid, original_parent_uuid)
            parent_route = parent_routes[original_parent_uuid]
            seg_encoded = feature["properties"]["segment_encoded"]
            coords = decode_polyline_or_coords(seg_encoded)

            # coords are in (lat, lng) format
            origin = {"lat": coords[0][0], "lng": coords[0][1]}
            destination = {"lat": coords[-1][0], "lng": coords[-1][1]}
            length_km = line_length_km(coords)

            center = compute_center(coords)

            # Generate proper route name like "ddd - Segment 1"
            route_name = f"{parent_route.route_name} - Segment {feature['properties']['segment_index'] + 1}"

            segment_uuid = str(uuid.uuid4())

            conn.execute(text(""" 
                INSERT INTO routes (uuid, project_id, route_name, origin, destination, center, encoded_polyline, route_type, length,
                    parent_route_id, has_children, is_segmented, sync_status, is_enabled, created_at, updated_at, tag, segment_order
                )
                VALUES (:uuid, :pid, :name,:origin, :destination, :center, :encoded, 'segment', :length,
                    :parent, 0, 0, 'unsynced', 1, :created, :updated, :tag, :segment_order)
            """), {
                "uuid": segment_uuid,
                "pid": project_id,
                "name": route_name,
                "origin": json.dumps(origin),
                "destination": json.dumps(destination),
                "center": json.dumps(center),
                "encoded": seg_encoded,
                "length": length_km,
                "parent": new_parent_uuid,
                "created": now,
                "updated": now,
                "tag": tag,
                "segment_order": feature["properties"]["segment_index"] + 1
            })
            
            # Log segment creation to Firestore asynchronously (non-blocking)
            segment_metadata = {
                "project_id": project_id,
                "route_name": route_name,
                "route_type": "segment",
                "length": length_km,
                "distance": length_km,
                "parent_route_id": new_parent_uuid,
                "segment_order": feature["properties"]["segment_index"] + 1,
                "segmentation_type": "distance",
                "tag": tag,
            }
            # Schedule logging in background thread (fire and forget)
            def log_segment():
                log_route_creation(segment_uuid, segment_metadata, None, False)
            threading.Thread(target=log_segment, daemon=True).start()
        
        # Step 3: Batch update all parent routes' sync statuses at once
        batch_update_parent_sync_statuses_sync(project_id, conn)

    logger.info(f"Saved {count} routes segments for tag {tag}.")
    raise HTTPException(status_code=200, detail=f"Saved {len(feature_collection['features'])} segmented routes from {count} routes successfully for tag {tag}.")
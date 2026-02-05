import uuid
import json
import math
from collections import defaultdict
import logging
from sqlalchemy import text
from .create_engine import engine
from geopy.distance import distance
from datetime import datetime
import polyline
from .firebase_logger import log_route_creation
import threading


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)


def decode_polyline_or_coords(value):
    if isinstance(value, list):
        return [(p[1], p[0]) for p in value]  # always (lat, lng)
    
    if isinstance(value, str) and value.strip().startswith('['):
        raw = json.loads(value)
        return [(p[1], p[0]) for p in raw]

    return polyline.decode(value)

def polyline_length_meters(polyline_str):
    pts = decode_polyline_or_coords(polyline_str)
    if len(pts) < 2:
        return 0.0
    
    return sum(distance(pts[i], pts[i+1]).meters for i in range(len(pts)-1))

def fetch_routes(project_id: int, tag: str):
    query = text("""
        SELECT uuid, route_name, length, encoded_polyline, start_lat, start_lng, end_lat, end_lng
        FROM routes
        WHERE project_id = :project_id
        AND tag = :tag
        AND is_enabled = 1
        AND parent_route_id IS NULL
    """)
    with engine.begin() as conn:
        rows = conn.execute(query, {"project_id": project_id, "tag": tag}).fetchall()
    return [dict(row._mapping) for row in rows]

def compute_angle(A, B):
    ax = A["end_lat"] - A["start_lat"]
    ay = A["end_lng"] - A["start_lng"]
    bx = B["end_lat"] - B["start_lat"]
    by = B["end_lng"] - B["start_lng"]
    dot = ax * bx + ay * by
    cross = ax * by - ay * bx
    angle_rad = math.atan2(abs(cross), dot)
    return round(math.degrees(angle_rad), 2)

def build_graphs(routes):
    start_index = defaultdict(list)
    for r in routes:
        start_index[(r["start_lat"], r["start_lng"])].append(r)

    forward_graph = defaultdict(list)
    reverse_graph = defaultdict(list)

    for A in routes:
        matches = start_index.get((A["end_lat"], A["end_lng"]), [])
        for B in matches:
            if B["end_lat"] == A["start_lat"] and B["end_lng"] == A["start_lng"]:
                continue
            angle = compute_angle(A, B)
            if angle >= 30:
                continue
            forward_graph[A["uuid"]].append({"route": B, "angle": angle})
            reverse_graph[B["uuid"]].append({"route": A, "angle": angle})

    return forward_graph, reverse_graph

def choose_best_next(options, parent=None):
    if not options:
        return None

    options.sort(key=lambda x: x["angle"])
    smallest_angle = options[0]["angle"]
    filtered = [opt for opt in options if opt["angle"] == smallest_angle]

    if len(filtered) == 1:
        return filtered[0]

    filtered.sort(key=lambda x: x["route"]["length"])
    smallest_len = filtered[0]["route"]["length"]
    filtered2 = [opt for opt in filtered if opt["route"]["length"] == smallest_len]

    if len(filtered2) == 1:
        return filtered2[0]

    if parent:
        def parent_angle(opt):
            return compute_angle(parent, opt["route"])
        filtered2.sort(key=lambda x: parent_angle(x))
        pa = parent_angle(filtered2[0])
        filtered3 = [o for o in filtered2 if parent_angle(o) == pa]
    else:
        filtered3 = filtered2

    filtered3.sort(key=lambda x: polyline_length_meters(x["route"]["encoded_polyline"]))
    return filtered3[0]

def build_stretches(routes, forward_graph, reverse_graph):
    route_map = {r["uuid"]: r for r in routes}
    used = set()
    stretches = []

    start_nodes = [r for r in routes if len(reverse_graph.get(r["uuid"], [])) == 0]

    for route in start_nodes:
        rid = route["uuid"]
        if rid in used:
            continue

        stretch = [rid]
        used.add(rid)
        parent = None
        current = rid

        while True:
            options = forward_graph.get(current, [])
            best = choose_best_next(options, parent=route_map[parent] if parent else None)
            if not best:
                break
            next_id = best["route"]["uuid"]
            if next_id in used:
                break
            stretch.append(next_id)
            used.add(next_id)
            parent = current
            current = next_id

        stretches.append(stretch)

    remaining_routes = [r for r in routes if r["uuid"] not in used]
    for route in remaining_routes:
        rid = route["uuid"]
        if rid in used:
            continue
        stretches.append([rid])
        used.add(rid)

    return stretches

def merge_routes_in_stretch(stretch, route_map):
    coordinates = []
    route_ids = []
    route_names = []
    waypoints = []
    total_length = 0

    for i, rid in enumerate(stretch):
        route = route_map[rid]
        coords = decode_polyline_or_coords(route["encoded_polyline"])

        if i == 0:
            start_lat, start_lng = route["start_lat"], route["start_lng"]
        end_lat, end_lng = route["end_lat"], route["end_lng"]

        # Merge polyline avoiding duplicate start
        if coordinates and coordinates[-1] == coords[0]:
            coordinates.extend(coords[1:])
        else:
            coordinates.extend(coords)

        # Add intersection as waypoint (for stretched routes only)
        if i > 0:
            waypoints.append([route["start_lat"], route["start_lng"]])

        route_ids.append(route["uuid"])
        route_names.append(route["route_name"])
        total_length += route["length"]

    # Limit waypoints to 25 by sampling evenly
    MAX_WAYPOINTS = 25
    if len(waypoints) > MAX_WAYPOINTS:       
        step = len(waypoints) / MAX_WAYPOINTS 
        sampled_waypoints = []
        for i in range(MAX_WAYPOINTS):
            idx = int(i * step)
            if idx < len(waypoints):
                sampled_waypoints.append(waypoints[idx])
        waypoints = sampled_waypoints
        

    return {
        "coordinates": coordinates,
        "route_ids": route_ids,
        "route_names": route_names,
        "waypoints": waypoints,
        "length": total_length,
        "start_lat": start_lat,
        "start_lng": start_lng,
        "end_lat": end_lat,
        "end_lng": end_lng,
    }

def insert_stretch_into_db(stretch, project_id, tag, route_map, i):
    data = merge_routes_in_stretch(stretch, route_map)

    stretch_uuid = str(uuid.uuid4())

    data_to_insert = {
        "uuid": stretch_uuid,
        "project_id": project_id,
        "route_name": f"stretch-{i}",
        "origin": json.dumps({"lat": data["start_lat"], "lng": data["start_lng"]}),
        "destination": json.dumps({"lat": data["end_lat"], "lng": data["end_lng"]}),
        "waypoints": json.dumps([[lng, lat] for (lat, lng) in data["waypoints"]]),
        "center": json.dumps({"lat": (data["start_lat"] + data["end_lat"]) / 2, 
                              "lng": (data["start_lng"] + data["end_lng"]) / 2}),
        "encoded_polyline": json.dumps([[lng, lat] for (lat, lng) in data["coordinates"]]),
        "length": data["length"],
        "tag": f"{tag}-stretched",
        "start_lat": data["start_lat"],
        "start_lng": data["start_lng"],
        "end_lat": data["end_lat"],
        "end_lng": data["end_lng"],
        "min_lat": min(data["start_lat"], data["end_lat"]),
        "max_lat": max(data["start_lat"], data["end_lat"]),
        "min_lng": min(data["start_lng"], data["end_lng"]),
        "max_lng": max(data["start_lng"], data["end_lng"]),
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    insert_query = """
    INSERT INTO routes 
    (uuid, project_id, route_name, origin, destination, waypoints, center, encoded_polyline, 
     route_type, length, sync_status, is_enabled, created_at, updated_at, 
     tag, start_lat, start_lng, end_lat, end_lng, min_lat, max_lat, min_lng, max_lng)
    VALUES
    (:uuid, :project_id, :route_name, :origin, :destination, :waypoints, :center, :encoded_polyline, 
     'stretch', :length, 'unsynced', 1, :created_at, :updated_at,
     :tag, :start_lat, :start_lng, :end_lat, :end_lng, :min_lat, :max_lat, :min_lng, :max_lng)
    """

    with engine.begin() as conn:
        conn.execute(text(insert_query), data_to_insert)
    
    # Log stretch route creation to Firestore asynchronously (non-blocking)
    stretch_metadata = {
        "project_id": project_id,
        "route_name": data_to_insert["route_name"],
        "route_type": "stretch",
        "length": data["length"],
        "distance": data["length"],
        "tag": f"{tag}-stretched",
    }
    # Schedule logging in background thread (fire and forget)
    def log_stretch():
        log_route_creation(stretch_uuid, stretch_metadata, None, False)
    threading.Thread(target=log_stretch, daemon=True).start()

# ------------------------------------------------------------
# MAIN
# ------------------------------------------------------------
def create_stretches(project_id: int, tag: str):
    routes = fetch_routes(project_id, tag)
    forward_graph, reverse_graph = build_graphs(routes)
    stretches = build_stretches(routes, forward_graph, reverse_graph)
    route_map = {r["uuid"]: r for r in routes}

    stretched_count = 0
    non_stretched_count = 0

    for i, stretch in enumerate(stretches, 1):
        insert_stretch_into_db(stretch, project_id, tag, route_map, i)
        if len(stretch) > 1:
            stretched_count += 1
        else:
            non_stretched_count += 1

    logger.info(f"Number of stretched routes inserted: {stretched_count}")
    logger.info(f"Number of non-stretched routes: {non_stretched_count}")

    return {
        "stretched_routes": stretched_count,
        "non_stretched_routes": non_stretched_count,
        "detail": f"Stretched {stretched_count} routes and {non_stretched_count} non-stretched routes successfully for tag {tag}."
    }
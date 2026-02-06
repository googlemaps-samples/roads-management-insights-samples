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
SQL-based road connectivity functions
Uses pure SQL queries with road_spatial_index for fast, accurate connectivity checks
"""

import logging
from typing import List, Dict, Optional, Tuple
from server.db.database import query_db

logger = logging.getLogger(__name__)

# Tolerance in degrees (0.0001 degrees ≈ 11 meters at equator)
# This can be adjusted based on requirements
COORDINATE_TOLERANCE_DEGREES = 0.00005  # ~16.5 meters


async def _detect_bidirectional_pairs_at_endpoint(
    road_ids: List[int],
    project_id: int,
    tolerance_degrees: float
) -> List[List[int]]:
    """
    Detect bidirectional road pairs among a list of roads.
    Two roads are a bidirectional pair if they share the same endpoints (reversed).
    
    Returns: List of groups, where each group is a list of road IDs that form a bidirectional set
             Single roads are returned as single-element lists
    """
    if not road_ids:
        return []
    
    if len(road_ids) == 1:
        return [[road_ids[0]]]
    
    # Fetch endpoint data for all roads
    placeholders = ','.join('?' * len(road_ids))
    query = f"""
        SELECT id as road_id, start_lat, start_lng, end_lat, end_lng
        FROM roads
        WHERE id IN ({placeholders}) AND project_id = ?
    """
    
    rows = await query_db(query, tuple(road_ids) + (project_id,))
    
    if not rows:
        return [[rid] for rid in road_ids]
    
    # Build endpoint map
    endpoints = {}
    for row in rows:
        endpoints[row['road_id']] = {
            'start': (row['start_lat'], row['start_lng']),
            'end': (row['end_lat'], row['end_lng'])
        }
    
    # Group roads that are bidirectional pairs
    groups = []
    processed = set()
    
    for road_id in road_ids:
        if road_id in processed or road_id not in endpoints:
            continue
        
        group = [road_id]
        processed.add(road_id)
        road_ep = endpoints[road_id]
        
        # Find roads that are reversed versions (start/end swapped)
        for other_id in road_ids:
            if other_id == road_id or other_id in processed or other_id not in endpoints:
                continue
            
            other_ep = endpoints[other_id]
            
            # Check if endpoints are swapped (bidirectional)
            start_matches_end = (
                abs(road_ep['start'][0] - other_ep['end'][0]) < tolerance_degrees and
                abs(road_ep['start'][1] - other_ep['end'][1]) < tolerance_degrees
            )
            end_matches_start = (
                abs(road_ep['end'][0] - other_ep['start'][0]) < tolerance_degrees and
                abs(road_ep['end'][1] - other_ep['start'][1]) < tolerance_degrees
            )
            
            if start_matches_end and end_matches_start:
                group.append(other_id)
                processed.add(other_id)
        
        groups.append(group)
    
    # Add any roads that weren't in the endpoint data
    for road_id in road_ids:
        if road_id not in processed:
            groups.append([road_id])
            processed.add(road_id)
    
    return groups


async def get_road_connections_sql(
    road_id: int,
    project_id: int,
    tolerance_degrees: float = COORDINATE_TOLERANCE_DEGREES,
    priorities: Optional[List[str]] = None
) -> Dict:
    """
    Get all roads connected to the specified road's endpoints using pure SQL
    
    Returns:
        {
            'road_id': int,
            'connections': {
                'start': [{'road_id': int, 'connection_point': str, 'distance_meters': float}],
                'end': [{'road_id': int, 'connection_point': str, 'distance_meters': float}]
            },
            'is_intersection': bool,
            'total_connections': int
        }
    """
    logger.info(f"[SQL CONNECTIONS] Finding connections for road {road_id}")
    
    # 1. Prepare Dynamic SQL Clause and Parameters for Priorities
    priority_clause = ""
    priority_params = []

    if priorities:
        # Create string like "?, ?, ?" based on list length
        placeholders = ','.join('?' * len(priorities))
        priority_clause = f"AND r.priority IN ({placeholders})"
        priority_params = priorities

    # Query to find all connected roads
    query = f"""
    WITH target_road AS (
        SELECT 
            id as road_id,
            start_lat, start_lng, 
            end_lat, end_lng,
            project_id
        FROM roads 
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL
    ),
    start_connections AS (
        SELECT 
            r.id as road_id,
            'start' as target_endpoint,
            CASE 
                WHEN ABS(r.start_lat - tr.start_lat) < ? AND ABS(r.start_lng - tr.start_lng) < ? THEN 'start'
                WHEN ABS(r.end_lat - tr.start_lat) < ? AND ABS(r.end_lng - tr.start_lng) < ? THEN 'end'
            END as connection_point,
            CASE 
                WHEN ABS(r.start_lat - tr.start_lat) < ? AND ABS(r.start_lng - tr.start_lng) < ? 
                    THEN ABS(r.start_lat - tr.start_lat) + ABS(r.start_lng - tr.start_lng)
                WHEN ABS(r.end_lat - tr.start_lat) < ? AND ABS(r.end_lng - tr.start_lng) < ? 
                    THEN ABS(r.end_lat - tr.start_lat) + ABS(r.end_lng - tr.start_lng)
            END as distance_approx
        FROM roads r
        CROSS JOIN target_road tr
        WHERE r.project_id = tr.project_id 
        AND r.id != tr.road_id
        AND r.deleted_at IS NULL
        {priority_clause}  -- <--- INJECTED HERE
        AND (
            (ABS(r.start_lat - tr.start_lat) < ? AND ABS(r.start_lng - tr.start_lng) < ?) OR
            (ABS(r.end_lat - tr.start_lat) < ? AND ABS(r.end_lng - tr.start_lng) < ?)
        )
    ),
    end_connections AS (
        SELECT 
            r.id as road_id,
            'end' as target_endpoint,
            CASE 
                WHEN ABS(r.start_lat - tr.end_lat) < ? AND ABS(r.start_lng - tr.end_lng) < ? THEN 'start'
                WHEN ABS(r.end_lat - tr.end_lat) < ? AND ABS(r.end_lng - tr.end_lng) < ? THEN 'end'
            END as connection_point,
            CASE 
                WHEN ABS(r.start_lat - tr.end_lat) < ? AND ABS(r.start_lng - tr.end_lng) < ? 
                    THEN ABS(r.start_lat - tr.end_lat) + ABS(r.start_lng - tr.end_lng)
                WHEN ABS(r.end_lat - tr.end_lat) < ? AND ABS(r.end_lng - tr.end_lng) < ? 
                    THEN ABS(r.end_lat - tr.end_lat) + ABS(r.end_lng - tr.end_lng)
            END as distance_approx
        FROM roads r
        CROSS JOIN target_road tr
        WHERE r.project_id = tr.project_id 
        AND r.id != tr.road_id
        AND r.deleted_at IS NULL
        {priority_clause}  -- <--- INJECTED HERE
        AND (
            (ABS(r.start_lat - tr.end_lat) < ? AND ABS(r.start_lng - tr.end_lng) < ?) OR
            (ABS(r.end_lat - tr.end_lat) < ? AND ABS(r.end_lng - tr.end_lng) < ?)
        )
    ),
    all_connections AS (
        SELECT * FROM start_connections
        UNION ALL
        SELECT * FROM end_connections
    )
    SELECT 
        road_id,
        target_endpoint,
        connection_point,
        distance_approx
    FROM all_connections
    ORDER BY target_endpoint, road_id;
    """
    
    # 3. Construct Parameter Tuple carefully (Order matters!)
    # Note: We create a list first, then convert to tuple
    params_list = [road_id, project_id]
    
    # START connection params
    params_list.extend([tolerance_degrees] * 8) # Tolerances for CASE/SELECT
    params_list.extend(priority_params)          # Priority params for WHERE IN (...)
    params_list.extend([tolerance_degrees] * 4)  # Tolerances for WHERE
    
    # END connection params
    params_list.extend([tolerance_degrees] * 8) # Tolerances for CASE/SELECT
    params_list.extend(priority_params)          # Priority params for WHERE IN (...)
    params_list.extend([tolerance_degrees] * 4)  # Tolerances for WHERE

    rows = await query_db(query, tuple(params_list))
    
    # Group connections by endpoint
    start_connections = []
    end_connections = []
    
    for row in rows:
        conn = {
            'road_id': row['road_id'],
            'connection_point': row['connection_point'],
            'distance_meters': row['distance_approx'] * 111000  # Rough conversion to meters
        }
        
        if row['target_endpoint'] == 'start':
            start_connections.append(conn)
        else:
            end_connections.append(conn)
    
    # Deduplicate connections (same road_id + connection_point)
    start_unique = {}
    for conn in start_connections:
        key = (conn['road_id'], conn['connection_point'])
        if key not in start_unique:
            start_unique[key] = conn
    
    end_unique = {}
    for conn in end_connections:
        key = (conn['road_id'], conn['connection_point'])
        if key not in end_unique:
            end_unique[key] = conn
    
    start_connections = list(start_unique.values())
    end_connections = list(end_unique.values())
    
    # Count unique roads at each endpoint, accounting for bidirectional pairs
    start_road_ids = set(c['road_id'] for c in start_connections)
    end_road_ids = set(c['road_id'] for c in end_connections)
    
    # Find roads that appear at BOTH endpoints (bidirectional pair with target road)
    bidirectional_with_target = start_road_ids & end_road_ids
    
    # Group bidirectional pairs at each endpoint
    # Two roads are likely a bidirectional pair if they connect at the same point
    start_pairs = await _detect_bidirectional_pairs_at_endpoint(
        list(start_road_ids), project_id, tolerance_degrees
    )
    end_pairs = await _detect_bidirectional_pairs_at_endpoint(
        list(end_road_ids), project_id, tolerance_degrees
    )
    
    # Count unique roads (each bidirectional pair counts as 1)
    unique_start_roads = len(start_pairs)
    unique_end_roads = len(end_pairs)
    
    # Exclude roads that connect to target at both endpoints
    if bidirectional_with_target:
        unique_start_roads = max(0, unique_start_roads - len([p for p in start_pairs if any(r in bidirectional_with_target for r in p)]))
        unique_end_roads = max(0, unique_end_roads - len([p for p in end_pairs if any(r in bidirectional_with_target for r in p)]))
    
    total_unique_roads = unique_start_roads + unique_end_roads
    
    # Log bidirectional pair detection
    if start_pairs and len(start_pairs) < len(start_road_ids):
        logger.info(f"[SQL CONNECTIONS] START bidirectional pairs detected: {start_pairs}")
    if end_pairs and len(end_pairs) < len(end_road_ids):
        logger.info(f"[SQL CONNECTIONS] END bidirectional pairs detected: {end_pairs}")
    if bidirectional_with_target:
        logger.info(f"[SQL CONNECTIONS] Roads connecting at both endpoints (excluded): {list(bidirectional_with_target)}")
    
    # Beautiful connection graph logging
    logger.info(f"[SQL CONNECTIONS] ═══════════════════════════════════════════════════════")
    logger.info(f"[SQL CONNECTIONS] Connection Graph for Road {road_id}")
    logger.info(f"[SQL CONNECTIONS] ═══════════════════════════════════════════════════════")
    
    # Log START connections
    if start_connections:
        logger.info(f"[SQL CONNECTIONS] ")
        logger.info(f"[SQL CONNECTIONS] START Endpoint ({unique_start_roads} unique roads):")
        for i, conn in enumerate(start_connections, 1):
            logger.info(f"[SQL CONNECTIONS]   {i}. Road {conn['road_id']} → connects at its {conn['connection_point'].upper()} ({conn['distance_meters']:.2f}m)")
    else:
        logger.info(f"[SQL CONNECTIONS] ")
        logger.info(f"[SQL CONNECTIONS] START Endpoint: (dead end - no connections)")
    
    # Visual representation
    logger.info(f"[SQL CONNECTIONS] ")
    logger.info(f"[SQL CONNECTIONS]          {'┌─ ' + ', '.join([str(c['road_id']) for c in start_connections]) if start_connections else '(dead end)'}")
    logger.info(f"[SQL CONNECTIONS]          │")
    logger.info(f"[SQL CONNECTIONS]      ════╪════  Road {road_id}  ════╪════")
    logger.info(f"[SQL CONNECTIONS]          │")
    logger.info(f"[SQL CONNECTIONS]          {'└─ ' + ', '.join([str(c['road_id']) for c in end_connections]) if end_connections else '(dead end)'}")
    logger.info(f"[SQL CONNECTIONS] ")
    
    # Log END connections
    if end_connections:
        logger.info(f"[SQL CONNECTIONS] END Endpoint ({unique_end_roads} unique roads):")
        for i, conn in enumerate(end_connections, 1):
            logger.info(f"[SQL CONNECTIONS]   {i}. Road {conn['road_id']} → connects at its {conn['connection_point'].upper()} ({conn['distance_meters']:.2f}m)")
    else:
        logger.info(f"[SQL CONNECTIONS] END Endpoint: (dead end - no connections)")
    
    logger.info(f"[SQL CONNECTIONS] ")
    logger.info(f"[SQL CONNECTIONS] Summary:")
    logger.info(f"[SQL CONNECTIONS]   • Total connections: {len(start_connections) + len(end_connections)}")
    logger.info(f"[SQL CONNECTIONS]   • Raw unique roads: {len(start_road_ids)} (start) + {len(end_road_ids)} (end) = {len(start_road_ids) + len(end_road_ids)}")
    if bidirectional_with_target or (len(start_pairs) < len(start_road_ids)) or (len(end_pairs) < len(end_road_ids)):
        if bidirectional_with_target:
            logger.info(f"[SQL CONNECTIONS]   • Roads at both endpoints (excluded): {list(bidirectional_with_target)}")
        logger.info(f"[SQL CONNECTIONS]   • Actual unique roads: {unique_start_roads} (start) + {unique_end_roads} (end) = {total_unique_roads}")
    else:
        logger.info(f"[SQL CONNECTIONS]   • Unique roads: {total_unique_roads}")
    logger.info(f"[SQL CONNECTIONS]   • Is intersection: {'YES' if total_unique_roads > 2 else 'NO'}")
    logger.info(f"[SQL CONNECTIONS]   • Tolerance: {tolerance_degrees:.6f}° (~{tolerance_degrees * 111000:.1f}m)")
    logger.info(f"[SQL CONNECTIONS] ═══════════════════════════════════════════════════════")
    
    return {
        'road_id': road_id,
        'connections': {
            'start': start_connections,
            'end': end_connections
        },
        'is_intersection': total_unique_roads > 2,
        'total_connections': len(start_connections) + len(end_connections)
    }


async def stretch_road_sql(
    road_id: int,
    project_id: int,
    max_depth: int = 100,
    tolerance_degrees: float = COORDINATE_TOLERANCE_DEGREES,
    priorities: Optional[List[str]] = None
) -> Dict:
    """
    Stretch from a road in both directions until hitting intersections or dead ends
    Uses recursive SQL query for efficient traversal
    
    Returns:
        {
            'roads': List[Dict],  # Road objects in order
            'total_length': float,
            'total_count': int,
            'endpoints': Dict,
            'is_intersection_start': bool,
            'is_intersection_end': bool
        }
    """
    logger.info(f"[SQL STRETCH] Starting stretch from road {road_id}")
    
    # First, get connections for the starting road to determine direction
    connections = await get_road_connections_sql(
        road_id, project_id, tolerance_degrees, priorities
    )
    
    start_connections = connections['connections']['start']
    end_connections = connections['connections']['end']
    
    start_road_ids = set(c['road_id'] for c in start_connections)
    end_road_ids = set(c['road_id'] for c in end_connections)
    
    # Detect bidirectional pairs at each endpoint
    start_pairs = await _detect_bidirectional_pairs_at_endpoint(
        list(start_road_ids), project_id, tolerance_degrees
    )
    end_pairs = await _detect_bidirectional_pairs_at_endpoint(
        list(end_road_ids), project_id, tolerance_degrees
    )
    
    # Exclude roads that appear at both endpoints (bidirectional with target)
    bidirectional_with_target = start_road_ids & end_road_ids
    
    unique_start_count = len(start_pairs)
    unique_end_count = len(end_pairs)
    
    if bidirectional_with_target:
        unique_start_count = max(0, unique_start_count - len([p for p in start_pairs if any(r in bidirectional_with_target for r in p)]))
        unique_end_count = max(0, unique_end_count - len([p for p in end_pairs if any(r in bidirectional_with_target for r in p)]))
        logger.info(f"[SQL STRETCH] Excluding roads at both endpoints: {list(bidirectional_with_target)}")
    
    if len(start_pairs) < len(start_road_ids):
        logger.info(f"[SQL STRETCH] START bidirectional pairs: {start_pairs}")
    if len(end_pairs) < len(end_road_ids):
        logger.info(f"[SQL STRETCH] END bidirectional pairs: {end_pairs}")
    
    logger.info(f"[SQL STRETCH] Start: {unique_start_count} unique roads, End: {unique_end_count} unique roads")
    
    unique_start_roads = start_road_ids - bidirectional_with_target
    unique_end_roads = end_road_ids - bidirectional_with_target
    
    # Build connection maps for direction selection
    start_connections_map = {c['road_id']: c for c in start_connections}
    end_connections_map = {c['road_id']: c for c in end_connections}
    
    # Build the road chain by traversing in both directions
    road_sequence = []
    visited = {road_id}
    
    # Traverse backward from start
    if unique_start_count == 1 and len(unique_start_roads) > 0:
        logger.info(f"[SQL STRETCH] Traversing backward from start...")
        
        # Pick the road whose END connects to our START (so we can continue from its START)
        next_road_id = None
        for rid in unique_start_roads:
            conn_info = start_connections_map.get(rid)
            if conn_info and conn_info['connection_point'] == 'end':
                next_road_id = rid
                logger.info(f"[SQL STRETCH] Selected road {rid} (its END connects to our START)")
                break
        
        # Fallback: if no road has correct orientation, pick first one
        if next_road_id is None:
            next_road_id = list(unique_start_roads)[0]
            conn_info = start_connections_map.get(next_road_id)
            logger.warning(f"[SQL STRETCH] No correctly oriented road found, using {next_road_id} (connects at {conn_info['connection_point'] if conn_info else 'unknown'})")
        
        backward = await _traverse_linear_sql(
            next_road_id, 
            project_id, 
            visited.copy(), 
            max_depth,
            tolerance_degrees,
            priorities
        )
        road_sequence = list(reversed(backward))
        visited.update(backward)
        logger.info(f"[SQL STRETCH] Backward found {len(backward)} roads")
    else:
        logger.info(f"[SQL STRETCH] Start is intersection or dead end, skipping backward")
    
    # Add starting road
    road_sequence.append(road_id)
    
    # Traverse forward from end
    if unique_end_count == 1 and len(unique_end_roads) > 0:
        logger.info(f"[SQL STRETCH] Traversing forward from end...")
        
        # Pick the road whose START connects to our END (so we can continue from its END)
        next_road_id = None
        for rid in unique_end_roads:
            conn_info = end_connections_map.get(rid)
            if conn_info and conn_info['connection_point'] == 'start':
                next_road_id = rid
                logger.info(f"[SQL STRETCH] Selected road {rid} (its START connects to our END)")
                break
        
        # Fallback: if no road has correct orientation, pick first one
        if next_road_id is None:
            next_road_id = list(unique_end_roads)[0]
            conn_info = end_connections_map.get(next_road_id)
            logger.warning(f"[SQL STRETCH] No correctly oriented road found, using {next_road_id} (connects at {conn_info['connection_point'] if conn_info else 'unknown'})")
        
        forward = await _traverse_linear_sql(
            next_road_id, 
            project_id, 
            visited.copy(), 
            max_depth,
            tolerance_degrees,
            priorities
        )
        road_sequence.extend(forward)
        logger.info(f"[SQL STRETCH] Forward found {len(forward)} roads")
    else:
        logger.info(f"[SQL STRETCH] End is intersection or dead end, skipping forward")
    
    logger.info(f"[SQL STRETCH] Final sequence: {road_sequence}")
    
    # Fetch full road data
    if not road_sequence:
        road_sequence = [road_id]
    
    placeholders = ','.join('?' * len(road_sequence))
    roads_query = f"""
        SELECT id, polyline, length, name, is_enabled
        FROM roads
        WHERE id IN ({placeholders}) AND project_id = ?
    """
    
    roads_rows = await query_db(roads_query, tuple(road_sequence) + (project_id,))
    
    # Order roads according to sequence
    roads_dict = {row['id']: dict(row) for row in roads_rows}
    ordered_roads = [roads_dict[rid] for rid in road_sequence if rid in roads_dict]
    
    # Calculate total length
    total_length = sum(r.get('length', 0) or 0 for r in ordered_roads)
    
    # Get endpoints from spatial index
    first_road_id = road_sequence[0]
    last_road_id = road_sequence[-1]
    
    endpoints_query = """
        SELECT id as road_id, start_lat, start_lng, end_lat, end_lng
        FROM roads
        WHERE id IN (?, ?) AND deleted_at IS NULL
    """
    endpoints_rows = await query_db(endpoints_query, (first_road_id, last_road_id))
    endpoints_dict = {row['road_id']: row for row in endpoints_rows}
    
    first_endpoint = endpoints_dict.get(first_road_id)
    last_endpoint = endpoints_dict.get(last_road_id)
    
    endpoints = {
        'start': {
            'lat': first_endpoint['start_lat'] if first_endpoint else None,
            'lng': first_endpoint['start_lng'] if first_endpoint else None,
            'type': 'intersection' if len(unique_start_roads) > 1 else 'dead_end'
        },
        'end': {
            'lat': last_endpoint['end_lat'] if last_endpoint else None,
            'lng': last_endpoint['end_lng'] if last_endpoint else None,
            'type': 'intersection' if len(unique_end_roads) > 1 else 'dead_end'
        }
    }
    
    return {
        'roads': ordered_roads,
        'total_length': total_length,
        'total_count': len(ordered_roads),
        'endpoints': endpoints,
        'is_intersection_start': len(unique_start_roads) > 1,
        'is_intersection_end': len(unique_end_roads) > 1
    }


async def _traverse_linear_sql(
    current_road_id: int,
    project_id: int,
    visited: set,
    max_depth: int,
    tolerance_degrees: float,
    priorities: Optional[List[str]] = None
) -> List[int]:
    """
    Helper function to traverse linearly from a road until hitting intersection or dead end
    """
    sequence = []
    
    while len(sequence) < max_depth:
        if current_road_id in visited:
            break
        
        visited.add(current_road_id)
        sequence.append(current_road_id)
        
        # Pass priorities to connection check
        connections = await get_road_connections_sql(
            current_road_id, project_id, tolerance_degrees, priorities
        )
        
        # Find unvisited connections
        all_connected_roads = (
            [c['road_id'] for c in connections['connections']['start']] +
            [c['road_id'] for c in connections['connections']['end']]
        )
        
        unvisited = [rid for rid in all_connected_roads if rid not in visited]
        unique_unvisited = list(set(unvisited))
        
        logger.debug(f"[SQL TRAVERSE] Road {current_road_id}: {len(unique_unvisited)} unvisited connections")
        
        # Stop if intersection (>1 unvisited) or dead end (0 unvisited)
        if len(unique_unvisited) != 1:
            logger.debug(f"[SQL TRAVERSE] Stopping at road {current_road_id}: {'intersection' if len(unique_unvisited) > 1 else 'dead end'}")
            break
        
        # Continue to next road
        current_road_id = unique_unvisited[0]
    
    return sequence


async def validate_continuity_sql(
    road_ids: List[int],
    project_id: int,
    tolerance_degrees: float = COORDINATE_TOLERANCE_DEGREES
) -> Dict:
    """
    Validate if selected roads form a continuous path using SQL
    
    Returns:
        {
            'is_continuous': bool,
            'gaps': List[Dict],
            'suggested_order': List[int],
            'total_length': float,
            'connected_count': int,
            'total_count': int
        }
    """
    logger.info(f"[SQL VALIDATE] Validating {len(road_ids)} roads")
    
    if not road_ids:
        return {
            'is_continuous': False,
            'gaps': [],
            'suggested_order': [],
            'total_length': 0,
            'connected_count': 0,
            'total_count': 0
        }
    
    if len(road_ids) == 1:
        return {
            'is_continuous': True,
            'gaps': [],
            'suggested_order': road_ids,
            'total_length': 0,
            'connected_count': 1,
            'total_count': 1
        }
    
    # Build connectivity map
    connectivity_map = {}
    for road_id in road_ids:
        connections = await get_road_connections_sql(road_id, project_id, tolerance_degrees)
        
        # Get connected roads that are in our selection
        connected_in_selection = []
        for conn in connections['connections']['start'] + connections['connections']['end']:
            if conn['road_id'] in road_ids:
                connected_in_selection.append(conn['road_id'])
        
        connectivity_map[road_id] = list(set(connected_in_selection))
        logger.debug(f"[SQL VALIDATE] Road {road_id} connects to: {connectivity_map[road_id]}")
    
    # Check if all roads are connected (graph connectivity)
    visited = set()
    queue = [road_ids[0]]
    visited.add(road_ids[0])
    
    while queue:
        current = queue.pop(0)
        for neighbor in connectivity_map.get(current, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    
    is_continuous = len(visited) == len(road_ids)
    
    logger.info(f"[SQL VALIDATE] Connected: {len(visited)}/{len(road_ids)}, Continuous: {is_continuous}")
    
    # Find suggested order if continuous
    suggested_order = []
    if is_continuous:
        # Find a linear path through the roads
        suggested_order = _find_path_order(road_ids[0], connectivity_map, set())
    
    return {
        'is_continuous': is_continuous,
        'gaps': [],  # TODO: Implement gap detection
        'suggested_order': suggested_order,
        'total_length': 0,  # TODO: Calculate from roads
        'connected_count': len(visited),
        'total_count': len(road_ids)
    }


def _find_path_order(start_road: int, connectivity_map: Dict, visited: set) -> List[int]:
    """
    Find a linear path through connected roads using DFS
    """
    if start_road in visited:
        return []
    
    visited.add(start_road)
    path = [start_road]
    
    # Try to extend the path
    for neighbor in connectivity_map.get(start_road, []):
        if neighbor not in visited:
            extension = _find_path_order(neighbor, connectivity_map, visited)
            path.extend(extension)
            break  # Only follow one path (linear)
    
    return path


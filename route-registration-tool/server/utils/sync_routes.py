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
import polyline
from typing import Optional
from datetime import datetime, timezone
import asyncio
import os
import time
from time import monotonic
from dotenv import load_dotenv
from fastapi import HTTPException
from sqlalchemy import bindparam, text
from geopy.distance import geodesic
from shapely import wkt
from shapely.geometry import LineString, MultiLineString, GeometryCollection
from google.cloud import bigquery

from .create_engine import async_engine
from .google_roads_api import (
    list_routes,
    delete_route,
    create_route,
    get_route,
    _ac,
    get_cached_oauth_token,
    invalidate_token_cache,
    RouteCreationError,
    RouteListError,
)
from .sync_single_route import sync_single_route_to_bigquery
from .compute_parent_sync_status import batch_update_parent_sync_statuses
from .feature_flags import ENABLE_MULTITENANT
from .firebase_logger import log_route_creation
from .route_operations_logger import (
    log_sync_start,
    log_sync_complete,
    log_creation_attempt,
    log_creation_success,
    log_creation_failed,
    log_creation_final_failure,
    log_deletion_attempt,
    log_deletion_success,
    log_deletion_failed,
    log_validation_update,
    log_batch_summary,
)

# --- Config ---
STATUS_MAPPING = {
    "STATE_INVALID": "STATUS_INVALID",
    "STATE_RUNNING": "STATUS_RUNNING",
    "STATE_VALIDATING": "STATUS_VALIDATING",
    "STATE_DELETING": "STATUS_DELETING",
    "STATE_UNSPECIFIED": "STATUS_UNSPECIFIED",
}

# --- Rate Limiting Config ---
MAX_QPS = 50  # Maximum queries per second (configurable)
MIN_INTERVAL = 1 / MAX_QPS  # Minimum interval between requests
request_lock = asyncio.Lock()
last_request_time = 0.0


async def throttle_qps():
    """Rate limiting function to ensure requests don't exceed MAX_QPS."""
    global last_request_time
    async with request_lock:
        now = monotonic()
        elapsed = now - last_request_time
        wait_time = max(0, MIN_INTERVAL - elapsed)
        if wait_time > 0:
            await asyncio.sleep(wait_time)
        last_request_time = monotonic()


# --- Logger Setup ---
logger = logging.getLogger("sync_logic")
logger.setLevel(logging.INFO)
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
ch.setFormatter(formatter)
logger.addHandler(ch)

load_dotenv(
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
)
VIEW_MODE = os.getenv("VIEW_MODE") or "false"

async def run_bq_query(client, sql):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: list(client.query(sql).result()))


# -------------------------
# DATABASE HELPERS
# -------------------------
async def get_project_uuid(db_project_id: int) -> Optional[str]:
    """Return project_uuid for the given project id, or None if not found."""
    try:
        async with async_engine.begin() as conn:
            result = await conn.execute(
                text("SELECT project_uuid FROM projects WHERE id = :id AND deleted_at IS NULL"),
                {"id": db_project_id},
            )
            row = result.fetchone()
            return row[0] if row and row[0] else None
    except Exception as e:
        logger.error(f"Error fetching project_uuid for project {db_project_id}: {e}")
        return None


async def bulk_update_deleted_routes(project_uuid: str, uuids):
    logger.info(f"Bulk updating deleted routes for project_uuid {project_uuid}.")
    if not uuids:
        return
    try:
        async with async_engine.begin() as conn:
            # Logic: Delete from DB once confirmed deleted from API
            query = text(
                "DELETE FROM routes WHERE project_uuid = :project_uuid AND uuid IN :uuids"
            ).bindparams(bindparam("uuids", expanding=True))
            await conn.execute(query, {"project_uuid": project_uuid, "uuids": uuids})
        logger.info(
            f"Deleted {len(uuids)} routes from DB after API deletion for project_uuid {project_uuid}."
        )
    except Exception as e:
        logger.error(f"Error deleting routes from DB: {e}")


async def update_routes_project_uuid_unsynced(
    db_project_id: int, current_project_uuid: str, uuids: list[str]
) -> int:
    """
    Updates given routes (by project_id and uuid list) to current project_uuid
    and marks them unsynced so they get re-created on the API.
    Returns the number of routes updated.
    """
    if not uuids:
        return 0
    try:
        async with async_engine.begin() as conn:
            query = text("""
                UPDATE routes
                SET project_uuid = :current_project_uuid,
                    sync_status = 'unsynced',
                    synced_at = NULL,
                    routes_status = NULL,
                    validation_status = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE project_id = :db_project_id
                  AND deleted_at IS NULL
                  AND uuid IN :uuids
            """).bindparams(bindparam("uuids", expanding=True))
            result = await conn.execute(
                query,
                {
                    "current_project_uuid": current_project_uuid,
                    "db_project_id": db_project_id,
                    "uuids": uuids,
                },
            )
            count = result.rowcount
        if count and count > 0:
            logger.info(
                f"Updated {count} route(s) to current project_uuid and marked unsynced for project {db_project_id}."
            )
        return count or 0
    except Exception as e:
        logger.error(f"Error updating routes project_uuid: {e}")
        return 0


async def bulk_update_synced_routes(route_states):
    logger.info("Bulk updating synced routes.")
    if not route_states:
        return
    try:
        async with async_engine.begin() as conn:
            for uuid, state in route_states.items():
                query = text("""
                    UPDATE routes
                    SET sync_status='validating', synced_at=CURRENT_TIMESTAMP, routes_status=:state
                    WHERE uuid = :uuid
                """)
                await conn.execute(query, {"state": state, "uuid": uuid})

        logger.info(f"Updated status for {len(route_states)} routes to validating.")
    except Exception as e:
        logger.error(f"Error updating synced status: {e}")


async def bulk_update_routes_status_from_api(
    db_project_id: int,
    updates: list[dict],
):
    """
    Updates routes table with (routes_status, sync_status, validation_status) from API.
    Used when we skip creation because the route already exists in API with running/failed status.
    updates: list of {"uuid", "route_name", "r_status", "s_status", "v_status"}
    """
    if not updates:
        return
    try:
        async with async_engine.begin() as conn:
            db_updates = [
                {"uuid": u["uuid"], "r_status": u["r_status"], "s_status": u["s_status"], "v_status": u.get("v_status")}
                for u in updates
            ]
            query = text("""
                UPDATE routes
                SET routes_status = :r_status,
                    sync_status = :s_status,
                    validation_status = :v_status,
                    updated_at = CURRENT_TIMESTAMP,
                    synced_at = CURRENT_TIMESTAMP
                WHERE uuid = :uuid
            """)
            await conn.execute(query, db_updates)
        for u in updates:
            log_validation_update(
                db_project_id,
                uuid=u["uuid"],
                route_name=u.get("route_name"),
                old_status="unsynced",
                new_status=u["s_status"],
                routes_status=u["r_status"],
            )
        logger.info(f"Updated {len(updates)} routes (already running/failed in API, skipped creation).")
    except Exception as e:
        logger.error(f"Error updating routes status from API: {e}")


async def bulk_update_invalid_routes(invalid_routes: list[dict]):
    """
    Marks routes as 'invalid' in database when they fail with 400 INVALID_ARGUMENT errors.
    These routes will not be retried as the data itself is invalid.
    
    Args:
        invalid_routes: List of route dicts with 'uuid', 'error_code', 'error_message' keys
    """
    logger.info(f"Marking {len(invalid_routes)} routes as invalid in database.")
    if not invalid_routes:
        return
    
    try:
        async with async_engine.begin() as conn:
            for route in invalid_routes:
                uuid = route["uuid"]
                error_message = route.get("error_message", "Unknown error")
                error_code = route.get("error_code", 400)
                
                # Update route to invalid status with error details
                query = text("""
                    UPDATE routes
                    SET sync_status = 'invalid',
                        routes_status = 'STATUS_INVALID',
                        validation_status = :error_message,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE uuid = :uuid
                """)
                await conn.execute(query, {
                    "uuid": uuid,
                    "error_message": f"Creation failed ({error_code}): {error_message}",
                })
        
        logger.info(f"Marked {len(invalid_routes)} routes as invalid.")
    except Exception as e:
        logger.error(f"Error marking routes as invalid: {e}")


async def fetch_single_route(project_uuid: str, uuid):
    logger.info(f"Fetching single route {uuid} for project_uuid {project_uuid}.")
    try:
        async with async_engine.begin() as conn:
            query = text("""SELECT uuid, route_name, origin, destination, waypoints, sync_status, length, tag, route_type
            FROM routes WHERE uuid = :uuid AND project_uuid = :project_uuid AND is_enabled = 1 AND has_children = 0
            AND deleted_at IS NULL
            """)
            result = await conn.execute(
                query, {"uuid": uuid, "project_uuid": project_uuid}
            )
            return result.fetchall()
    except Exception as e:
        logger.error(f"Error fetching single route: {e}")
        raise HTTPException(
            status_code=500, detail="Database error fetching single route."
        )


async def fetch_all_project_routes(project_uuid: str, tag: Optional[str] = None) -> list[dict]:
    """
    Fetches ALL routes for a project (by project_uuid) from database in a single query.
    Returns list of dicts with: uuid, route_name, origin, destination, waypoints,
    length, tag, route_type, sync_status, deleted_at
    """
    logger.info(f"Fetching all routes for project_uuid {project_uuid}.")
    try:
        query_str = """
            SELECT uuid, route_name, origin, destination, waypoints, length, tag,
                   route_type, sync_status, deleted_at, project_uuid
            FROM routes
            WHERE is_enabled = 1 AND has_children = 0 AND project_uuid = :project_uuid
        """
        if tag:
            query_str += " AND tag = :tag"
        
        async with async_engine.begin() as conn:
            query = text(query_str)
            params: dict = {"project_uuid": project_uuid}
            if tag:
                params["tag"] = tag
            result = await conn.execute(query, params)
            rows = result.fetchall()
            return [dict(row._mapping) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching all project routes: {e}")
        return []


async def fetch_all_project_routes_by_project_id(
    db_project_id: int, tag: Optional[str] = None
) -> list[dict]:
    """
    Fetches ALL routes for a project by project_id (includes routes with any project_uuid).
    Same columns as fetch_all_project_routes. Used during sync to check each DB route
    against the API (missing or wrong project_uuid → re-create).
    """
    logger.info(f"Fetching all routes for project_id {db_project_id}.")
    try:
        query_str = """
            SELECT uuid, route_name, origin, destination, waypoints, length, tag,
                   route_type, sync_status, deleted_at, project_uuid
            FROM routes
            WHERE is_enabled = 1 AND has_children = 0 AND project_id = :project_id
        """
        if tag:
            query_str += " AND tag = :tag"
        async with async_engine.begin() as conn:
            query = text(query_str)
            params: dict = {"project_id": db_project_id}
            if tag:
                params["tag"] = tag
            result = await conn.execute(query, params)
            rows = result.fetchall()
            return [dict(row._mapping) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching all project routes by project_id: {e}")
        return []


def segregate_routes(all_routes: list[dict]) -> tuple[list, list, list, list, list]:
    """
    Segregates routes into 4 categories based on their status:
    - deleted_uuids: routes with deleted_at IS NOT NULL (and sync_status in synced/validating/invalid)
    - local_deleted_uuids: routes with deleted_at IS NOT NULL (and sync_status as unsynced)
    - validating_rows: sync_status = 'validating' (and not deleted)
    - unsynced_rows: sync_status = 'unsynced' or 'invalid' (and not deleted) — invalid are retried on sync
    - synced_invalid_rows: sync_status = 'synced' only (and not deleted)
    
    Returns: (deleted_uuids, local_deleted_uuids, validating_rows, unsynced_rows, synced_invalid_rows)
    """
    deleted_uuids = []
    local_deleted_uuids = []
    validating_rows = []
    unsynced_rows = []
    synced_invalid_rows = []
    
    for row in all_routes:
        # Check if route is marked for deletion (and was previously synced)
        if row.get("deleted_at") is not None:
            # Only include if it was synced/validating/invalid (needs API deletion)
            if row["sync_status"] in ("synced", "validating", "invalid"):
                deleted_uuids.append(row["uuid"])
            else:
                local_deleted_uuids.append(row["uuid"])
        elif row["sync_status"] == "validating":
            validating_rows.append(row)
        elif row["sync_status"] == "unsynced" or row["sync_status"] == "invalid":
            # Include invalid (failed) routes so they are retried on tag sync or sync all
            unsynced_rows.append(row)
        elif row["sync_status"] == "synced":
            synced_invalid_rows.append(row)
    
    return deleted_uuids, local_deleted_uuids, validating_rows, unsynced_rows, synced_invalid_rows


def build_api_route_map(routes_list: list[dict]) -> dict:
    """
    Builds a lookup map from API response.
    Returns: {uuid: (mapped_status, validation_error)}
    
    mapped_status will be one of: STATUS_RUNNING, STATUS_INVALID, STATUS_VALIDATING, etc.
    """
    api_route_map = {}
    for route in routes_list:
        try:
            r_uuid = route.get("name", "").split("/")[-1]
            raw_state = route.get("state", "UNKNOWN")
            mapped_status = STATUS_MAPPING.get(raw_state, raw_state)
            val_error = route.get("validationError", None)
            api_route_map[r_uuid] = (mapped_status, val_error)
        except Exception:
            continue
    return api_route_map


async def verify_synced_invalid_routes(synced_invalid_rows: list[dict], api_route_map: dict):
    """
    Verifies synced/invalid routes against API response.
    - If exists in API with different status: update DB to match API
    - If missing from API: reset to 'unsynced' with NULL fields
    
    Returns: count of updated routes
    """
    logger.info(f"Verifying {len(synced_invalid_rows)} synced/invalid routes against API.")
    
    if not synced_invalid_rows:
        return 0
    
    updates_changed = []    # Status changed, update to API status
    updates_missing = []    # Missing from API, reset to unsynced
    
    for row in synced_invalid_rows:
        db_uuid = row["uuid"]
        db_sync_status = row["sync_status"]
        
        if db_uuid in api_route_map:
            api_status, val_error = api_route_map[db_uuid]
            
            # Derive expected sync_status from API status
            if api_status == "STATUS_RUNNING":
                expected_sync = "synced"
            elif api_status == "STATUS_INVALID":
                expected_sync = "invalid"
            elif api_status == "STATUS_VALIDATING":
                expected_sync = "validating"
            else:
                # For other statuses, keep as is
                expected_sync = db_sync_status
            
            # Check if status differs
            if db_sync_status != expected_sync:
                updates_changed.append({
                    "uuid": db_uuid,
                    "r_status": api_status,
                    "s_status": expected_sync,
                    "v_status": val_error,
                })
        else:
            # Route missing from API. Do not reset routes already in terminal state
            # (synced/invalid) to avoid tag-sync listing quirks flipping them back to unsynced.
            if db_sync_status in ("synced", "invalid"):
                logger.debug(
                    f"Route {db_uuid} not in API list but has terminal status {db_sync_status}; "
                    "skipping reset to unsynced."
                )
                continue
            updates_missing.append({
                "uuid": db_uuid,
            })
    
    total_updated = 0
    
    # Apply status change updates
    if updates_changed:
        try:
            async with async_engine.begin() as conn:
                query = text("""
                    UPDATE routes 
                    SET routes_status = :r_status,
                        sync_status = :s_status,
                        validation_status = :v_status,
                        updated_at = CURRENT_TIMESTAMP,
                        synced_at = CURRENT_TIMESTAMP
                    WHERE uuid = :uuid
                """)
                await conn.execute(query, updates_changed)
                
                logger.info(
                    f"📝 Updated {len(updates_changed)} routes with changed API status."
                )
                
            total_updated += len(updates_changed)
        except Exception as e:
            logger.error(f"Error updating changed routes: {e}")
    
    # Apply missing route updates (reset to unsynced)
    if updates_missing:
        try:
            async with async_engine.begin() as conn:
                query = text("""
                    UPDATE routes 
                    SET routes_status = NULL,
                        sync_status = 'unsynced',
                        validation_status = NULL,
                        synced_at = NULL,
                        latest_data_update_time = NULL,
                        current_duration_seconds = NULL,
                        static_duration_seconds = NULL,
                        traffic_status = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE uuid = :uuid
                """)
                await conn.execute(query, updates_missing)
                
                logger.info(
                    f"⚠️ Reset {len(updates_missing)} routes to 'unsynced' (missing from API)."
                )
                
            total_updated += len(updates_missing)
        except Exception as e:
            logger.error(f"Error resetting missing routes: {e}")
    
    return total_updated


# -------------------------
# CORE LOGIC: SYNC (PUSH)
# -------------------------
async def process_deletions(db_project_id, project_number, deleted_uuids):
    """
    Deletes routes from API in parallel using async httpx with rate limiting,
    semaphore-based concurrency control, and shared connection pooling.
    Non-blocking for event loop - other API requests remain responsive.
    """
    if not deleted_uuids:
        return []

    successfully_deleted = []
    failed_deletions = []
    MAX_PARALLEL = 100  # Maximum concurrent deletion requests

    async def delete_wrapper(uuid, client, sem):
        """Wrapper function to handle rate limiting, semaphore, and deletion."""
        # Log deletion attempt
        log_deletion_attempt(db_project_id, uuid)
        
        try:
            # Apply rate limiting before each deletion request
            await throttle_qps()

            # Get fresh token (cached function handles expiration automatically)
            # This ensures token is refreshed if deletion process takes > 45 minutes
            current_token = await get_cached_oauth_token()

            # Acquire semaphore to limit concurrent requests
            async with sem:
                # Call async delete_route with shared client and cached token
                result = await delete_route(
                    project_number, uuid, client=client, token=current_token
                )
                return result, uuid, None
        except Exception as e:
            logger.error(f"Error deleting route {uuid}: {e}")
            return False, uuid, str(e)

    # Use shared async client with connection pooling
    async with _ac() as client:
        # Create semaphore to limit concurrent requests
        sem = asyncio.Semaphore(MAX_PARALLEL)

        # Submit all deletion tasks asynchronously - all tasks submitted immediately
        # Each task applies rate limiting, acquires semaphore, then deletes route
        tasks = [delete_wrapper(uuid, client, sem) for uuid in deleted_uuids]

        # Wait for all tasks to complete (non-blocking for event loop)
        # All 100 workers process tasks simultaneously, respecting rate limits
        # Other API requests can be processed concurrently while deletions run
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Error in deletion task: {result}")
            else:
                delete_result, uuid, error = result
                
                if delete_result is True:
                    successfully_deleted.append(uuid)
                    log_deletion_success(db_project_id, uuid)
                else:
                    failed_deletions.append(uuid)
                    log_deletion_failed(db_project_id, uuid, error=error)

    # Log batch summary
    log_batch_summary(
        db_project_id,
        operation="DELETION",
        total=len(deleted_uuids),
        successful=len(successfully_deleted),
        failed=len(failed_deletions)
    )

    return successfully_deleted


def prepare_payload_from_dict(route_dict):
    """
    Prepares payload for single route creation from dict format.
    Converts dict format (from fetch_unsynced_validating_routes) to payload format.
    """
    origin_lat = json.loads(route_dict["origin"])["lat"]
    origin_lng = json.loads(route_dict["origin"])["lng"]
    dest_lat = json.loads(route_dict["destination"])["lat"]
    dest_lng = json.loads(route_dict["destination"])["lng"]

    dynamic_route = {
        "origin": {"latitude": origin_lat, "longitude": origin_lng},
        "destination": {"latitude": dest_lat, "longitude": dest_lng},
    }

    if route_dict.get("waypoints"):
        wp_list = [
            {"latitude": wp[1], "longitude": wp[0]}
            for wp in json.loads(route_dict["waypoints"])
        ]
        if wp_list:
            dynamic_route["intermediates"] = wp_list

    route_attrs = {
        "length": str(route_dict.get("length", 0)),
        "tag": route_dict.get("tag") if route_dict.get("tag") else "Untagged",
        "route_type": route_dict.get("route_type", "Existing"),
        "created_by": "Roads Selection Tool"
    }
    if ENABLE_MULTITENANT and route_dict.get("project_uuid"):
        route_attrs["project_uuid"] = route_dict["project_uuid"]
    request_obj = {
        "displayName": route_dict["route_name"],
        "dynamicRoute": dynamic_route,
        "route_attributes": route_attrs
    }

    return request_obj


async def _run_creation_batch(db_project_id, project_number, routes_to_create, client, sem, attempt: int = 1, max_attempts: int = 5):
    """
    Helper function to run a single batch of route creations.
    Returns (successful_route_states, retry_routes, invalid_routes).
    
    Args:
        db_project_id: Database project ID for logging
        project_number: Google Cloud project number
        routes_to_create: List of route dicts to create
        client: Shared httpx.AsyncClient
        sem: asyncio.Semaphore for concurrency control
        attempt: Current attempt number (1-based)
        max_attempts: Maximum number of attempts
    
    Returns:
        tuple: (route_states dict {uuid: state}, list of retry routes, list of invalid routes)
        - route_states: Successfully created routes
        - retry_routes: Routes that failed with retryable errors (401, 5xx, etc.)
        - invalid_routes: Routes that failed with 400 INVALID_ARGUMENT (no retry)
    """
    route_states = {}
    retry_routes = []
    invalid_routes = []
    token_invalidated = False  # Track if we've already invalidated token this batch

    async def create_wrapper(route_dict):
        """Wrapper function to handle rate limiting, semaphore, and creation."""
        nonlocal token_invalidated
        uuid = route_dict["uuid"]
        route_name = route_dict.get("route_name")
        
        # Log creation attempt
        log_creation_attempt(db_project_id, uuid, route_name, attempt, max_attempts)
        
        try:
            # Apply rate limiting before each creation request
            await throttle_qps()

            # Get fresh token (cached function handles expiration automatically)
            current_token = await get_cached_oauth_token()

            # Prepare payload from dict format
            payload = prepare_payload_from_dict(route_dict)
            
            # Acquire semaphore to limit concurrent requests
            async with sem:
                result = await create_route(
                    project_number, uuid, payload, client=client, token=current_token
                )
                # Success - return result with no error
                return {
                    "status": "success",
                    "result": result,
                    "uuid": uuid,
                    "route_dict": route_dict,
                }
        except RouteCreationError as e:
            # Structured error from API - determine if retryable
            logger.error(
                f"RouteCreationError for route {uuid}: "
                f"status_code={e.status_code}, message={e.message}, retryable={e.is_retryable}"
            )
            
            # For 401 errors, invalidate token cache (only once per batch)
            if e.status_code == 401 and not token_invalidated:
                logger.warning(f"Got 401 for route {uuid} - invalidating token cache for next retry")
                await invalidate_token_cache()
                token_invalidated = True
            
            return {
                "status": "error",
                "uuid": uuid,
                "route_dict": route_dict,
                "error_code": e.status_code,
                "error_message": e.message,
                "is_retryable": e.is_retryable,
                "error_details": e.error_details,
            }
        except Exception as e:
            # Unexpected error - treat as retryable
            logger.error(f"Unexpected error creating route {uuid}: {e}")
            return {
                "status": "error",
                "uuid": uuid,
                "route_dict": route_dict,
                "error_code": 500,
                "error_message": str(e),
                "is_retryable": True,
                "error_details": {},
            }

    # Submit all creation tasks asynchronously
    tasks = [create_wrapper(route_dict) for route_dict in routes_to_create]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Process results - separate successes from failures
    for result in results:
        if isinstance(result, Exception):
            # Exception during task execution (shouldn't happen normally)
            logger.error(f"Exception in creation task: {result}")
            continue
        
        # Type narrowing: result is a dict after the isinstance check
        result_dict: dict = result
        uuid = result_dict["uuid"]
        route_dict = result_dict["route_dict"]
        route_name = route_dict.get("route_name")
        
        if result_dict["status"] == "success":
            # Success - extract state from response
            create_result = result_dict["result"]
            state = create_result.get("state", "UNKNOWN")
            route_states[uuid] = state
            log_creation_success(db_project_id, uuid, route_name, attempt, state)
        else:
            # Failure - categorize by error type
            error_code = result_dict["error_code"]
            error_message = result_dict["error_message"]
            is_retryable = result_dict["is_retryable"]

            if error_code == 409 or "already exists" in (error_message or "").lower():
                # 409 / already exists: route exists in API; fetch its status and update table
                try:
                    existing_route = await get_route(project_number, uuid)
                    if existing_route:
                        state = existing_route.get("state", "STATE_UNSPECIFIED")
                        route_states[uuid] = state
                        log_creation_success(
                            db_project_id, uuid, route_name, attempt, state,
                        )
                        logger.info(
                            f"Route {uuid} already existed in API; fetched state={state} and will update table."
                        )
                    else:
                        invalid_routes.append({
                            **route_dict,
                            "error_code": error_code,
                            "error_message": error_message,
                        })
                        log_creation_failed(
                            db_project_id, uuid, route_name, attempt,
                            f"Error {error_code}: {error_message} - get_route returned None - Will not retry"
                        )
                except Exception as e:
                    logger.warning(f"Failed to get existing route {uuid} after 409: {e}")
                    invalid_routes.append({
                        **route_dict,
                        "error_code": error_code,
                        "error_message": error_message,
                    })
                    log_creation_failed(
                        db_project_id, uuid, route_name, attempt,
                        f"Error {error_code}: {error_message} - get_route failed - Will not retry"
                    )
            elif error_code == 400:
                # 400 INVALID_ARGUMENT - mark as invalid, no retry
                invalid_routes.append({
                    **route_dict,
                    "error_code": error_code,
                    "error_message": error_message,
                })
                log_creation_failed(
                    db_project_id, uuid, route_name, attempt,
                    f"INVALID_ARGUMENT (400): {error_message} - Will not retry"
                )
                logger.warning(f"Route {uuid} marked invalid due to 400 error: {error_message}")
            elif is_retryable:
                # Retryable error (401, 5xx, etc.) - add to retry queue
                retry_routes.append(route_dict)
                log_creation_failed(
                    db_project_id, uuid, route_name, attempt,
                    f"Error {error_code}: {error_message} - Will retry"
                )
            else:
                # Non-retryable, non-400 error - treat as invalid
                invalid_routes.append({
                    **route_dict,
                    "error_code": error_code,
                    "error_message": error_message,
                })
                log_creation_failed(
                    db_project_id, uuid, route_name, attempt,
                    f"Error {error_code}: {error_message} - Will not retry"
                )

    # Log batch summary for this attempt
    log_batch_summary(
        db_project_id,
        operation="CREATION",
        total=len(routes_to_create),
        successful=len(route_states),
        failed=len(retry_routes) + len(invalid_routes),
        attempt=attempt,
        max_attempts=max_attempts
    )
    
    logger.info(
        f"Batch attempt {attempt}/{max_attempts} complete: "
        f"{len(route_states)} succeeded, {len(retry_routes)} to retry, {len(invalid_routes)} invalid (no retry)"
    )

    return route_states, retry_routes, invalid_routes


async def process_creations(db_project_id, project_number, unsynced_rows, existing_project_route_ids):
    """
    Creates routes from API in parallel using async httpx with rate limiting,
    semaphore-based concurrency control, and shared connection pooling.
    
    Implements retry mechanism: retries failed routes up to 5 times.
    - 400 INVALID_ARGUMENT errors are NOT retried - routes are marked as 'invalid'
    - 401 UNAUTHENTICATED errors trigger token refresh and retry
    - Other errors are retried up to MAX_RETRIES times
    
    Only successfully created routes have their database status updated.
    
    Non-blocking for event loop - other API requests remain responsive.
    """
    logger.info(f"Processing creations for project {project_number}.")
    if not unsynced_rows:
        return 0
    
    db_uuids = set(row["uuid"] for row in unsynced_rows)

    # COLLISION CHECK: If route is "unsynced" in DB but exists in project, delete from project first
    to_delete_collision = [
        uuid for uuid in db_uuids if uuid in existing_project_route_ids
    ]
    if to_delete_collision:
        logger.info(
            f"Found {len(to_delete_collision)} collision routes. Deleting from project before re-creating."
        )
        await process_deletions(db_project_id, project_number, to_delete_collision)

    MAX_PARALLEL = 100  # Maximum concurrent creation requests
    MAX_RETRIES = 5  # Maximum number of attempts
    
    # Accumulated results across all retry attempts
    accumulated_route_states = {}
    accumulated_invalid_routes = []
    
    # Start with all routes to create
    routes_pending = unsynced_rows.copy()

    # Use shared async client with connection pooling for all attempts
    async with _ac() as client:
        sem = asyncio.Semaphore(MAX_PARALLEL)
        
        for attempt in range(1, MAX_RETRIES + 1):
            if not routes_pending:
                break
            
            logger.info(
                f"Attempt {attempt}/{MAX_RETRIES}: Creating {len(routes_pending)} routes..."
            )
            
            # Run creation batch with attempt tracking for logging
            # Returns: (route_states, retry_routes, invalid_routes)
            batch_successes, batch_retry, batch_invalid = await _run_creation_batch(
                db_project_id, project_number, routes_pending, client, sem, attempt, MAX_RETRIES
            )
            
            # Accumulate successful route states
            accumulated_route_states.update(batch_successes)
            
            # Accumulate invalid routes (400 errors - no retry)
            accumulated_invalid_routes.extend(batch_invalid)
            
            # Log batch results
            logger.info(
                f"Attempt {attempt}/{MAX_RETRIES} complete: "
                f"{len(batch_successes)} succeeded, {len(batch_retry)} to retry, "
                f"{len(batch_invalid)} invalid (no retry)."
            )
            
            # Update pending routes for next attempt (only retryable failures)
            routes_pending = batch_retry
            
            # If no retryable failures, we're done
            if not routes_pending:
                logger.info("All retryable routes processed.")
                break
        
        # Log final failure count if any routes failed after all attempts
        if routes_pending:
            failed_uuids = [r["uuid"] for r in routes_pending]
            logger.warning(
                f"Failed to create {len(routes_pending)} routes after {MAX_RETRIES} attempts. "
                f"Failed UUIDs: {failed_uuids}"
            )
            # Log each final failure to route operations log
            for route_dict in routes_pending:
                log_creation_final_failure(
                    db_project_id,
                    route_dict["uuid"],
                    route_dict.get("route_name"),
                    MAX_RETRIES
                )

    # Update database with all successfully created routes (single DB update)
    if accumulated_route_states:
        # Filter to only routes that were in our original db_uuids set
        filtered_states = {
            uuid: state for uuid, state in accumulated_route_states.items()
            if uuid in db_uuids
        }
        if filtered_states:
            await bulk_update_synced_routes(filtered_states)
    
    # Update database with invalid routes (400 errors - mark as 'invalid')
    if accumulated_invalid_routes:
        # Filter to only routes that were in our original db_uuids set
        filtered_invalid = [
            route for route in accumulated_invalid_routes
            if route["uuid"] in db_uuids
        ]
        if filtered_invalid:
            await bulk_update_invalid_routes(filtered_invalid)
            logger.info(f"Marked {len(filtered_invalid)} routes as invalid in database.")

    return len(accumulated_route_states)


async def process_validating_routes_updates(db_project_id, validating_rows, api_route_map: dict):
    """
    Matches local validating routes with API response.
    Updates routes_status.
    If status is RUNNING (or INVALID), moves sync_status to 'synced'.
    
    Args:
        validating_rows: List of route dicts with sync_status='validating'
        api_route_map: Pre-built map from build_api_route_map() {uuid: (status, val_error)}
    """
    logger.info("Processing validating routes updates.")
    updates = []

    if not validating_rows or not api_route_map:
        return 0

    # Match validating routes with API data
    for row in validating_rows:
        db_uuid = row["uuid"]

        if db_uuid in api_route_map:
            new_route_status, val_error = api_route_map[db_uuid]
            new_sync_status = "validating"

            if new_route_status == "STATUS_RUNNING":
                new_sync_status = "synced"
            else:
                new_sync_status = new_route_status.replace("STATUS_", "").lower()

            updates.append(
                {
                    "uuid": db_uuid,
                    "r_status": new_route_status,
                    "s_status": new_sync_status,
                    "v_status": val_error,
                    "route_name": row.get("route_name"),  # Store for logging
                }
            )

    if updates:
        try:
            async with async_engine.begin() as conn:
                # Prepare updates without route_name for DB query
                db_updates = [
                    {"uuid": u["uuid"], "r_status": u["r_status"], "s_status": u["s_status"], "v_status": u["v_status"]}
                    for u in updates
                ]
                query = text("""
                    UPDATE routes 
                    SET routes_status = :r_status,
                        sync_status = :s_status,
                        validation_status = :v_status,
                        updated_at = CURRENT_TIMESTAMP,
                        synced_at = CURRENT_TIMESTAMP
                    WHERE uuid = :uuid
                """)
                await conn.execute(query, db_updates)

                # Log each validation update to route operations log
                for update in updates:
                    log_validation_update(
                        db_project_id,
                        uuid=update["uuid"],
                        route_name=update.get("route_name"),
                        old_status="validating",
                        new_status=update["s_status"],
                        routes_status=update["r_status"]
                    )

                # Log what we're updating for debugging
                logger.info(
                    f"📝 Updated {len(updates)} child routes. Statuses: {[(u['uuid'], u['s_status']) for u in updates]}"
                )

            logger.info(f"Updated {len(updates)} validating routes.")
        except Exception as e:
            logger.error(f"Error processing validating routes updates: {e}")
    
    # Log batch summary for validation updates
    log_batch_summary(
        db_project_id,
        operation="VALIDATION",
        total=len(validating_rows),
        successful=len(updates),
        failed=len(validating_rows) - len(updates)
    )
    
    return len(updates)


# -------------------------
# CORE LOGIC: FETCH (PULL)
# -------------------------
async def save_routes_to_db(routes_data, db_project_id, project_uuid: str, bq_update_map: dict = None):
    """Parses API response and inserts into DB (skipping existing). project_uuid identifies the owning project."""
    logger.info(f"Saving routes to database for project_uuid {project_uuid}.")
    if not routes_data:
        return {"inserted": 0, "skipped": 0}

    current_timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    # Optimization: Fetch existing UUIDs for this project (skip re-inserting same route in same project)
    try:
        async with async_engine.begin() as conn:
            result = await conn.execute(
                text("SELECT uuid FROM routes WHERE project_uuid = :project_uuid"),
                {"project_uuid": project_uuid},
            )
            existing = result.fetchall()
            existing_uuids = {row[0] for row in existing}
    except Exception as e:
        logger.error(f"DB Read Error: {e}")
        raise HTTPException(
            status_code=500, detail="Database error checking existing routes."
        )

    insert_values = []
    skipped = 0

    bq_update_map = bq_update_map or {}

    for route in routes_data:
        try:
            route_uuid = route.get("name").split("/")[-1]
            route_attributes = route.get("routeAttributes", {})
            tag = route_attributes.get("tag", "")
            if tag == "Untagged":
                tag = ""
            if tag == "N/A":
                tag = ""
            route_type = route_attributes.get("route_type", "N/A")
            if route_type == "N/A":
                route_type = "Existing"
            length = int(route.get("length", 0))
            if route_uuid in existing_uuids:
                skipped += 1
                continue

            # Skip routes not present in BigQuery - only insert routes that have BQ data
            if route_uuid not in bq_update_map:
                skipped += 1
                continue

            dynamic = route.get("dynamicRoute", {})
            origin = dynamic.get("origin")
            destination = dynamic.get("destination")
            if not origin or not destination:
                skipped += 1
                continue

            intermediates = dynamic.get("intermediates", [])
            coords = [
                (round(origin["longitude"], 8), round(origin["latitude"], 8)),
                *[
                    (round(pt["longitude"], 8), round(pt["latitude"], 8))
                    for pt in intermediates
                ],
                (round(destination["longitude"], 8), round(destination["latitude"], 8)),
            ]

            waypoints_coords = [
                [
                    (round(pt["longitude"], 8), round(pt["latitude"], 8))
                    for pt in intermediates
                ]
            ]

            lats = [c[1] for c in coords]
            lngs = [c[0] for c in coords]

            center_pt = {
                "lat": round(sum(lats) / len(lats), 8),
                "lng": round(sum(lngs) / len(lngs), 8),
            }
            waypoints = [[lng, lat] for (lng, lat) in waypoints_coords[1:-1]]
            poly = polyline.encode([(lat, lng) for lng, lat in coords], precision=5)

            if length != 0:
                route_length = length
            else:
                route_length = round(
                    sum(
                        geodesic(
                            (coords[i][1], coords[i][0]),
                            (coords[i + 1][1], coords[i + 1][0]),
                        ).km
                        for i in range(len(coords) - 1)
                    ),
                    2,
                )

            linestring_wkt = (
                "LINESTRING(" + ", ".join(f"{lng} {lat}" for lng, lat in coords) + ")"
            )
            route_state = STATUS_MAPPING.get(route.get("state", ""), "UNKNOWN")

            if route_state == "STATUS_INVALID":
                sync_status = "invalid"
            elif route_state == "STATUS_RUNNING":
                sync_status = "synced"
            elif route_state == "STATUS_VALIDATING":
                sync_status = "validating"
            else:
                sync_status = "unsynced"

            # bq_row is guaranteed to exist since we skip routes not in bq_update_map above
            bq_row = bq_update_map[route_uuid]
            encoded_polyline = bq_row.get("encoded_polyline") or poly  # Fallback to API polyline if BQ has null
            latest_data_update_time = bq_row.get("record_time") or current_timestamp
            current_duration_seconds = bq_row.get("curr_dur") or 0
            static_duration_seconds = bq_row.get("stat_dur") or 0
            traffic_status = bq_row.get("traffic") or "NORMAL"

            insert_values.append(
                {
                    "uuid": route_uuid,
                    "project_id": db_project_id,
                    "project_uuid": project_uuid,
                    "route_name": route.get("displayName", ""),
                    "origin": json.dumps({"lat": coords[0][1], "lng": coords[0][0]}),
                    "destination": json.dumps(
                        {"lat": coords[-1][1], "lng": coords[-1][0]}
                    ),
                    "waypoints": json.dumps(waypoints),
                    "center": json.dumps(center_pt),
                    "encoded_polyline": encoded_polyline,
                    "route_type": route_type,
                    "length": route_length,
                    "latest_data_update_time": latest_data_update_time,
                    "current_duration_seconds": current_duration_seconds,
                    "static_duration_seconds": static_duration_seconds,
                    "traffic_status": traffic_status,
                    "parent_route_id": None,
                    "has_children": 0,
                    "is_segmented": 0,
                    "sync_status": sync_status,
                    "is_enabled": 1,
                    "created_at": current_timestamp,
                    "updated_at": current_timestamp,
                    "synced_at": current_timestamp,
                    "start_lat": coords[0][1],
                    "start_lng": coords[0][0],
                    "end_lat": coords[-1][1],
                    "end_lng": coords[-1][0],
                    "min_lat": min(lats),
                    "max_lat": max(lats),
                    "min_lng": min(lngs),
                    "max_lng": max(lngs),
                    "routes_status": route_state,
                    "linestring": linestring_wkt,
                    "val_status": route.get("validationError"),
                    "tag": tag,
                }
            )
        except Exception as e:
            logger.warning(f"Skipping malformed route {route.get('name')}: {e}")
            skipped += 1

    if insert_values:
        try:
            async with async_engine.begin() as conn:
                query = text("""
                    INSERT INTO routes (
                        uuid, project_id, project_uuid, route_name,
                        origin, destination, waypoints, center,
                        encoded_polyline, route_type, length,
                        latest_data_update_time,
                        current_duration_seconds,
                        static_duration_seconds,
                        traffic_status,
                        parent_route_id, has_children, is_segmented,
                        sync_status, is_enabled,
                        created_at, updated_at, synced_at,
                        start_lat, start_lng, end_lat, end_lng,
                        min_lat, max_lat, min_lng, max_lng,
                        routes_status, original_route_geo_json,
                        validation_status, tag
                    )
                    VALUES (
                        :uuid, :project_id, :project_uuid, :route_name,
                        :origin, :destination, :waypoints, :center,
                        :encoded_polyline, :route_type, :length,
                        :latest_data_update_time,
                        :current_duration_seconds,
                        :static_duration_seconds,
                        :traffic_status,
                        :parent_route_id, :has_children, :is_segmented,
                        :sync_status, :is_enabled,
                        :created_at, :updated_at, :synced_at,
                        :start_lat, :start_lng, :end_lat, :end_lng,
                        :min_lat, :max_lat, :min_lng, :max_lng,
                        :routes_status, :linestring,
                        :val_status, :tag
                    )
                """)
                await conn.execute(query, insert_values)

            # Log each route creation to Firestore asynchronously (non-blocking)
            # Use threading to run logging in background without blocking
            import threading
            from server.utils.firebase_logger import log_route_creation

            def log_routes_background():
                """Background thread function to log routes without blocking"""
                for route_data in insert_values:
                    route_metadata = {
                        "project_id": route_data["project_id"],
                        "route_name": route_data["route_name"],
                        "route_type": route_data.get("route_type", "Existing"),
                        "tag": route_data.get("tag"),
                        "distance": route_data.get("length"),  # Distance in km
                        "sync_status": route_data.get("sync_status", "synced"),
                    }
                    log_route_creation(route_data["uuid"], route_metadata)

            # Start background thread for logging (fire and forget)
            logging_thread = threading.Thread(target=log_routes_background, daemon=True)
            logging_thread.start()

        except Exception as e:
            logger.error(f"Bulk insert failed: {e}")
            raise HTTPException(
                status_code=500, detail="Failed to insert fetched routes into DB."
            )

    return {"inserted": len(insert_values), "skipped": skipped}


# -------------------------
# CORE LOGIC: BIGQUERY (ENRICH)
# -------------------------
def extract_coords(geom):
    coords = []
    if isinstance(geom, LineString):
        coords.extend(list(geom.coords))
    elif isinstance(geom, MultiLineString):
        for line in geom.geoms:
            coords.extend(list(line.coords))
    elif isinstance(geom, GeometryCollection):
        for g in geom.geoms:
            coords.extend(extract_coords(g))
    return coords


async def perform_bq_sync(gcp_project_id, db_project_id, dataset_name: str):
    """
    Fetches historical data from BQ and updates SQLite.
    
    Raises:
        HTTPException: If BigQuery query fails (fail-fast behavior)
    """
    logger.info(
        f"Performing BQ sync for project {db_project_id} with dataset: {dataset_name}."
    )
    try:
        client = bigquery.Client(project=gcp_project_id)
        query = f"""
            WITH route_statuses AS (
                SELECT selected_route_id, status
                FROM `{gcp_project_id}.{dataset_name}.routes_status`
            ),
            latest_route_record AS (
                SELECT 
                    r.selected_route_id, 
                    r.display_name, 
                    r.route_geometry, 
                    r.record_time, 
                    r.duration_in_seconds, 
                    r.static_duration_in_seconds,
                    r.speed_reading_intervals -- Keep the array intact for now
                FROM `{gcp_project_id}.{dataset_name}.recent_roads_data` r
                JOIN route_statuses rs ON r.selected_route_id = rs.selected_route_id
                WHERE 
                    -- 1. Optimization: Range filter allows partition pruning
                    r.record_time >= TIMESTAMP(CURRENT_DATE("Asia/Kolkata"))
                    AND r.record_time < TIMESTAMP(DATE_ADD(CURRENT_DATE("Asia/Kolkata"), INTERVAL 1 DAY))
                -- 2. Optimization: Filter for latest record BEFORE unnesting/calculating geometry
                QUALIFY ROW_NUMBER() OVER (PARTITION BY r.selected_route_id ORDER BY r.record_time DESC) = 1
            )
            SELECT 
                rs.selected_route_id, 
                rs.status, 
                lrr.display_name, 
                lrr.route_geometry, 
                lrr.record_time, 
                -- 3. Optimization: Calculate Geometry once per route, not once per speed interval
                ST_LENGTH(lrr.route_geometry)/1000 AS route_length_km, 
                lrr.duration_in_seconds,
                lrr.static_duration_in_seconds, 
                sri.speed
            FROM route_statuses rs
            LEFT JOIN latest_route_record lrr 
                ON rs.selected_route_id = lrr.selected_route_id
            -- 4. Logic Fix: Unnest ONLY the single latest record found
            LEFT JOIN UNNEST(lrr.speed_reading_intervals) AS sri;
        """
        rows = await run_bq_query(client, query)
        rows = [dict(row) for row in rows]
        logger.info(f"Fetched {len(rows)} rows from BigQuery.")
    except Exception as e:
        logger.error(f"BigQuery execution failed: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"BigQuery sync failed: {str(e)}"
        )

    if not rows:
        return {"updated": 0, "missing": 0}

    # BQ Processing & DB Update Logic
    updates = []

    # Fetch existing lengths map for logic check
    for row in rows:
        rid = row.get("selected_route_id")
        try:
            geom_wkt = row.get("route_geometry")
            record_time = (
                row.get("record_time").strftime("%Y-%m-%d %H:%M:%S")
                if row.get("record_time")
                else None
            )

            encoded_polyline = None

            # Always create encoded_polyline from route_geometry
            if geom_wkt:
                shapely_geom = wkt.loads(geom_wkt)
                coords = extract_coords(shapely_geom)
                if coords:
                    encoded_polyline = polyline.encode(
                        [(pt[1], pt[0]) for pt in coords], precision=5
                    )

            updates.append(
                {
                    "record_time": record_time,
                    "curr_dur": row.get("duration_in_seconds"),
                    "stat_dur": row.get("static_duration_in_seconds"),
                    "traffic": row.get("speed", "NORMAL"),
                    "uuid": rid,
                    "encoded_polyline": encoded_polyline,
                }
            )
        except Exception:
            continue

    logger.info(f"Updates to apply: {len(updates)}")

    return updates


async def build_bq_update_map(updates: list[dict]) -> dict:
    """
    Converts BQ update rows into a dict keyed by route uuid.
    """
    return {row["uuid"]: row for row in updates or [] if "uuid" in row}


# -------------------------
# MAIN EXECUTOR
# -------------------------
def _write_timing_log(timing_records: list, db_project_id: int, tag: Optional[str]):
    """Write timing records to a txt file."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    tag_suffix = f"_tag_{tag}" if tag else ""
    filename = f"sync_timing_project_{db_project_id}{tag_suffix}_{timestamp}.txt"
    filepath = os.path.join(os.path.dirname(__file__), "..", "..", filename)
    
    with open(filepath, "w") as f:
        f.write(f"Sync Timing Report\n")
        f.write(f"==================\n")
        f.write(f"Project ID: {db_project_id}\n")
        f.write(f"Tag: {tag or 'None (Full Sync)'}\n")
        f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"\n{'='*80}\n\n")
        
        total_duration = 0
        for record in timing_records:
            f.write(f"Operation: {record['operation']}\n")
            f.write(f"  Routes Count: {record['routes_count']}\n")
            f.write(f"  Start Time:   {record['start_time']}\n")
            f.write(f"  End Time:     {record['end_time']}\n")
            f.write(f"  Duration:     {record['duration_seconds']:.3f} seconds\n")
            f.write(f"\n")
            total_duration += record['duration_seconds']
        
        f.write(f"{'='*80}\n")
        f.write(f"Total Duration: {total_duration:.3f} seconds\n")
    
    logger.info(f"Timing log saved to: {filepath}")
    return filepath


async def execute_sync(
    db_project_id: int,
    project_number: str,
    gcp_project_id: str,
    dataset_name: str,
    tag: Optional[str] = None,
    uuid: Optional[str] = None,
):
    """
    Orchestrates the sync process.
    1. Delete routes marked for deletion.
    2. Fetch current API state (Optimized: Single Call).
    3. Push 'unsynced' routes to project (using state to handle collision).
    4. (If tag is None) Save new routes to DB.
    5. (If tag is None) Enrich DB with BigQuery stats.
    """
    if VIEW_MODE == "TRUE":
        logger.info("Running in view mode.")
        return {"status": "success", "message": "Running in view mode."}

    project_uuid = await get_project_uuid(db_project_id)
    if not project_uuid:
        raise HTTPException(
            status_code=400,
            detail="Project has no project_uuid. Please ensure the project is properly configured.",
        )

    timing_records = []

    if uuid:
        logger.info(f"Syncing single route {uuid} for project {db_project_id}.")
        route = await fetch_single_route(project_uuid, uuid)
        if route:
            logger.info(f"Route {uuid} found in database. Syncing to BigQuery.")
            return await sync_single_route_to_bigquery(
                db_project_id, project_number, uuid, route
            )
        else:
            logger.error(f"Route {uuid} not found in database.")
            return {"status": "error", "message": "Route not found."}

    stats = {}

    # Fetch all routes from DB and API in parallel
    op_start = time.time()
    start_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    try:
        if ENABLE_MULTITENANT:
            # Multi-tenant: fetch by project_id (all routes for this app project), list API without filter
            all_routes, routes_list, bq_updates = await asyncio.gather(
                fetch_all_project_routes_by_project_id(db_project_id, tag),
                list_routes(project_number, project_uuid=None),
                perform_bq_sync(gcp_project_id, db_project_id, dataset_name),
            )

            def _api_route_uuid(r):
                try:
                    return (r.get("name") or "").split("/")[-1]
                except Exception:
                    return None

            def _api_route_project_uuid(r):
                return (r.get("routeAttributes") or {}).get("project_uuid")

            api_uuid_to_project_uuid = {
                _api_route_uuid(r): _api_route_project_uuid(r)
                for r in routes_list
                if _api_route_uuid(r)
            }

            # Routes that need re-creation: not on API, or on API with different project_uuid
            to_recreate = [
                r
                for r in all_routes
                if r.get("deleted_at") is None
                and (
                    r["uuid"] not in api_uuid_to_project_uuid
                    or api_uuid_to_project_uuid.get(r["uuid"]) != project_uuid
                )
            ]
            for r in to_recreate:
                r["project_uuid"] = project_uuid
            if to_recreate:
                await update_routes_project_uuid_unsynced(
                    db_project_id, project_uuid, [r["uuid"] for r in to_recreate]
                )
                stats["routes_to_recreate"] = len(to_recreate)

            to_recreate_uuids = {r["uuid"] for r in to_recreate}
            the_rest = [r for r in all_routes if r["uuid"] not in to_recreate_uuids]
            deleted_uuids, local_deleted_uuids, validating_rows, unsynced_rows, synced_invalid_rows = (
                segregate_routes(the_rest)
            )
            logger.info(
                f"Segregated routes: deleted={len(deleted_uuids)}, local_deleted={len(local_deleted_uuids)}, "
                f"validating={len(validating_rows)}, unsynced={len(unsynced_rows)}, synced_invalid={len(synced_invalid_rows)}, "
                f"to_recreate={len(to_recreate)}"
            )
        else:
            # Single-tenant: fetch by project_uuid from DB; list API without filter (all routes for GCP project)
            all_routes, routes_list, bq_updates = await asyncio.gather(
                fetch_all_project_routes(project_uuid, tag),
                list_routes(project_number, project_uuid=None),
                perform_bq_sync(gcp_project_id, db_project_id, dataset_name),
            )
            to_recreate = []
            deleted_uuids, local_deleted_uuids, validating_rows, unsynced_rows, synced_invalid_rows = (
                segregate_routes(all_routes)
            )
            logger.info(
                f"Segregated routes: deleted={len(deleted_uuids)}, local_deleted={len(local_deleted_uuids)}, "
                f"validating={len(validating_rows)}, unsynced={len(unsynced_rows)}, synced_invalid={len(synced_invalid_rows)}"
            )
            api_route_map = build_api_route_map(routes_list)
            existing_route_ids_set = set(api_route_map.keys())

        # Process Local Deletions
        if local_deleted_uuids:
            op_start = time.time()
            start_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            logger.info(f"Deleting {len(local_deleted_uuids)} local deleted routes from project.")
            await bulk_update_deleted_routes(project_uuid, local_deleted_uuids)
            stats["deleted_local"] = len(local_deleted_uuids)
            op_end = time.time()
            end_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            timing_records.append({
                "operation": "Process Local Deletions",
                "routes_count": len(local_deleted_uuids),
                "start_time": start_time_str,
                "end_time": end_time_str,
                "duration_seconds": op_end - op_start
            })

        # Process API Deletions
        if deleted_uuids:
            op_start = time.time()
            start_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            logger.info(f"Deleting {len(deleted_uuids)} routes from project.")
            success_dels = await process_deletions(db_project_id, project_number, deleted_uuids)
            logger.info(
                f"Successfully deleted {len(success_dels)} routes from project."
            )
            await bulk_update_deleted_routes(project_uuid, success_dels)
            stats["deleted_from_api"] = len(success_dels)
            op_end = time.time()
            end_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            timing_records.append({
                "operation": "Process API Deletions",
                "routes_count": len(deleted_uuids),
                "start_time": start_time_str,
                "end_time": end_time_str,
                "duration_seconds": op_end - op_start
            })

        # Delete from API routes that exist with wrong project_uuid (multi-tenant only)
        if ENABLE_MULTITENANT:
            wrong_uuids = [r["uuid"] for r in to_recreate if r["uuid"] in api_uuid_to_project_uuid]
            if wrong_uuids:
                logger.info(
                    f"Deleting {len(wrong_uuids)} route(s) from API with wrong project_uuid for re-creation."
                )
                success_dels_wrong = await process_deletions(db_project_id, project_number, wrong_uuids)
                if success_dels_wrong:
                    stats["routes_deleted_wrong_project_uuid"] = len(success_dels_wrong)

        # Log sync start with total routes to route operations log
        log_sync_start(db_project_id, project_number, len(all_routes) if all_routes else 0, tag)

        # Build API route map (multi-tenant: only routes with correct project_uuid; single-tenant: set above)
        if ENABLE_MULTITENANT:
            correct_routes = [r for r in routes_list if _api_route_project_uuid(r) == project_uuid]
            api_route_map = build_api_route_map(correct_routes)
            existing_route_ids_set = set(api_route_map.keys())

    except RouteListError as e:
        # list_routes API call failed - cannot proceed without API state
        logger.error(f"Failed to list routes from API: {e.message}")
        raise HTTPException(
            status_code=e.status_code,
            detail=f"Failed to fetch routes from Roads API: {e.message}"
        )
    except HTTPException:
        # Re-raise HTTPException from perform_bq_sync or other sources
        raise
    except Exception as e:
        logger.error(f"Failed during parallel fetch: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Sync initialization failed: {str(e)}"
        )
    op_end = time.time()
    end_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    timing_records.append({
        "operation": "Parallel Fetch (API + BQ) and routes deletion",
        "routes_count": len(all_routes) if all_routes else 0,
        "start_time": start_time_str,
        "end_time": end_time_str,
        "duration_seconds": op_end - op_start
    })

    # Process Validating Routes
    if validating_rows:
        op_start = time.time()
        start_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        logger.info(f"Updating {len(validating_rows)} validating routes status.")
        count = await process_validating_routes_updates(
            db_project_id, validating_rows, api_route_map
        )
        logger.info(f"Successfully updated {count} routes status in project.")
        stats["previously_validated_routes"] = count
        op_end = time.time()
        end_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        timing_records.append({
            "operation": "Process Validating Routes Updates",
            "routes_count": len(validating_rows),
            "start_time": start_time_str,
            "end_time": end_time_str,
            "duration_seconds": op_end - op_start
        })

    # Push Unsynced + Invalid + to_recreate (Creation) — skip only routes that already exist in API with RUNNING status
    # to_recreate = routes not on API or on API with wrong project_uuid (we already deleted those from API)
    to_create_candidates = unsynced_rows + (to_recreate if ENABLE_MULTITENANT else [])
    if to_create_candidates:
        to_create = []
        already_running = []
        for row in to_create_candidates:
            route_uuid = row["uuid"]
            if route_uuid in existing_route_ids_set:
                r_status, val_error = api_route_map.get(route_uuid, (None, None))
                # Only skip creation when already RUNNING; retry failed (STATUS_INVALID) routes
                if r_status == "STATUS_RUNNING":
                    already_running.append({
                        "uuid": route_uuid,
                        "route_name": row.get("route_name"),
                        "r_status": r_status,
                        "s_status": "synced",
                        "v_status": val_error,
                    })
                    continue
            to_create.append(row)
        if already_running:
            await bulk_update_routes_status_from_api(db_project_id, already_running)
            logger.info(
                f"Skipped creation for {len(already_running)} routes (already running in API)."
            )
        if to_create:
            op_start = time.time()
            start_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            logger.info(f"Pushing {len(to_create)} routes to project.")
            count = await process_creations(
                db_project_id, project_number, to_create, existing_route_ids_set
            )
            logger.info(f"Successfully pushed {count} routes to project.")
            stats["validating_routes"] = count
            op_end = time.time()
            end_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            timing_records.append({
                "operation": "Push Unsynced Routes (Creations)",
                "routes_count": len(to_create),
                "start_time": start_time_str,
                "end_time": end_time_str,
                "duration_seconds": op_end - op_start
            })

    # Verify Synced/Invalid Routes against API
    if synced_invalid_rows:
        op_start = time.time()
        start_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        logger.info(f"Verifying {len(synced_invalid_rows)} synced/invalid routes against API.")
        count = await verify_synced_invalid_routes(
            synced_invalid_rows, api_route_map
        )
        logger.info(f"Updated {count} synced/invalid routes after API verification.")
        stats["synced_invalid_verified"] = count
        op_end = time.time()
        end_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        timing_records.append({
            "operation": "Verify Synced/Invalid Routes",
            "routes_count": len(synced_invalid_rows),
            "start_time": start_time_str,
            "end_time": end_time_str,
            "duration_seconds": op_end - op_start
        })

    # Pull & Enrich (Only if doing full project sync, i.e., no tag)
    if tag is None:
        op_start = time.time()
        start_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        # Multi-tenant: save only routes with matching project_uuid; single-tenant: save all from API (routes_list)
        routes_to_save = correct_routes if ENABLE_MULTITENANT else routes_list
        bq_update_map = await build_bq_update_map(bq_updates)
        save_res = await save_routes_to_db(
            routes_to_save, db_project_id, project_uuid, bq_update_map
        )
        logger.info(
            f"Successfully saved {save_res['inserted']} routes to database."
        )
        stats["fetched_from_api"] = save_res["inserted"]
        stats["skipped_from_api"] = save_res["skipped"]
        stats["bq_updates"] = len(bq_update_map)
        op_end = time.time()
        end_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        timing_records.append({
            "operation": "Save Routes to DB + BQ Update Map",
            "routes_count": save_res["inserted"],
            "start_time": start_time_str,
            "end_time": end_time_str,
            "duration_seconds": op_end - op_start
        })

    # Batch update all parent routes' sync statuses at once
    op_start = time.time()
    start_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    parent_update_stats = await batch_update_parent_sync_statuses(db_project_id)
    stats["parents_updated"] = parent_update_stats.get("parents_updated", 0)
    op_end = time.time()
    end_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    timing_records.append({
        "operation": "Batch Update Parent Sync Statuses",
        "routes_count": parent_update_stats.get("parents_found", 0),
        "start_time": start_time_str,
        "end_time": end_time_str,
        "duration_seconds": op_end - op_start
    })

    # Log sync complete to route operations log
    log_sync_complete(db_project_id, stats)

    return stats

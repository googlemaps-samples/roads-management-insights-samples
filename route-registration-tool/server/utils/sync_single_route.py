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
import os
import json
from typing import Optional
from dotenv import load_dotenv
from .create_engine import async_engine
from sqlalchemy import text
from .google_roads_api import get_route, delete_route, create_route, prepare_payload_single, RouteCreationError
from .compute_parent_sync_status import update_parent_sync_status, get_parent_route_uuid
from .feature_flags import ENABLE_MULTITENANT

# -------------------------
# LOGGER SETUP
# -------------------------
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
VIEW_MODE = os.getenv('VIEW_MODE') or "false"

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


async def update_deleted_route(db_project_id, uuid):
    try:
        async with async_engine.begin() as conn:
            query = text("""
                UPDATE routes
                SET sync_status='unsynced', updated_at=CURRENT_TIMESTAMP, routes_status=NULL
                WHERE project_id = :project_id AND uuid=:uuid
            """)
            await conn.execute(query, {"project_id": db_project_id, "uuid": uuid})
        logger.info(f"Updated route {uuid} to unsynced for project {db_project_id}.")
    except Exception as e:
        logger.error(f"Error in update_deleted_route (uuid {uuid}): {e}")

async def update_synced_route(db_project_id, uuid, state):
    try:
        async with async_engine.begin() as conn:
            query = text("""
                UPDATE routes
                SET sync_status='validating', synced_at=CURRENT_TIMESTAMP, routes_status=:state
                WHERE project_id = :project_id AND uuid=:uuid
            """)
            await conn.execute(query, {"project_id": db_project_id, "uuid": uuid, "state": state})
            
            # If this is a child route, update its parent's sync status
            # Note: When status is 'validating', parent should be 'unsynced' (not all children synced yet)
            parent_uuid = await get_parent_route_uuid(uuid, conn=conn)
            if parent_uuid:
                await update_parent_sync_status(parent_uuid, conn=conn)
                logger.debug(f"Updated parent route {parent_uuid} sync status after child route {uuid} set to validating")
            
        logger.info(f"Updated route {uuid} to validating for project {db_project_id}.")
    except Exception as e:
        logger.error(f"Error in update_synced_route (uuid {uuid}): {e}")

async def update_validating_route(db_project_id, uuid, status, route_status, val_err):
    try:
        async with async_engine.begin() as conn:
            query = text("""
                UPDATE routes
                SET sync_status=:status, synced_at=CURRENT_TIMESTAMP, routes_status=:state, validation_status=:val_err WHERE project_id = :project_id AND uuid=:uuid
            """)
            await conn.execute(query, {"project_id": db_project_id, "uuid": uuid, "status": status, "state": route_status, "val_err": val_err})
            
            # If this is a child route, update its parent's sync status
            parent_uuid = await get_parent_route_uuid(uuid, conn=conn)
            if parent_uuid:
                await update_parent_sync_status(parent_uuid, conn=conn)
                logger.debug(f"Updated parent route {parent_uuid} sync status after child route {uuid} sync")
            
        logger.info(f"Updated route {uuid} to {status} for project {db_project_id}.")
    except Exception as e:
        logger.error(f"Error in update_validating_route (uuid {uuid}): {e}")


async def update_route_failed(db_project_id, uuid, error_message, error_code=400):
    """Mark route as failed/invalid in DB when creation fails (e.g. 400 INVALID_ARGUMENT)."""
    try:
        async with async_engine.begin() as conn:
            query = text("""
                UPDATE routes
                SET sync_status = 'invalid',
                    routes_status = 'STATUS_INVALID',
                    validation_status = :error_message,
                    updated_at = CURRENT_TIMESTAMP
                WHERE project_id = :project_id AND uuid = :uuid
            """)
            await conn.execute(query, {
                "project_id": db_project_id,
                "uuid": uuid,
                "error_message": f"Creation failed ({error_code}): {error_message}",
            })
        logger.info(f"Updated route {uuid} to failed/invalid for project {db_project_id}.")
    except Exception as e:
        logger.error(f"Error in update_route_failed (uuid {uuid}): {e}")

# -------------------------
# MAIN FLOW
# -------------------------
async def sync_single_route_to_bigquery(db_project_id, project_number, uuid, route):
    project_uuid = await get_project_uuid(db_project_id) if ENABLE_MULTITENANT else None
    payload = await prepare_payload_single(route, project_uuid=project_uuid)
    # Debug logging removed - use logger.debug() instead of writing to file
    if VIEW_MODE == "TRUE":
        logger.info(f"Running in view mode. Skipping sync of route {uuid} for project {db_project_id}.")
        return {
            "status": "success",
            "message": "Skipping sync: Running in view mode."
        }
    else:
        # --- Delete old routes if they exist ---
        # Single-tenant: don't filter by project_uuid when getting the route
        logger.info(f"Checking existing route {uuid} for project {db_project_id}.")
        existing_route_id = await get_route(
            project_number, uuid, project_uuid=project_uuid
        )
        if existing_route_id:
            logger.info(f"Existing route {uuid} found in project {db_project_id}.")
        else:
            logger.info(f"No existing route {uuid} found in project {db_project_id}.")
            existing_route_id = None

        if route[0][5] == "validating":
            if existing_route_id:
                logger.info(f"Route {uuid} is already validated. Updating status.")
                try:
                    val_err = existing_route_id.get("validationError")
                    logger.info(f"Validation error for route {uuid}: {val_err}")
                except Exception as e:
                    logger.info(f"No validation error for route {uuid}.")
                    logger.error(f"Error getting validation error for route {uuid}: {e}")
                    val_err = None
                if existing_route_id.get("state") == "STATE_RUNNING":
                    logger.info(f"Route {uuid} is running. Updating status.")
                    await update_validating_route(db_project_id, uuid, "synced", "STATUS_RUNNING", val_err)
                elif existing_route_id.get("state") == "STATE_INVALID":
                    logger.info(f"Route {uuid} is invalid. Updating status.")
                    await update_validating_route(db_project_id, uuid, "invalid", "STATUS_INVALID", val_err)
                else:
                    await update_validating_route(db_project_id, uuid, "validating", "STATUS_VALIDATING", val_err)
                return {
                    "status": "success",
                    "message": f"Successfully updated status for route {uuid} for project {db_project_id}."
                }
        else:
            if existing_route_id:
                try:
                    await delete_route(project_number, uuid)
                    await update_deleted_route(db_project_id, uuid)
                except Exception as e:
                    logger.error(f"Error deleting old route {uuid}: {e}")

            # --- Create route ---
            try:
                result = await create_route(project_number, uuid, payload)
            except RouteCreationError as e:
                logger.error(f"Route creation failed for {uuid}: {e.message}")
                await update_route_failed(db_project_id, uuid, e.message, e.status_code)
                return {
                    "status": "error",
                    "message": f"Route creation failed: {e.message}",
                    "details": {"uuid": uuid, "error_code": e.status_code},
                }

            logger.debug(f"API result for uuid {uuid}: {result}")

            if not result or not isinstance(result, dict):
                logger.error(f"Unexpected API response for route {uuid}.")

            try:
                route_status = result.get("state")
                await update_synced_route(db_project_id, uuid, route_status)
            except Exception as e:
                logger.error(f"Error updating synced route for uuid {uuid}: {e}")
            return {
                "status": "success",
                "message": f"Successfully created route {uuid} for project {db_project_id}."
            }
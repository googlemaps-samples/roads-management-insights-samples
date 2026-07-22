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


import asyncio
from datetime import datetime
from .create_engine import engine
from sqlalchemy import text
from .google_roads_api import get_route
import logging

# Lazy import for WebSocket broadcasting to avoid circular imports
def get_ws_manager():
    """Lazy import of ws_manager to avoid circular imports."""
    try:
        from server.main import ws_manager
        return ws_manager
    except (ImportError, AttributeError):
        return None

# -------------------------------------------------
# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
# -------------------------------------------------

# Status mapping from API state to database status
STATUS_MAPPING = {
    "STATE_INVALID": "STATUS_INVALID",
    "STATE_RUNNING": "STATUS_RUNNING",
    "STATE_VALIDATING": "STATUS_VALIDATING",
    "STATE_DELETING": "STATUS_DELETING",
    "STATE_UNSPECIFIED": "STATUS_UNSPECIFIED"
}

class RouteStatusChecker:
    def __init__(self, project_number=None):
        """
        Initialize RouteStatusChecker.
        If project_number is None, checks routes from all projects.
        """
        self.project_number = project_number
        self.engine = engine

    def get_routes_to_check(self):
        """Fetch all routes where routes_status is NULL or STATUS_INVALID, with GCP project number."""
        with self.engine.begin() as conn:
            query = text("""
                SELECT r.uuid, p.google_cloud_project_number
                FROM routes r
                INNER JOIN projects p ON r.project_id = p.id
                WHERE (r.routes_status IS NULL OR r.routes_status = 'STATUS_INVALID')
                AND p.deleted_at IS NULL
                AND p.google_cloud_project_number IS NOT NULL
            """)
            result = conn.execute(query)
            return [(row[0], row[1]) for row in result.fetchall()]

    def get_routes_in_validation(self):
        """Fetch all routes where sync_status is 'validating', with GCP project number.
        If self.project_number is set, only checks routes for that project.
        Otherwise, checks routes from all projects.
        """
        with self.engine.begin() as conn:
            if self.project_number:
                # Check routes for a specific project
                query = text("""
                    SELECT r.uuid, r.sync_status, r.routes_status, r.route_name, r.updated_at, 
                           p.google_cloud_project_number
                    FROM routes r
                    INNER JOIN projects p ON r.project_id = p.id
                    WHERE r.sync_status = 'validating'
                    AND p.deleted_at IS NULL
                    AND p.google_cloud_project_number IS NOT NULL
                    AND p.google_cloud_project_number = :project_number
                """)
                result = conn.execute(query, {"project_number": self.project_number})
            else:
                # Check routes from all projects
                query = text("""
                    SELECT r.uuid, r.sync_status, r.routes_status, r.route_name, r.updated_at, 
                           p.google_cloud_project_number
                    FROM routes r
                    INNER JOIN projects p ON r.project_id = p.id
                    WHERE r.sync_status = 'validating'
                    AND p.deleted_at IS NULL
                    AND p.google_cloud_project_number IS NOT NULL
                """)
                result = conn.execute(query)
            return [(row[0], row[1], row[2], row[3], row[4], row[5]) for row in result.fetchall()]

    async def get_route_state(self, route_id, gcp_project_number, route_name=None):
        """Fetch route state from API (async).

        Returns tuple of (db_status, validation_error) or ("ERROR", None) on error.
        """
        route_info = f"{route_id}" + (f" ({route_name})" if route_name else "")
        logging.info(f"[VALIDATION CHECK] Fetching status for route: {route_info} (GCP project: {gcp_project_number})")
        
        if not gcp_project_number:
            logging.error(f"[VALIDATION CHECK] Route {route_info} - No GCP project number available")
            return ("ERROR", None)
        
        try:
            route_data = await get_route(gcp_project_number, route_id)
            if route_data:
                api_state = route_data.get("state", "UNKNOWN")
                # Map API state (STATE_*) to database status (STATUS_*)
                db_status = STATUS_MAPPING.get(api_state, api_state)
                validation_error = route_data.get("validationError")
                
                log_msg = f"[VALIDATION CHECK] Route {route_info} - Fetched API state: {api_state}, Mapped to DB status: {db_status}"
                if validation_error:
                    log_msg += f", Validation error: {validation_error}"
                logging.info(log_msg)
                
                return (db_status, validation_error)
            else:
                logging.warning(f"[VALIDATION CHECK] Route {route_info} - No data returned from API")
                return ("UNKNOWN", None)
        except Exception as e:
            logging.error(f"[VALIDATION CHECK] Error fetching state for route {route_info}: {e}")
            return ("ERROR", None)

    async def _update_route_status(self, route_id: str, state: str, validation_error, route_name=None) -> None:
        update_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        route_info = f"{route_id}" + (f" ({route_name})" if route_name else "")

        with self.engine.begin() as conn:
            project_query = text(
                """
                SELECT project_id, parent_route_id FROM routes WHERE uuid = :uuid
                """
            )
            project_row = conn.execute(project_query, {"uuid": route_id}).fetchone()
            project_id = str(project_row[0]) if project_row and project_row[0] else None
            parent_route_id = project_row[1] if project_row and project_row[1] else None

            check_query = text(
                """
                SELECT sync_status, routes_status, validation_status, updated_at, is_enabled
                FROM routes
                WHERE uuid = :uuid
                """
            )
            row = conn.execute(check_query, {"uuid": route_id}).fetchone()
            current_sync_status = row[0] if row else None
            current_routes_status = row[1] if row else None
            current_validation_status = row[2] if row else None
            last_updated = row[3] if row else None
            current_is_enabled = row[4] if row else True

            status_changed = current_routes_status != state
            validation_changed = current_validation_status != validation_error
            if not (status_changed or validation_changed):
                log_prefix = "[VALIDATION CHECK]" if route_name else "[ROUTE CHECK]"
                logging.debug(
                    f"{log_prefix} Route {route_info} - No status change: still {state} "
                    f"(Last checked: {update_timestamp})"
                )
                return

            new_sync_status = current_sync_status
            if state == "STATUS_RUNNING":
                new_sync_status = "synced"
            elif state == "STATUS_INVALID":
                new_sync_status = "invalid"
            elif state == "STATUS_VALIDATING":
                new_sync_status = "validating"

            update_query = text(
                """
                UPDATE routes
                SET routes_status = :routes_state,
                    sync_status = :sync_state,
                    validation_status = :validation_error,
                    updated_at = CURRENT_TIMESTAMP
                WHERE uuid = :uuid
                """
            )
            conn.execute(
                update_query,
                {
                    "routes_state": state,
                    "sync_state": new_sync_status,
                    "validation_error": validation_error,
                    "uuid": route_id,
                },
            )

        log_prefix = "[VALIDATION UPDATE]" if route_name else "[ROUTE UPDATE]"
        status_msg = (
            f"routes_status: {current_routes_status} -> {state}, "
            f"sync_status: {current_sync_status} -> {new_sync_status}"
        )
        if validation_changed:
            status_msg += f", validation_status: {current_validation_status} -> {validation_error}"

        logging.info(
            f"{log_prefix} Route {route_info} - Status updated at {update_timestamp}: {status_msg} "
            f"(Previous update: {last_updated})"
        )

        if project_id:
            ws_manager = get_ws_manager()
            if ws_manager:
                project_id_str = str(project_id)
                route_update = {
                    "route_id": route_id,
                    "sync_status": new_sync_status,
                    "routes_status": state,
                    "validation_status": validation_error,
                    "updated_at": update_timestamp,
                    "parent_route_id": parent_route_id,
                    "is_enabled": current_is_enabled,
                }
                try:
                    await ws_manager.broadcast_route_status_update(project_id_str, route_update)
                except Exception as e:
                    logging.error(
                        f"[WEBSOCKET] Failed to broadcast route status update: {e}",
                        exc_info=True,
                    )

    async def check_validation_routes(self):
        """Check routes in validation status and update if changed."""
        check_start_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        routes_in_validation = self.get_routes_in_validation()
        
        if not routes_in_validation:
            logging.info(f"[VALIDATION CHECK] Started at {check_start_time} - No routes in validation status to check.")
            return

        logging.info(
            f"[VALIDATION CHECK] Started at {check_start_time} - "
            f"Found {len(routes_in_validation)} route(s) with sync_status='validating'"
        )
        
        # Log details of each route being checked
        for route_id, sync_status, routes_status, route_name, last_updated, gcp_project_number in routes_in_validation:
            route_info = f"{route_id}" + (f" ({route_name})" if route_name else "")
            logging.info(
                f"[VALIDATION CHECK] Route {route_info} - "
                f"sync_status: {sync_status}, routes_status: {routes_status}, "
                f"GCP project: {gcp_project_number}, "
                f"Last updated: {last_updated}"
            )
        
        updated = 0
        for route_id, _, _, route_name, _, gcp_project_number in routes_in_validation:
            state, validation_error = await self.get_route_state(
                route_id, gcp_project_number, route_name
            )
            if state != "ERROR":
                await self._update_route_status(route_id, state, validation_error, route_name)
                updated += 1

        check_end_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        logging.info(
            f"[VALIDATION CHECK] Completed at {check_end_time} - "
            f"Queued {updated} route(s) for status update "
            f"(Duration: {len(routes_in_validation)} route(s) checked)"
        )

    async def run(self):
        logging.info("Fetching routes needing status check...")
        routes_to_check = self.get_routes_to_check()
        logging.info(f"Found {len(routes_to_check)} routes needing update.")

        if not routes_to_check:
            logging.info("No routes need checking.")
            return

        updated = 0
        for route_id, gcp_project_number in routes_to_check:
            state, validation_error = await self.get_route_state(route_id, gcp_project_number)
            if state != "ERROR":
                await self._update_route_status(route_id, state, validation_error)
                updated += 1

        logging.info(f"Done. Total routes updated: {updated}")

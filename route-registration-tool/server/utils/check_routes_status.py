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


import threading
import queue
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
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
    def __init__(self, project_number=None, max_workers=20):
        """
        Initialize RouteStatusChecker.
        If project_number is None, checks routes from all projects.
        """
        self.project_number = project_number
        self.engine = engine
        self.update_queue = queue.Queue()
        self.max_workers = max_workers
        self.stop_event = threading.Event()
        self.validation_check_thread = None
        self.db_thread = None
        self._db_thread_running = False

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

    def get_route_state(self, route_id, gcp_project_number, route_name=None):
        """Fetch route state from API (synchronous wrapper for async function).
        Returns tuple of (db_status, validation_error) or ("ERROR", None) on error.
        """
        route_info = f"{route_id}" + (f" ({route_name})" if route_name else "")
        logging.info(f"[VALIDATION CHECK] Fetching status for route: {route_info} (GCP project: {gcp_project_number})")
        
        if not gcp_project_number:
            logging.error(f"[VALIDATION CHECK] Route {route_info} - No GCP project number available")
            return ("ERROR", None)
        
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            route_data = loop.run_until_complete(get_route(gcp_project_number, route_id))
            loop.close()
            
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

    def db_worker(self):
        """Worker thread to consume queue and update SQLite safely."""
        while not self.stop_event.is_set() or not self.update_queue.empty():
            try:
                queue_item = self.update_queue.get(timeout=1)
                # Handle different queue item formats:
                # - (route_id, state, validation_error, route_name) - 4 items: from validation check
                # - (route_id, state, validation_error) - 3 items: from run() method
                if len(queue_item) == 4:
                    route_id, state, validation_error, route_name = queue_item
                elif len(queue_item) == 3:
                    route_id, state, validation_error = queue_item
                    route_name = None
                else:
                    # Backward compatibility: (route_id, state) - 2 items
                    route_id, state = queue_item
                    route_name = None
                    validation_error = None
            except queue.Empty:
                continue

            try:
                update_timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                route_info = f"{route_id}" + (f" ({route_name})" if route_name else "")
                
                with self.engine.begin() as conn:
                    # Get project_id and parent_route_id for this route to broadcast updates
                    project_query = text("""
                        SELECT project_id, parent_route_id FROM routes WHERE uuid = :uuid
                    """)
                    project_result = conn.execute(project_query, {"uuid": route_id})
                    project_row = project_result.fetchone()
                    project_id = str(project_row[0]) if project_row and project_row[0] else None
                    parent_route_id = project_row[1] if project_row and project_row[1] else None
                    if project_id:
                        logging.debug(f"[WEBSOCKET] Route {route_id} belongs to project_id: {project_id} (type: {type(project_id).__name__}), parent_route_id: {parent_route_id}")
                    
                    # Check current status before updating
                    check_query = text("""
                        SELECT sync_status, routes_status, validation_status, updated_at, is_enabled FROM routes
                        WHERE uuid = :uuid
                    """)
                    result = conn.execute(check_query, {"uuid": route_id})
                    row = result.fetchone()
                    current_sync_status = row[0] if row else None
                    current_routes_status = row[1] if row else None
                    current_validation_status = row[2] if row else None
                    last_updated = row[3] if row else None
                    current_is_enabled = row[4] if row else True
                    
                    # Check if routes_status or validation_status has changed
                    status_changed = current_routes_status != state
                    validation_changed = current_validation_status != validation_error
                    
                    if status_changed or validation_changed:
                        # Determine new sync_status based on database status (STATUS_*)
                        new_sync_status = current_sync_status
                        if state == "STATUS_RUNNING":
                            new_sync_status = "synced"
                        elif state == "STATUS_INVALID":
                            new_sync_status = "invalid"
                        elif state == "STATUS_VALIDATING":
                            new_sync_status = "validating"
                        
                        update_query = text("""
                            UPDATE routes
                            SET routes_status = :routes_state, 
                                sync_status = :sync_state,
                                validation_status = :validation_error,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE uuid = :uuid
                        """)
                        conn.execute(update_query, {
                            "routes_state": state, 
                            "sync_state": new_sync_status,
                            "validation_error": validation_error,
                            "uuid": route_id
                        })
                        
                        # Use validation-specific logging if route_name is provided (from validation check)
                        log_prefix = "[VALIDATION UPDATE]" if route_name else "[ROUTE UPDATE]"
                        status_msg = f"routes_status: {current_routes_status} -> {state}, sync_status: {current_sync_status} -> {new_sync_status}"
                        if validation_changed:
                            status_msg += f", validation_status: {current_validation_status} -> {validation_error}"
                        
                        logging.info(
                            f"{log_prefix} Route {route_info} - "
                            f"Status updated at {update_timestamp}: {status_msg} "
                            f"(Previous update: {last_updated})"
                        )
                        
                        # Broadcast route status update via WebSocket
                        if project_id:
                            try:
                                ws_manager = get_ws_manager()
                                if ws_manager:
                                    # Ensure project_id is a string to match connection manager format
                                    project_id_str = str(project_id)
                                    route_update = {
                                        "route_id": route_id,
                                        "sync_status": new_sync_status,
                                        "routes_status": state,
                                        "validation_status": validation_error,
                                        "updated_at": update_timestamp,
                                        "parent_route_id": parent_route_id,  # Include parent_route_id for segments
                                        "is_enabled": current_is_enabled  # Include is_enabled for segments
                                    }
                                    # Use asyncio to run the async broadcast function
                                    loop = asyncio.new_event_loop()
                                    asyncio.set_event_loop(loop)
                                    loop.run_until_complete(
                                        ws_manager.broadcast_route_status_update(project_id_str, route_update)
                                    )
                                    loop.close()
                                    connection_count = len(ws_manager.project_connections.get(project_id_str, []))
                                    logging.info(f"[WEBSOCKET] Broadcasted route status update for {route_id} to project {project_id_str} (connections: {connection_count})")
                                else:
                                    logging.warning(f"[WEBSOCKET] ws_manager is None, cannot broadcast update for route {route_id}")
                            except Exception as e:
                                logging.error(f"[WEBSOCKET] Failed to broadcast route status update: {e}", exc_info=True)
                    else:
                        # Use validation-specific logging if route_name is provided
                        log_prefix = "[VALIDATION CHECK]" if route_name else "[ROUTE CHECK]"
                        logging.debug(
                            f"{log_prefix} Route {route_info} - "
                            f"No status change: still {state} "
                            f"(Last checked: {update_timestamp})"
                        )
            except Exception as e:
                logging.exception(f"[VALIDATION ERROR] DB update failed for route {route_id}: {e}")
            finally:
                self.update_queue.task_done()

    def check_validation_routes(self):
        """Check routes in validation status and update if changed."""
        check_start_time = time.strftime("%Y-%m-%d %H:%M:%S")
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
        
        # Start DB worker thread if not already running
        if not self._db_thread_running or (self.db_thread and not self.db_thread.is_alive()):
            self.db_thread = threading.Thread(target=self.db_worker, daemon=True)
            self.db_thread.start()
            self._db_thread_running = True

        updated = 0
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_route = {
                executor.submit(self.get_route_state, route_id, gcp_project_number, route_name): (route_id, route_name)
                for route_id, _, _, route_name, _, gcp_project_number in routes_in_validation
            }

            for future in as_completed(future_to_route):
                route_id, route_name = future_to_route[future]
                try:
                    result = future.result()
                    # get_route_state returns (state, validation_error) tuple
                    if isinstance(result, tuple):
                        state, validation_error = result
                    else:
                        # Backward compatibility: if it's not a tuple, treat as state only
                        state = result
                        validation_error = None
                    
                    if state != "ERROR":
                        self.update_queue.put((route_id, state, validation_error, route_name))
                        updated += 1
                except Exception as e:
                    logging.exception(f"[VALIDATION ERROR] Error processing route {route_id}: {e}")

        check_end_time = time.strftime("%Y-%m-%d %H:%M:%S")
        logging.info(
            f"[VALIDATION CHECK] Completed at {check_end_time} - "
            f"Queued {updated} route(s) for status update "
            f"(Duration: {len(routes_in_validation)} route(s) checked)"
        )

    def continuous_validation_check(self, interval_seconds=20):
        """Continuously check routes in validation status every N seconds."""
        project_info = f"all projects" if self.project_number is None else f"project: {self.project_number}"
        logging.info(
            f"[VALIDATION CHECKER] Starting continuous validation check "
            f"({project_info}, interval: {interval_seconds}s)"
        )
        cycle_count = 0
        
        while not self.stop_event.is_set():
            cycle_count += 1
            cycle_start = time.strftime("%Y-%m-%d %H:%M:%S")
            logging.info(f"[VALIDATION CHECKER] Cycle #{cycle_count} started at {cycle_start}")
            
            try:
                self.check_validation_routes()
            except Exception as e:
                logging.exception(f"[VALIDATION CHECKER] Error in validation check cycle #{cycle_count}: {e}")
            
            # Wait for interval, but check stop_event periodically
            logging.debug(f"[VALIDATION CHECKER] Waiting {interval_seconds}s until next check cycle...")
            for _ in range(interval_seconds):
                if self.stop_event.is_set():
                    break
                time.sleep(1)
        
        logging.info(f"[VALIDATION CHECKER] Stopped after {cycle_count} check cycle(s)")

    def start_validation_checker(self, interval_seconds=20):
        """Start the continuous validation checker in a background thread."""
        if self.validation_check_thread and self.validation_check_thread.is_alive():
            logging.warning("Validation checker is already running.")
            return
        
        self.stop_event.clear()
        self.validation_check_thread = threading.Thread(
            target=self.continuous_validation_check,
            args=(interval_seconds,),
            daemon=True
        )
        self.validation_check_thread.start()
        logging.info("Validation checker started in background thread.")

    def stop_validation_checker(self):
        """Stop the continuous validation checker."""
        if self.validation_check_thread and self.validation_check_thread.is_alive():
            logging.info("Stopping validation checker...")
            self.stop_event.set()
            self.validation_check_thread.join(timeout=5)
            logging.info("Validation checker stopped.")
        else:
            logging.warning("Validation checker is not running.")

    def run(self):
        logging.info("Fetching routes needing status check...")
        routes_to_check = self.get_routes_to_check()
        logging.info(f"Found {len(routes_to_check)} routes needing update.")

        if not routes_to_check:
            logging.info("No routes need checking.")
            return

        # Start DB worker thread
        db_thread = threading.Thread(target=self.db_worker, daemon=True)
        db_thread.start()

        updated = 0
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_route = {
                executor.submit(self.get_route_state, route_id, gcp_project_number): route_id
                for route_id, gcp_project_number in routes_to_check
            }

            for future in as_completed(future_to_route):
                route_id = future_to_route[future]
                try:
                    result = future.result()
                    # get_route_state returns (state, validation_error) tuple
                    if isinstance(result, tuple):
                        state, validation_error = result
                    else:
                        # Backward compatibility: if it's not a tuple, treat as state only
                        state = result
                        validation_error = None
                    
                    if state != "ERROR":
                        self.update_queue.put((route_id, state, validation_error))
                        updated += 1
                except Exception as e:
                    logging.exception(f"Error processing {route_id}: {e}")

        # Wait for all queued updates to complete
        self.update_queue.join()
        self.stop_event.set()
        db_thread.join(timeout=5)

        logging.info(f"Done. Total routes updated: {updated}")

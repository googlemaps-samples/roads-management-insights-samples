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

from __future__ import annotations

from sqlalchemy import text

from server.core.db_setup import init_db_sqlite
from server.db.config import get_sqlite_filesystem_path
from server.utils.db_gcs import restore_db_from_gcs, start_backup_thread, stop_backup_thread


class SQLiteBackend:
    name = "sqlite"

    def restore_from_gcs_if_applicable(self) -> None:
        sqlite_path = get_sqlite_filesystem_path()
        if not sqlite_path:
            return
        restore_db_from_gcs(sqlite_path)

    def init_on_startup(self) -> None:
        # SQLite schema is file-backed (or memory in tests), so use the legacy sqlite DDL initializer.
        init_db_sqlite()

    def start_backup_if_applicable(self) -> None:
        sqlite_path = get_sqlite_filesystem_path()
        if not sqlite_path:
            return
        start_backup_thread(sqlite_path)

    def stop_backup_if_running(self) -> None:
        stop_backup_thread()

    def ensure_pubsub_routes_table_schema(self, conn: object) -> None:
        # This is a legacy SQLite bootstrap used by pubsub ingestion.
        # If the full schema already exists, CREATE TABLE IF NOT EXISTS is a no-op.
        conn.execute(
            text(
                """
CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    project_id INTEGER NOT NULL,
    route_name TEXT,
    origin TEXT,
    destination TEXT,
    waypoints TEXT,
    center TEXT,
    encoded_polyline TEXT,
    route_type TEXT,
    length REAL,
    parent_route_id TEXT,
    has_children BOOLEAN DEFAULT FALSE,
    is_segmented BOOLEAN DEFAULT FALSE,
    segmentation_type TEXT,
    segmentation_points TEXT,
    segmentation_config TEXT,
    sync_status TEXT CHECK(sync_status IN ('unsynced','validating','synced','invalid')) DEFAULT 'unsynced',
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    tag TEXT,
    temp_geometry TEXT,
    start_lat REAL,
    start_lng REAL,
    end_lat REAL,
    end_lng REAL,
    min_lat REAL,
    max_lat REAL,
    min_lng REAL,
    max_lng REAL,
    latest_data_update_time DATETIME,
    static_duration_seconds REAL,
    current_duration_seconds REAL,
    routes_status TEXT,
    synced_at DATETIME,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
                """
            )
        )

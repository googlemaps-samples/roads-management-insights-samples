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


import sqlite3
import logging
import uuid as uuid_module

from server.db.database import DB

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def column_exists(cursor, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table"""
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    return column_name in columns

def init_db():
    conn = sqlite3.connect(DB)
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")

    # ---------------------
    # Users
    # ---------------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        distance_unit TEXT NOT NULL DEFAULT 'km',
        google_cloud_account TEXT,
        show_tooltip INTEGER NOT NULL DEFAULT 1,
        show_instructions INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Add show_tooltip column if it doesn't exist (for existing databases)
    if not column_exists(cursor, "users", "show_tooltip"):
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN show_tooltip INTEGER NOT NULL DEFAULT 1;")
            conn.commit()
            logger.info("✅ Added show_tooltip column to users table")
        except sqlite3.OperationalError as e:
            logger.error(f"⚠️ Could not add show_tooltip column: {e}")
            pass
    
    # Add show_instructions column if it doesn't exist (for existing databases)
    if not column_exists(cursor, "users", "show_instructions"):
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN show_instructions INTEGER NOT NULL DEFAULT 1;")
            conn.commit()
            logger.info("✅ Added show_instructions column to users table")
        except sqlite3.OperationalError as e:
            logger.error(f"⚠️ Could not add show_instructions column: {e}")
    
    # Insert default user if not exists
    cursor.execute("""
    INSERT OR IGNORE INTO users (id, distance_unit, google_cloud_account, show_tooltip, show_instructions)
    VALUES (1, 'km', NULL, 1, 1)""")
    # Add route_color_mode column if it doesn't exist (for existing databases)
    if not column_exists(cursor, "users", "route_color_mode"):
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN route_color_mode TEXT DEFAULT 'sync_status';")
            conn.commit()
            logger.info("✅ Added route_color_mode column to users table")
        except sqlite3.OperationalError as e:
            logger.error(f"⚠️ Could not add route_color_mode column: {e}")
    
    # Insert default user if not exists
    cursor.execute("""
    INSERT OR IGNORE INTO users (id, distance_unit, google_cloud_account, show_tooltip, route_color_mode)
    VALUES (1, 'km', NULL, 1, 'sync_status')
    """)

    # ---------------------
    # Projects
    # ---------------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_uuid TEXT,
        project_name TEXT NOT NULL,
        jurisdiction_boundary_geojson TEXT NOT NULL,
        google_cloud_project_id TEXT,
        google_cloud_project_number TEXT,
        subscription_id TEXT,
        dataset_name TEXT,
        viewstate TEXT,
        map_snapshot TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
    )
    """)

    # Add project_uuid column if it doesn't exist and backfill for existing rows
    if not column_exists(cursor, "projects", "project_uuid"):
        try:
            cursor.execute("ALTER TABLE projects ADD COLUMN project_uuid TEXT;")
            conn.commit()
            logger.info("✅ Added project_uuid column to projects table")
        except sqlite3.OperationalError as e:
            logger.error(f"⚠️ Could not add project_uuid column: {e}")
            pass
    # Backfill project_uuid for any project that doesn't have one
    cursor.execute("SELECT id FROM projects WHERE project_uuid IS NULL OR project_uuid = ''")
    for row in cursor.fetchall():
        cursor.execute(
            "UPDATE projects SET project_uuid = ? WHERE id = ?",
            (str(uuid_module.uuid4()), row[0]),
        )
    conn.commit()
    
    # Create unique indexes for projects table
    cursor.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_unique 
    ON projects(project_name) 
    WHERE deleted_at IS NULL
    """)
    
    # Add dataset_name column if it doesn't exist (for existing databases)
    if not column_exists(cursor, "projects", "dataset_name"):
        try:
            cursor.execute("ALTER TABLE projects ADD COLUMN dataset_name TEXT;")
            conn.commit()
            logger.info("✅ Added dataset_name column to projects table")
        except sqlite3.OperationalError as e:
            logger.error(f"⚠️ Could not add dataset_name column: {e}")
            pass

    # ---------------------
    # Polygons
    # ---------------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS polygons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        boundary_geojson TEXT NOT NULL, -- GeoJSON
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
    """)

    # ---------------------
    # Routes
    # ---------------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL,
        project_id INTEGER NOT NULL,
        project_uuid TEXT,
        route_name TEXT NOT NULL,
        origin TEXT NOT NULL, -- JSON {lat, lng}
        destination TEXT NOT NULL, -- JSON {lat, lng}
        waypoints TEXT, -- JSON array
        center TEXT, -- JSON {lat, lng}
        encoded_polyline TEXT,
        route_type TEXT, -- 'individual' | 'polygon_import' | 'polygon_combined'
        length REAL,
        parent_route_id TEXT, -- self reference (logical; no FK so same uuid can exist in multiple projects)
        has_children BOOLEAN DEFAULT FALSE, -- true if this route is parent of children
        is_segmented BOOLEAN DEFAULT FALSE,
        segmentation_type TEXT, -- 'manual' | 'distance' | 'intersections'
        segmentation_points TEXT, -- JSON of cut points
        segmentation_config TEXT, -- JSON config
        sync_status TEXT DEFAULT 'unsynced',
        is_enabled BOOLEAN DEFAULT TRUE, -- soft delete / disable flag
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME, tag TEXT, start_lat REAL, start_lng REAL, end_lat REAL, end_lng REAL, min_lat REAL, max_lat REAL, min_lng REAL, max_lng REAL, latest_data_update_time DATETIME, static_duration_seconds REAL, current_duration_seconds REAL, routes_status TEXT, synced_at DATETIME,
        original_route_geo_json TEXT, -- Original uploaded route GeoJSON data
        match_percentage REAL, -- Match/similarity percentage (0-100)
        temp_geometry TEXT, -- Temporary geometry for undo/redo functionality
        validation_status TEXT,
        traffic_status TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    """)
    
    # Add project_uuid column to routes if it doesn't exist and backfill from projects
    if not column_exists(cursor, "routes", "project_uuid"):
        try:
            cursor.execute("ALTER TABLE routes ADD COLUMN project_uuid TEXT;")
            conn.commit()
            logger.info("✅ Added project_uuid column to routes table")
        except sqlite3.OperationalError as e:
            logger.error(f"⚠️ Could not add project_uuid column to routes: {e}")
            pass
    cursor.execute("""
        UPDATE routes SET project_uuid = (SELECT project_uuid FROM projects WHERE projects.id = routes.project_id)
        WHERE project_uuid IS NULL OR project_uuid = ''
    """)
    conn.commit()

    # Add original_route_geo_json column if it doesn't exist (for existing databases)
    if not column_exists(cursor, "routes", "original_route_geo_json"):
        try:
            cursor.execute("ALTER TABLE routes ADD COLUMN original_route_geo_json TEXT;")
            conn.commit()
            logger.info("✅ Added original_route_geo_json column to routes table")
        except sqlite3.OperationalError as e:
            logger.error(f"⚠️ Could not add original_route_geo_json column: {e}")
            pass
    
    # Add segment_order column if it doesn't exist (for existing databases)
    if not column_exists(cursor, "routes", "segment_order"):
        try:
            cursor.execute("ALTER TABLE routes ADD COLUMN segment_order INTEGER;")
            conn.commit()
            logger.info("✅ Added segment_order column to routes table")
        except sqlite3.OperationalError as e:
            logger.error(f"⚠️ Could not add segment_order column: {e}")
            pass
    
    # Add match_percentage column if it doesn't exist (for existing databases)
    if not column_exists(cursor, "routes", "match_percentage"):
        try:
            cursor.execute("ALTER TABLE routes ADD COLUMN match_percentage REAL;")
            conn.commit()
            logger.info("✅ Added match_percentage column to routes table")
        except sqlite3.OperationalError as e:
            logger.error(f"⚠️ Could not add match_percentage column: {e}")
            pass

    # Migrate routes from uuid-as-PK to id-as-PK (allow duplicate uuid across projects)
    if column_exists(cursor, "routes", "uuid") and not column_exists(cursor, "routes", "id"):
        try:
            logger.info("Migrating routes table: uuid no longer primary key, adding id.")
            cursor.execute("""
                CREATE TABLE routes_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uuid TEXT NOT NULL,
                    project_id INTEGER NOT NULL,
                    route_name TEXT NOT NULL,
                    origin TEXT NOT NULL,
                    destination TEXT NOT NULL,
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
                    sync_status TEXT DEFAULT 'unsynced',
                    is_enabled BOOLEAN DEFAULT TRUE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    deleted_at DATETIME,
                    tag TEXT,
                    start_lat REAL, start_lng REAL, end_lat REAL, end_lng REAL,
                    min_lat REAL, max_lat REAL, min_lng REAL, max_lng REAL,
                    latest_data_update_time DATETIME,
                    static_duration_seconds REAL,
                    current_duration_seconds REAL,
                    routes_status TEXT,
                    synced_at DATETIME,
                    original_route_geo_json TEXT,
                    match_percentage REAL,
                    temp_geometry TEXT,
                    validation_status TEXT,
                    traffic_status TEXT,
                    segment_order INTEGER,
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
                )
            """)
            cursor.execute("PRAGMA table_info(routes)")
            old_cols = [row[1] for row in cursor.fetchall()]
            new_cols_no_id = [
                "uuid", "project_id", "route_name", "origin", "destination", "waypoints", "center",
                "encoded_polyline", "route_type", "length", "parent_route_id", "has_children", "is_segmented",
                "segmentation_type", "segmentation_points", "segmentation_config", "sync_status", "is_enabled",
                "created_at", "updated_at", "deleted_at", "tag",
                "start_lat", "start_lng", "end_lat", "end_lng",
                "min_lat", "max_lat", "min_lng", "max_lng",
                "latest_data_update_time", "static_duration_seconds", "current_duration_seconds",
                "routes_status", "synced_at", "original_route_geo_json", "match_percentage",
                "temp_geometry", "validation_status", "traffic_status", "segment_order"
            ]
            copy_cols = [c for c in new_cols_no_id if c in old_cols]
            if copy_cols:
                cols_str = ", ".join(copy_cols)
                cursor.execute(f"INSERT INTO routes_new ({cols_str}) SELECT {cols_str} FROM routes")
            cursor.execute("DROP TABLE routes")
            cursor.execute("ALTER TABLE routes_new RENAME TO routes")
            conn.commit()
            logger.info("✅ Migrated routes table to id primary key; uuid may repeat across projects.")
        except sqlite3.OperationalError as e:
            logger.error(f"⚠️ Routes migration failed: {e}")
            conn.rollback()

    # ---------------------
    # Roads
    # ---------------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS roads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            polyline TEXT NOT NULL,
            center_lat REAL,
            center_lng REAL,
            length REAL,
            is_enabled BOOLEAN DEFAULT FALSE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME, name TEXT, endpoints TEXT, start_lat REAL, start_lng REAL, end_lat REAL, end_lng REAL, min_lat REAL, max_lat REAL, min_lng REAL, max_lng REAL, is_selected BOOLEAN DEFAULT 1, priority TEXT, road_id TEXT, 
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
    """)
    
    # Create spatial indexes for performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_roads_spatial ON roads(project_id, center_lat, center_lng);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_roads_project_enabled ON roads(project_id, is_enabled);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_roads_center_lat ON roads(center_lat);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_roads_center_lng ON roads(center_lng);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_roads_start_point ON roads(project_id, start_lat, start_lng);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_roads_end_point ON roads(project_id, end_lat, end_lng);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_roads_bbox ON roads(project_id, min_lat, max_lat, min_lng, max_lng);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_roads_endpoints ON roads(start_lat, start_lng, end_lat, end_lng);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_roads_tile_query ON roads(project_id, is_enabled, deleted_at, center_lat, center_lng);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_roads_project_priority ON roads(project_id, priority);")


    # Create spatial indexes for routes table
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_routes_tag ON routes(tag);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_routes_bbox ON routes(project_id, min_lat, max_lat, min_lng, max_lng);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_routes_start_point ON routes(project_id, start_lat, start_lng);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_routes_end_point ON routes(project_id, end_lat, end_lng);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_routes_tile_query ON routes(project_id, deleted_at, parent_route_id, min_lat, max_lat, min_lng, max_lng);")

    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS update_project_timestamp_after_routes_update
    AFTER UPDATE ON routes
    FOR EACH ROW
    BEGIN
        UPDATE projects
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.project_id;
    END;
    """)

    cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS update_project_timestamp_after_routes_insert
    AFTER INSERT ON routes
    FOR EACH ROW
    BEGIN
        UPDATE projects
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.project_id;
    END;
    """)
    
    conn.commit()
    conn.close()
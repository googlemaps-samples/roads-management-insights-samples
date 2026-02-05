import sqlite3
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def column_exists(cursor, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table"""
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    return column_name in columns

def init_db():
    conn = sqlite3.connect("my_database.db")
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
    
    # Create unique indexes for projects table
    cursor.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_unique 
    ON projects(project_name) 
    WHERE deleted_at IS NULL
    """)
    
    # Only create index on google_cloud_project_id if the column exists
    # (it may not exist if migration 006 hasn't been run yet)
    if column_exists(cursor, "projects", "google_cloud_project_id"):
        cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_gcp_id_unique 
        ON projects(google_cloud_project_id) 
        WHERE deleted_at IS NULL AND google_cloud_project_id IS NOT NULL AND google_cloud_project_id != ''
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
        uuid TEXT PRIMARY KEY NOT NULL,
        project_id INTEGER NOT NULL,
        route_name TEXT NOT NULL,
        origin TEXT NOT NULL, -- JSON {lat, lng}
        destination TEXT NOT NULL, -- JSON {lat, lng}
        waypoints TEXT, -- JSON array
        center TEXT, -- JSON {lat, lng}
        encoded_polyline TEXT,
        route_type TEXT, -- 'individual' | 'polygon_import' | 'polygon_combined'
        length REAL,
        parent_route_id TEXT, -- self reference
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
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(parent_route_id) REFERENCES routes(uuid) ON DELETE SET NULL
    );
    """)
    
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
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


"""initial_postgres_schema

Revision ID: 41a6cc503c59
Revises:
Create Date: 2026-03-30 10:43:25.202930

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "41a6cc503c59"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _run(sql: str) -> None:
    op.execute(text(sql))


def upgrade() -> None:
    _run(
        """
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    distance_unit TEXT NOT NULL DEFAULT 'km',
    google_cloud_account TEXT,
    show_tooltip INTEGER NOT NULL DEFAULT 1,
    show_instructions INTEGER NOT NULL DEFAULT 1,
    route_color_mode TEXT DEFAULT 'sync_status',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""
    )
    _run(
        """
INSERT INTO users (id, distance_unit, google_cloud_account, show_tooltip, show_instructions, route_color_mode)
VALUES (1, 'km', NULL, 1, 1, 'sync_status');
"""
    )
    _run(
        "SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users));"
    )
    _run(
        """
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    project_uuid TEXT,
    project_name TEXT NOT NULL,
    jurisdiction_boundary_geojson TEXT NOT NULL,
    google_cloud_project_id TEXT,
    google_cloud_project_number TEXT,
    subscription_id TEXT,
    dataset_name TEXT,
    viewstate TEXT,
    map_snapshot TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);
"""
    )
    _run(
        """
CREATE UNIQUE INDEX idx_projects_name_unique ON projects(project_name) WHERE deleted_at IS NULL;
"""
    )
    _run(
        """
CREATE TABLE polygons (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    boundary_geojson TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);
"""
    )
    _run(
        """
CREATE TABLE routes (
    id SERIAL PRIMARY KEY,
    uuid TEXT NOT NULL,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_uuid TEXT,
    route_name TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    waypoints TEXT,
    center TEXT,
    encoded_polyline TEXT,
    route_type TEXT,
    length DOUBLE PRECISION,
    parent_route_id TEXT,
    has_children BOOLEAN DEFAULT FALSE,
    is_segmented BOOLEAN DEFAULT FALSE,
    segmentation_type TEXT,
    segmentation_points TEXT,
    segmentation_config TEXT,
    sync_status TEXT DEFAULT 'unsynced',
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    tag TEXT,
    start_lat DOUBLE PRECISION,
    start_lng DOUBLE PRECISION,
    end_lat DOUBLE PRECISION,
    end_lng DOUBLE PRECISION,
    min_lat DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    min_lng DOUBLE PRECISION,
    max_lng DOUBLE PRECISION,
    latest_data_update_time TIMESTAMP,
    static_duration_seconds DOUBLE PRECISION,
    current_duration_seconds DOUBLE PRECISION,
    routes_status TEXT,
    synced_at TIMESTAMP,
    original_route_geo_json TEXT,
    match_percentage DOUBLE PRECISION,
    temp_geometry TEXT,
    validation_status TEXT,
    traffic_status TEXT,
    segment_order INTEGER
);
"""
    )
    _run(
        """
CREATE TABLE roads (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    polyline TEXT NOT NULL,
    center_lat DOUBLE PRECISION,
    center_lng DOUBLE PRECISION,
    length DOUBLE PRECISION,
    is_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    name TEXT,
    endpoints TEXT,
    start_lat DOUBLE PRECISION,
    start_lng DOUBLE PRECISION,
    end_lat DOUBLE PRECISION,
    end_lng DOUBLE PRECISION,
    min_lat DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    min_lng DOUBLE PRECISION,
    max_lng DOUBLE PRECISION,
    is_selected BOOLEAN DEFAULT TRUE,
    priority TEXT,
    road_id TEXT
);
"""
    )
    for idx_sql in (
        "CREATE INDEX idx_roads_spatial ON roads(project_id, center_lat, center_lng);",
        "CREATE INDEX idx_roads_project_enabled ON roads(project_id, is_enabled);",
        "CREATE INDEX idx_roads_center_lat ON roads(center_lat);",
        "CREATE INDEX idx_roads_center_lng ON roads(center_lng);",
        "CREATE INDEX idx_roads_start_point ON roads(project_id, start_lat, start_lng);",
        "CREATE INDEX idx_roads_end_point ON roads(project_id, end_lat, end_lng);",
        "CREATE INDEX idx_roads_bbox ON roads(project_id, min_lat, max_lat, min_lng, max_lng);",
        "CREATE INDEX idx_roads_endpoints ON roads(start_lat, start_lng, end_lat, end_lng);",
        "CREATE INDEX idx_roads_tile_query ON roads(project_id, is_enabled, deleted_at, center_lat, center_lng);",
        "CREATE INDEX idx_roads_project_priority ON roads(project_id, priority);",
        "CREATE INDEX idx_routes_tag ON routes(tag);",
        "CREATE INDEX idx_routes_bbox ON routes(project_id, min_lat, max_lat, min_lng, max_lng);",
        "CREATE INDEX idx_routes_start_point ON routes(project_id, start_lat, start_lng);",
        "CREATE INDEX idx_routes_end_point ON routes(project_id, end_lat, end_lng);",
        "CREATE INDEX idx_routes_tile_query ON routes(project_id, deleted_at, parent_route_id, min_lat, max_lat, min_lng, max_lng);",
    ):
        _run(idx_sql)

    _run(
        """
CREATE OR REPLACE FUNCTION update_project_timestamp_fn()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.project_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""
    )
    _run(
        """
CREATE TRIGGER update_project_timestamp_after_routes_update
    AFTER UPDATE ON routes
    FOR EACH ROW
    EXECUTE FUNCTION update_project_timestamp_fn();
"""
    )
    _run(
        """
CREATE TRIGGER update_project_timestamp_after_routes_insert
    AFTER INSERT ON routes
    FOR EACH ROW
    EXECUTE FUNCTION update_project_timestamp_fn();
"""
    )


def downgrade() -> None:
    _run("DROP TRIGGER IF EXISTS update_project_timestamp_after_routes_insert ON routes;")
    _run("DROP TRIGGER IF EXISTS update_project_timestamp_after_routes_update ON routes;")
    _run("DROP FUNCTION IF EXISTS update_project_timestamp_fn();")
    _run("DROP TABLE IF EXISTS roads CASCADE;")
    _run("DROP TABLE IF EXISTS routes CASCADE;")
    _run("DROP TABLE IF EXISTS polygons CASCADE;")
    _run("DROP TABLE IF EXISTS projects CASCADE;")
    _run("DROP TABLE IF EXISTS users CASCADE;")

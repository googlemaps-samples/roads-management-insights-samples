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


from .create_engine import engine
from sqlalchemy import text

def fetch_routes_sync_status(db_project_id):
    with engine.begin() as conn:
        query = text("""
            SELECT uuid, route_name, sync_status
            FROM routes
            WHERE is_enabled = 1
              AND has_children = 0
              AND project_id = :project_id
              AND deleted_at IS NULL;
        """)
        rows = conn.execute(query, {"project_id": db_project_id}).fetchall()
        return [{"uuid": row[0], "route_name": row[1], "sync_status": row[2]} for row in rows]

def fetch_single_route_sync_status(db_project_id, uuid):
    with engine.begin() as conn:
        query = text("""
            SELECT uuid, route_name, sync_status
            FROM routes
            WHERE is_enabled = 1
              AND has_children = 0
              AND project_id = :project_id
              AND deleted_at IS NULL
              AND uuid = :uuid;
        """)
        rows = conn.execute(query, {"project_id": db_project_id, "uuid": uuid}).fetchall()
        return [{"uuid": row[0], "route_name": row[1], "sync_status": row[2]} for row in rows]

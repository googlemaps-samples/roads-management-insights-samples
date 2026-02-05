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

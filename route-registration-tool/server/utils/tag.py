from .create_engine import engine
from sqlalchemy import text
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)
logger.addHandler(ch)

def fetch_routes_by_tag(db_project_id, tag):
    """
    Fetch routes by tag. 
    Note: Empty string '' and 'Untagged' are treated as separate tags.
    Empty string '' and NULL are also treated as separate (NULL requires IS NULL check).
    """
    with engine.begin() as conn:
        query = text("""
            SELECT uuid, route_name, origin, destination, waypoints
            FROM routes
            WHERE is_enabled = 1
            AND has_children = 0
            AND project_id = :project_id
            AND deleted_at IS NULL
            AND tag = :tag;
        """)
        rows = conn.execute(query, {"project_id": db_project_id, "tag": tag}).fetchall()
    
    if not rows:
        raise HTTPException(status_code=404, detail="Tag not found.")

    return rows

def delete_routes_by_tag(db_project_id, tag):
    """
    Delete routes by tag (soft delete).
    Note: Empty string '' and 'Untagged' are treated as separate tags.
    """
    query_test = text("""
        SELECT tag FROM routes WHERE project_id = :project_id AND tag = :tag LIMIT 1;
    """)
    with engine.begin() as conn:
        rows = conn.execute(query_test, {"project_id": db_project_id, "tag": tag}).fetchone()
    if not rows:
        raise HTTPException(status_code=404, detail="Tag not found.")
    
    with engine.begin() as conn:
        query = text("""
            UPDATE routes
            SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE project_id = :project_id
            AND deleted_at IS NULL
            AND tag = :tag;
        """)
        conn.execute(query, {"project_id": db_project_id, "tag": tag})
    raise HTTPException(status_code=200, detail="Tag deleted successfully.")

def rename_tag(db_project_id, tag, new_tag):
    """
    Rename a tag to a new tag name.
    Note: Empty string '' and 'Untagged' are treated as separate tags.
    Both old and new tag values are preserved as-is (empty string stays as '', 'Untagged' stays as 'Untagged').
    """
    with engine.begin() as conn:
        verify_tag_query = text("""
            SELECT tag FROM routes WHERE project_id = :project_id AND tag = :tag LIMIT 1;
        """)
        rows = conn.execute(verify_tag_query, {"project_id": db_project_id, "tag": tag}).fetchone()
        if not rows:
            raise HTTPException(status_code=404, detail="Folder not found.")
        if rows[0] == new_tag:
            raise HTTPException(status_code=400, detail="New folder is the same as the old folder.")

        verify_new_tag_query = text("""
            SELECT tag FROM routes WHERE project_id = :project_id AND tag = :new_tag LIMIT 1;
        """)
        rows = conn.execute(verify_new_tag_query, {"project_id": db_project_id, "new_tag": new_tag}).fetchone()
        if rows:
            raise HTTPException(status_code=400, detail=f"Folder {new_tag} already exists.")

        query_rename = text("""
            UPDATE routes
            SET tag = :new_tag, updated_at = CURRENT_TIMESTAMP, synced_at = NULL, sync_status = 'unsynced',
            latest_data_update_time = NULL, static_duration_seconds = NULL, current_duration_seconds = NULL,
            routes_status = NULL, validation_status = NULL, traffic_status = NULL
            WHERE project_id = :project_id
            AND deleted_at IS NULL
            AND tag = :tag;
        """)
        conn.execute(query_rename, {"project_id": db_project_id, "tag": tag, "new_tag": new_tag})

        query_rename_deleted = text("""
            UPDATE routes
            SET tag = :new_tag, updated_at = CURRENT_TIMESTAMP
            WHERE project_id = :project_id
            AND deleted_at IS NOT NULL
            AND tag = :tag;
        """)
        conn.execute(query_rename_deleted, {"project_id": db_project_id, "tag": tag, "new_tag": new_tag})
    raise HTTPException(status_code=200, detail="Folder renamed successfully.")

def move_tag(db_project_id, tag, new_tag):
    """
    Move routes from one tag to another tag.
    Note: Empty string '' and 'Untagged' are treated as separate tags.
    Both source and destination tag values are preserved as-is.
    """
    with engine.begin() as conn:
        verify_tag_query = text("""
            SELECT tag FROM routes WHERE project_id = :project_id AND tag = :tag LIMIT 1;
        """)
        rows = conn.execute(verify_tag_query, {"project_id": db_project_id, "tag": tag}).fetchone()
        if not rows:
            raise HTTPException(status_code=404, detail=f"Folder {tag} not found.")
        verify_new_tag_query = text("""
            SELECT tag FROM routes WHERE project_id = :project_id AND tag = :new_tag LIMIT 1;
        """)
        rows = conn.execute(verify_new_tag_query, {"project_id": db_project_id, "new_tag": new_tag}).fetchone()
        if not rows:
            raise HTTPException(status_code=400, detail=f"Folder {new_tag} not found.")
        query = text("""
            UPDATE routes
            SET tag = :new_tag, updated_at = CURRENT_TIMESTAMP, synced_at = NULL, sync_status = 'unsynced',
            latest_data_update_time = NULL, static_duration_seconds = NULL, current_duration_seconds = NULL,
            routes_status = NULL, validation_status = NULL, traffic_status = NULL
            WHERE project_id = :project_id
            AND tag = :tag;
        """)
        conn.execute(query, {"project_id": db_project_id, "tag": tag, "new_tag": new_tag})

        query_move_deleted = text("""
            UPDATE routes
            SET tag = :new_tag, updated_at = CURRENT_TIMESTAMP
            WHERE project_id = :project_id
            AND deleted_at IS NOT NULL
            AND tag = :tag;
        """)
        conn.execute(query_move_deleted, {"project_id": db_project_id, "tag": tag, "new_tag": new_tag})
    raise HTTPException(status_code=200, detail="Folder moved successfully.")

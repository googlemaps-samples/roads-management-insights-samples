"""
Utility function to compute parent route sync status based on enabled children.
"""
import logging
from server.db.database import query_db
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

logger = logging.getLogger(__name__)

async def compute_parent_sync_status(parent_route_uuid: str, conn=None) -> str:
    """
    Compute the effective sync status for a parent route based on its enabled children.
    Works with both aiosqlite and SQLAlchemy async connections.
    
    Args:
        parent_route_uuid: UUID of the parent route
        conn: Database connection (optional, for use within transactions)
               Can be aiosqlite connection or SQLAlchemy AsyncConnection
    
    Returns:
        str: The computed sync status ('synced', 'invalid', or 'unsynced')
    """
    """
    Compute the effective sync status for a parent route based on its enabled children.
    
    Rules:
    - If all enabled children are 'synced' → parent = 'synced'
    - If any enabled child is 'invalid' → parent = 'invalid'
    - Otherwise → parent = 'unsynced'
    
    Args:
        parent_route_uuid: UUID of the parent route
        conn: Database connection (optional, for use within transactions)
    
    Returns:
        str: The computed sync status ('synced', 'invalid', or 'unsynced')
    """
    try:
        # Check if this is a SQLAlchemy async connection
        if isinstance(conn, AsyncConnection):
            # Use SQLAlchemy syntax
            children_query = text("""
            SELECT sync_status, is_enabled
            FROM routes
            WHERE parent_route_id = :parent_uuid
              AND deleted_at IS NULL
            """)
            result = await conn.execute(children_query, {"parent_uuid": parent_route_uuid})
            children_rows = result.fetchall()
        else:
            # Use aiosqlite syntax
            children_query = """
            SELECT sync_status, is_enabled
            FROM routes
            WHERE parent_route_id = ?
              AND deleted_at IS NULL
            """
            children_rows = await query_db(children_query, (parent_route_uuid,), conn=conn)
        
        logger.info(f"🔍 Computing parent sync status for {parent_route_uuid}: Found {len(children_rows) if children_rows else 0} children")
        
        if not children_rows:
            # No children found, return unsynced
            logger.info(f"No children found for parent route {parent_route_uuid}, returning 'unsynced'")
            return "unsynced"
        
        # Log all children for debugging and extract data
        all_children_info = []
        enabled_children = []
        child_statuses = []
        
        for row in children_rows:
            try:
                # Handle both SQLAlchemy Row and aiosqlite Row
                if isinstance(conn, AsyncConnection):
                    # SQLAlchemy row - use column name access (more reliable than index)
                    try:
                        sync_status = row.sync_status if hasattr(row, 'sync_status') else row[0]
                        is_enabled = row.is_enabled if hasattr(row, 'is_enabled') else row[1]
                    except (AttributeError, IndexError):
                        # Fallback to index access
                        sync_status = row[0] if len(row) > 0 else None
                        is_enabled = row[1] if len(row) > 1 else None
                else:
                    # aiosqlite row - use dict or attribute access
                    if hasattr(row, "keys") and "sync_status" in row.keys():
                        sync_status = row["sync_status"]
                        is_enabled = row["is_enabled"]
                    else:
                        sync_status = getattr(row, "sync_status", None)
                        is_enabled = getattr(row, "is_enabled", None)
                
                all_children_info.append((sync_status, is_enabled))
                
                # Check if enabled: could be True, 1, or truthy value
                if is_enabled is not False and is_enabled != 0 and is_enabled is not None:
                    enabled_children.append(row)
                    # Extract status
                    if sync_status is None or sync_status == "":
                        sync_status = "unsynced"
                    child_statuses.append(sync_status)
            except Exception as e:
                logger.warning(f"Error processing row data: {e}")
                all_children_info.append((None, None))
        
        logger.info(f"All children for parent {parent_route_uuid}: {all_children_info}")
        logger.info(f"Enabled children for parent {parent_route_uuid}: {len(enabled_children)} out of {len(children_rows)}")
        
        if not enabled_children:
            # No enabled children, return unsynced
            logger.info(f"No enabled children found for parent route {parent_route_uuid}, returning 'unsynced'")
            return "unsynced"
        
        logger.info(f"Child statuses for parent {parent_route_uuid}: {child_statuses}")
        logger.info(f"Child statuses (normalized) for parent {parent_route_uuid}: {[str(s).lower().strip() if s else 'none' for s in child_statuses]}")
        
        # Check if any child is invalid (case-insensitive, trimmed)
        normalized_statuses = [str(s).lower().strip() if s else "" for s in child_statuses]
        if "invalid" in normalized_statuses:
            logger.info(f"⚠️ Parent route {parent_route_uuid} has invalid children (statuses: {child_statuses}), returning 'invalid'")
            return "invalid"
        
        # Check if all children are synced
        if all(status == "synced" for status in child_statuses):
            logger.info(f"✅ All enabled children of parent route {parent_route_uuid} are synced, returning 'synced'")
            return "synced"
        
        # Otherwise, return unsynced (includes validating, failed, unsynced, etc.)
        logger.info(f"Parent route {parent_route_uuid} has mixed child statuses: {child_statuses}, returning 'unsynced'")
        return "unsynced"
        
    except Exception as e:
        logger.error(f"❌ Error computing parent sync status for {parent_route_uuid}: {str(e)}", exc_info=True)
        # On error, default to unsynced
        return "unsynced"

async def get_parent_route_uuid(child_route_uuid: str, conn=None) -> str | None:
    """
    Get the parent route UUID for a given child route.
    Works with both aiosqlite and SQLAlchemy async connections.
    
    Args:
        child_route_uuid: UUID of the child route
        conn: Database connection (optional, for use within transactions)
               Can be aiosqlite connection or SQLAlchemy AsyncConnection
    
    Returns:
        str | None: The parent route UUID if found, None otherwise
    """
    try:
        # Check if this is a SQLAlchemy async connection
        if isinstance(conn, AsyncConnection):
            # Use SQLAlchemy syntax
            query = text("""
            SELECT parent_route_id
            FROM routes
            WHERE uuid = :child_uuid
              AND parent_route_id IS NOT NULL
              AND deleted_at IS NULL
            """)
            result = await conn.execute(query, {"child_uuid": child_route_uuid})
            row = result.fetchone()
            if row:
                return row[0] if row[0] else None
            return None
        else:
            # Use aiosqlite syntax
            query = """
            SELECT parent_route_id
            FROM routes
            WHERE uuid = ?
              AND parent_route_id IS NOT NULL
              AND deleted_at IS NULL
            """
            
            result = await query_db(query, (child_route_uuid,), one=True, conn=conn)
            
            if result:
                # Try dict access first, then attribute access
                try:
                    if "parent_route_id" in result.keys():
                        parent_id = result["parent_route_id"]
                    else:
                        parent_id = getattr(result, "parent_route_id", None)
                    
                    if parent_id:
                        return parent_id
                except Exception as e:
                    logger.warning(f"Error accessing parent_route_id: {e}")
            return None
        
    except Exception as e:
        logger.error(f"Error getting parent route for child {child_route_uuid}: {str(e)}", exc_info=True)
        return None

async def update_parent_sync_status(parent_route_uuid: str, conn=None) -> None:
    """
    Compute and update the parent route's sync status based on its enabled children.
    
    Args:
        parent_route_uuid: UUID of the parent route
        conn: Database connection (optional, for use within transactions)
    """
    try:
        computed_status = await compute_parent_sync_status(parent_route_uuid, conn=conn)
        
        # Update the parent route's sync status
        if isinstance(conn, AsyncConnection):
            # Use SQLAlchemy syntax
            update_query = text("""
            UPDATE routes
            SET sync_status = :status,
                updated_at = CURRENT_TIMESTAMP
            WHERE uuid = :parent_uuid
            """)
            await conn.execute(update_query, {"status": computed_status, "parent_uuid": parent_route_uuid})
            
            # Verify the update
            verify_query = text("SELECT sync_status FROM routes WHERE uuid = :parent_uuid")
            verify_result = await conn.execute(verify_query, {"parent_uuid": parent_route_uuid})
            verify_row = verify_result.fetchone()
            actual_status = verify_row[0] if verify_row else None
        else:
            # Use aiosqlite syntax
            update_query = """
            UPDATE routes
            SET sync_status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE uuid = ?
            """
            await query_db(
                update_query,
                (computed_status, parent_route_uuid),
                conn=conn
            )
            
            # Verify the update
            verify_query = """
            SELECT sync_status FROM routes WHERE uuid = ?
            """
            verify_result = await query_db(verify_query, (parent_route_uuid,), one=True, conn=conn)
            if verify_result:
                try:
                    if "sync_status" in verify_result.keys():
                        actual_status = verify_result["sync_status"]
                    else:
                        actual_status = getattr(verify_result, "sync_status", None)
                except Exception:
                    actual_status = None
            else:
                actual_status = None
        
        logger.info(f"✅ Updated parent route {parent_route_uuid} sync status to '{computed_status}' (verified: '{actual_status}')")
        
    except Exception as e:
        logger.error(f"Error updating parent sync status for {parent_route_uuid}: {str(e)}")
        raise

def compute_parent_sync_status_sync(parent_route_uuid: str, conn) -> str:
    """
    Synchronous version to compute the effective sync status for a parent route based on its enabled children.
    Uses SQLAlchemy connection.
    
    Rules:
    - If all enabled children are 'synced' → parent = 'synced'
    - If any enabled child is 'invalid' → parent = 'invalid'
    - Otherwise → parent = 'unsynced'
    
    Args:
        parent_route_uuid: UUID of the parent route
        conn: SQLAlchemy database connection
    
    Returns:
        str: The computed sync status ('synced', 'invalid', or 'unsynced')
    """
    try:
        # Fetch all enabled children of this parent route
        children_query = text("""
        SELECT sync_status, is_enabled
        FROM routes
        WHERE parent_route_id = :parent_uuid
          AND deleted_at IS NULL
        """)
        
        children_rows = conn.execute(children_query, {"parent_uuid": parent_route_uuid}).fetchall()
        
        if not children_rows:
            # No children found, return unsynced
            logger.debug(f"No children found for parent route {parent_route_uuid}, returning 'unsynced'")
            return "unsynced"
        
        # Log all children for debugging
        logger.info(f"All children for parent {parent_route_uuid}: {[(getattr(row, 'sync_status', None), getattr(row, 'is_enabled', None)) for row in children_rows]}")
        
        # Filter to only enabled children
        # SQLAlchemy rows use attribute access, SQLite stores is_enabled as 1 (True) or 0 (False)
        enabled_children = []
        for row in children_rows:
            is_enabled = getattr(row, 'is_enabled', None)
            # Check if enabled: could be True, 1, or truthy value
            if is_enabled is not False and is_enabled != 0 and is_enabled is not None:
                enabled_children.append(row)
        
        logger.info(f"Enabled children for parent {parent_route_uuid}: {len(enabled_children)} out of {len(children_rows)}")
        
        if not enabled_children:
            # No enabled children, return unsynced
            logger.info(f"No enabled children found for parent route {parent_route_uuid}, returning 'unsynced'")
            return "unsynced"
        
        # Extract sync statuses from enabled children
        child_statuses = []
        for row in enabled_children:
            status = getattr(row, 'sync_status', None)
            if status is None:
                status = "unsynced"
            child_statuses.append(status)
        
        logger.info(f"Child statuses for parent {parent_route_uuid} (sync): {child_statuses}")
        logger.info(f"Child statuses (normalized) for parent {parent_route_uuid} (sync): {[str(s).lower().strip() if s else 'none' for s in child_statuses]}")
        
        # Check if any child is invalid (case-insensitive, trimmed)
        normalized_statuses = [str(s).lower().strip() if s else "" for s in child_statuses]
        if "invalid" in normalized_statuses:
            logger.info(f"⚠️ Parent route {parent_route_uuid} has invalid children (statuses: {child_statuses}), returning 'invalid'")
            return "invalid"
        
        # Check if all children are synced
        if all(status == "synced" for status in child_statuses):
            logger.info(f"✅ All enabled children of parent route {parent_route_uuid} are synced, returning 'synced'")
            return "synced"
        
        # Otherwise, return unsynced (includes validating, failed, unsynced, etc.)
        logger.info(f"Parent route {parent_route_uuid} has mixed child statuses: {child_statuses}, returning 'unsynced'")
        return "unsynced"
        
    except Exception as e:
        logger.error(f"Error computing parent sync status for {parent_route_uuid}: {str(e)}")
        # On error, default to unsynced
        return "unsynced"

def get_parent_route_uuid_sync(child_route_uuid: str, conn) -> str | None:
    """
    Synchronous version: Get the parent route UUID for a given child route.
    Uses SQLAlchemy connection.
    
    Args:
        child_route_uuid: UUID of the child route
        conn: SQLAlchemy database connection
    
    Returns:
        str | None: The parent route UUID if found, None otherwise
    """
    try:
        query = text("""
        SELECT parent_route_id
        FROM routes
        WHERE uuid = :child_uuid
          AND parent_route_id IS NOT NULL
          AND deleted_at IS NULL
        """)
        
        result = conn.execute(query, {"child_uuid": child_route_uuid}).fetchone()
        
        if result and result.parent_route_id:
            return result.parent_route_id
        return None
        
    except Exception as e:
        logger.error(f"Error getting parent route for child {child_route_uuid}: {str(e)}")
        return None

def update_parent_sync_status_sync(parent_route_uuid: str, conn) -> None:
    """
    Synchronous version: Compute and update the parent route's sync status based on its enabled children.
    Uses SQLAlchemy connection.
    
    Args:
        parent_route_uuid: UUID of the parent route
        conn: SQLAlchemy database connection
    """
    try:
        computed_status = compute_parent_sync_status_sync(parent_route_uuid, conn=conn)
        
        # Update the parent route's sync status
        update_query = text("""
        UPDATE routes
        SET sync_status = :status,
            updated_at = CURRENT_TIMESTAMP
        WHERE uuid = :parent_uuid
        """)
        
        conn.execute(update_query, {"status": computed_status, "parent_uuid": parent_route_uuid})
        
        logger.info(f"Updated parent route {parent_route_uuid} sync status to '{computed_status}'")
        
    except Exception as e:
        logger.error(f"Error updating parent sync status for {parent_route_uuid}: {str(e)}")
        raise


# Status mapping from sync_status to routes_status
SYNC_TO_ROUTES_STATUS = {
    "synced": "STATUS_RUNNING",
    "unsynced": None,
    "invalid": "STATUS_INVALID",
    "validating": "STATUS_VALIDATING",
}


def _compute_parent_status_from_children(child_statuses: list[str]) -> tuple[str, str | None]:
    """
    Compute parent sync_status and routes_status based on children's sync statuses.
    
    Priority logic:
    1. If ANY child is 'unsynced' -> parent = 'unsynced'
    2. If ANY child is 'invalid' -> parent = 'invalid'
    3. If ALL children are 'synced' -> parent = 'synced'
    4. Otherwise (mix of synced/validating or all validating) -> parent = 'validating'
    
    Args:
        child_statuses: List of sync_status values from enabled children
    
    Returns:
        tuple[str, str | None]: (sync_status, routes_status) for the parent
    """
    if not child_statuses:
        return "unsynced", None
    
    # Normalize statuses
    normalized = [str(s).lower().strip() if s else "unsynced" for s in child_statuses]
    
    # Priority 1: Any unsynced -> parent is unsynced
    if "unsynced" in normalized:
        return "unsynced", None
    
    # Priority 2: Any invalid -> parent is invalid
    if "invalid" in normalized:
        return "invalid", "STATUS_INVALID"
    
    # Priority 3: All synced -> parent is synced
    if all(s == "synced" for s in normalized):
        return "synced", "STATUS_RUNNING"
    
    # Priority 4: Otherwise (mix of synced/validating or all validating) -> validating
    return "validating", "STATUS_VALIDATING"


async def batch_update_parent_sync_statuses(project_id: int, conn=None) -> dict:
    """
    Batch update all parent routes' sync statuses for a project in one operation.
    
    This is much more efficient than updating each parent route individually
    as it fetches all relevant routes in one query and performs a batch update.
    
    Args:
        project_id: The project ID to update parent routes for
        conn: Database connection (optional, SQLAlchemy AsyncConnection)
    
    Returns:
        dict: Statistics about the batch update operation
    """
    from .create_engine import async_engine
    
    stats = {"parents_updated": 0, "parents_found": 0, "children_processed": 0}
    
    try:
        # Determine if we need to create our own connection
        should_close_conn = conn is None
        if conn is None:
            conn = await async_engine.connect()
        
        try:
            # Step 1: Fetch all relevant routes in one query
            # Routes where (parent_route_id IS NOT NULL OR is_segmented = 1) AND enabled AND not deleted
            fetch_query = text("""
            SELECT uuid, parent_route_id, sync_status, is_segmented, is_enabled
            FROM routes
            WHERE project_id = :project_id
              AND deleted_at IS NULL
              AND is_enabled = 1
              AND (parent_route_id IS NOT NULL OR is_segmented = 1)
            """)
            
            result = await conn.execute(fetch_query, {"project_id": project_id})
            rows = result.fetchall()
            
            if not rows:
                logger.info(f"No parent/child routes found for project {project_id}")
                return stats
            
            # Step 2: Build parent-to-children mapping
            parent_uuids = set()  # UUIDs of parent routes (is_segmented = 1)
            parent_to_children: dict[str, list[str]] = {}  # parent_uuid -> list of child sync_statuses
            
            for row in rows:
                uuid = row.uuid if hasattr(row, 'uuid') else row[0]
                parent_route_id = row.parent_route_id if hasattr(row, 'parent_route_id') else row[1]
                sync_status = row.sync_status if hasattr(row, 'sync_status') else row[2]
                is_segmented = row.is_segmented if hasattr(row, 'is_segmented') else row[3]
                
                # Track parent routes
                if is_segmented:
                    parent_uuids.add(uuid)
                
                # Group children by parent
                if parent_route_id:
                    if parent_route_id not in parent_to_children:
                        parent_to_children[parent_route_id] = []
                    parent_to_children[parent_route_id].append(sync_status or "unsynced")
                    stats["children_processed"] += 1
            
            stats["parents_found"] = len(parent_uuids)
            
            if not parent_to_children:
                logger.info(f"No child routes found for project {project_id}")
                return stats
            
            # Step 3: Compute each parent's status
            updates = []
            for parent_uuid in parent_uuids:
                child_statuses = parent_to_children.get(parent_uuid, [])
                if child_statuses:
                    sync_status, routes_status = _compute_parent_status_from_children(child_statuses)
                    updates.append({
                        "uuid": parent_uuid,
                        "sync_status": sync_status,
                        "routes_status": routes_status,
                    })
                    logger.debug(f"Parent {parent_uuid}: children={child_statuses} -> sync_status={sync_status}")
            
            # Step 4: Batch UPDATE all parent routes
            if updates:
                update_query = text("""
                UPDATE routes
                SET sync_status = :sync_status,
                    routes_status = :routes_status,
                    updated_at = CURRENT_TIMESTAMP
                WHERE uuid = :uuid
                """)
                
                for update in updates:
                    await conn.execute(update_query, update)
                
                # Commit if we're in a transaction context
                if hasattr(conn, 'commit'):
                    await conn.commit()
                
                stats["parents_updated"] = len(updates)
                logger.info(f"✅ Batch updated {len(updates)} parent routes for project {project_id}")
            
        finally:
            if should_close_conn and conn is not None:
                await conn.close()
        
        return stats
        
    except Exception as e:
        logger.error(f"❌ Error in batch_update_parent_sync_statuses for project {project_id}: {str(e)}", exc_info=True)
        return stats


def batch_update_parent_sync_statuses_sync(project_id: int, conn) -> dict:
    """
    Synchronous version: Batch update all parent routes' sync statuses for a project.
    
    This is much more efficient than updating each parent route individually
    as it fetches all relevant routes in one query and performs a batch update.
    
    Args:
        project_id: The project ID to update parent routes for
        conn: SQLAlchemy database connection
    
    Returns:
        dict: Statistics about the batch update operation
    """
    stats = {"parents_updated": 0, "parents_found": 0, "children_processed": 0}
    
    try:
        # Step 1: Fetch all relevant routes in one query
        fetch_query = text("""
        SELECT uuid, parent_route_id, sync_status, is_segmented, is_enabled
        FROM routes
        WHERE project_id = :project_id
          AND deleted_at IS NULL
          AND is_enabled = 1
          AND (parent_route_id IS NOT NULL OR is_segmented = 1)
        """)
        
        rows = conn.execute(fetch_query, {"project_id": project_id}).fetchall()
        
        if not rows:
            logger.info(f"No parent/child routes found for project {project_id}")
            return stats
        
        # Step 2: Build parent-to-children mapping
        parent_uuids = set()  # UUIDs of parent routes (is_segmented = 1)
        parent_to_children: dict[str, list[str]] = {}  # parent_uuid -> list of child sync_statuses
        
        for row in rows:
            uuid = getattr(row, 'uuid', row[0])
            parent_route_id = getattr(row, 'parent_route_id', row[1])
            sync_status = getattr(row, 'sync_status', row[2])
            is_segmented = getattr(row, 'is_segmented', row[3])
            
            # Track parent routes
            if is_segmented:
                parent_uuids.add(uuid)
            
            # Group children by parent
            if parent_route_id:
                if parent_route_id not in parent_to_children:
                    parent_to_children[parent_route_id] = []
                parent_to_children[parent_route_id].append(sync_status or "unsynced")
                stats["children_processed"] += 1
        
        stats["parents_found"] = len(parent_uuids)
        
        if not parent_to_children:
            logger.info(f"No child routes found for project {project_id}")
            return stats
        
        # Step 3: Compute each parent's status
        updates = []
        for parent_uuid in parent_uuids:
            child_statuses = parent_to_children.get(parent_uuid, [])
            if child_statuses:
                sync_status, routes_status = _compute_parent_status_from_children(child_statuses)
                updates.append({
                    "uuid": parent_uuid,
                    "sync_status": sync_status,
                    "routes_status": routes_status,
                })
                logger.debug(f"Parent {parent_uuid}: children={child_statuses} -> sync_status={sync_status}")
        
        # Step 4: Batch UPDATE all parent routes
        if updates:
            update_query = text("""
            UPDATE routes
            SET sync_status = :sync_status,
                routes_status = :routes_status,
                updated_at = CURRENT_TIMESTAMP
            WHERE uuid = :uuid
            """)
            
            for update in updates:
                conn.execute(update_query, update)
            
            stats["parents_updated"] = len(updates)
            logger.info(f"✅ Batch updated {len(updates)} parent routes for project {project_id}")
        
        return stats
        
    except Exception as e:
        logger.error(f"❌ Error in batch_update_parent_sync_statuses_sync for project {project_id}: {str(e)}", exc_info=True)
        return stats
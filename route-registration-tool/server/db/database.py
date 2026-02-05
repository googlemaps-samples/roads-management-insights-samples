import aiosqlite
import asyncio
import logging
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

DB = "my_database.db"

@asynccontextmanager
async def get_db_transaction():
    """Get a database connection with transaction support"""
    conn = None
    try:
        conn = await aiosqlite.connect(DB)
        conn.row_factory = aiosqlite.Row
        try:
            yield conn
            await conn.commit()
        except Exception as e:
            if conn:
                try:
                    await conn.rollback()
                except (RuntimeError, asyncio.CancelledError):
                    # Event loop is closed, ignore rollback errors during shutdown
                    pass
            raise
    finally:
        if conn:
            try:
                await conn.close()
            except (RuntimeError, asyncio.CancelledError):
                # Event loop is closed, ignore close errors during shutdown
                pass

async def query_db(query, args=(), one=False, commit=False, conn=None):
    """Async helper to run queries against SQLite"""
    try:
        if conn:
            # Use existing connection (within transaction)
            async with conn.execute(query, args) as cur:
                if commit:
                    return cur.lastrowid
                rows = await cur.fetchall()
                return (rows[0] if rows else None) if one else rows
        else:
            # Create new connection
            async with aiosqlite.connect(DB) as conn:
                conn.row_factory = aiosqlite.Row
                async with conn.execute(query, args) as cur:
                    if commit:
                        await conn.commit()
                        return cur.lastrowid
                    rows = await cur.fetchall()
                    return (rows[0] if rows else None) if one else rows
    except (RuntimeError, asyncio.CancelledError) as e:
        # Event loop is closed or cancelled - this happens during shutdown
        # Log but don't raise to avoid noise in logs
        if "Event loop is closed" not in str(e) and "CancelledError" not in str(type(e).__name__):
            logger.warning(f"Database query error during shutdown: {e}")
        # Return appropriate default values
        if one:
            return None
        return []
    except Exception as e:
        # Re-raise other exceptions
        logger.error(f"Database query error: {e}")
        raise
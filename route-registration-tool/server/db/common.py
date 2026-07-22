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

import asyncio
import logging
import os
import re
import urllib.parse
import uuid
from contextlib import asynccontextmanager
from typing import Any, Protocol

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config (DATABASE_URL)
# ---------------------------------------------------------------------------

# Workspace root for this service (the directory that contains `alembic.ini` and `.env`).
# This file lives at `server/db/common.py`, so go up two levels: db -> server -> project root.
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _is_cloud_run() -> bool:
    # Cloud Run sets K_SERVICE and K_REVISION.
    return bool(os.environ.get("K_SERVICE") or os.environ.get("K_REVISION"))


def _default_sqlite_async_url() -> str:
    # Cloud Run's writable filesystem location is /tmp.
    # Using /app (image layer) can be read-only at runtime.
    if _is_cloud_run():
        db_path = os.path.join("/tmp", "my_database.db")
    else:
        db_path = os.path.join(_PROJECT_ROOT, "my_database.db")
    return f"sqlite+aiosqlite:///{db_path}"


def _normalize_cloudsql_socket_host(url: str) -> str:
    """
    Ensure Cloud SQL socket paths in `host=` are *not* percent-encoded.

    SQLAlchemy's URL rendering percent-encodes '/' and ':' in query params,
    which can break libpq/psycopg if it receives `host=%2Fcloudsql%2F...`.
    """
    if "host=" not in url:
        return url
    # Only unquote the host= value; keep other query params untouched.
    def _repl(m: re.Match) -> str:
        prefix = m.group(1)
        value = m.group(2)
        decoded = urllib.parse.unquote(value)
        return f"{prefix}{decoded}"

    return re.sub(r"(\bhost=)([^&]+)", _repl, url)


def get_database_urls() -> tuple[str, str]:
    """Return (async_sqlalchemy_url, sync_sqlalchemy_url)."""
    raw_env = os.environ.get("DATABASE_URL")
    raw = raw_env if raw_env is not None else _default_sqlite_async_url()
    # Cloud Run / CI sometimes injects quoted env vars (e.g. `"postgresql+asyncpg://..."`)
    # or an empty string. Normalize these to avoid crashing at import time.
    raw = str(raw).strip()
    if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
        raw = raw[1:-1].strip()
    if not raw:
        raw = _default_sqlite_async_url()

    try:
        u = make_url(raw)
    except Exception as e:
        # Avoid killing the whole app due to a malformed env var. Fall back to SQLite
        # while surfacing a clear log message for operators.
        logger.error(
            "Invalid DATABASE_URL provided (%s). Falling back to default SQLite DB.",
            e,
        )
        raw = _default_sqlite_async_url()
        u = make_url(raw)
    if u.drivername == "postgresql+asyncpg":
        sync = u.set(drivername="postgresql+psycopg")
        async_url = u.render_as_string(hide_password=False)
        sync_url = sync.render_as_string(hide_password=False)
        return _normalize_cloudsql_socket_host(async_url), _normalize_cloudsql_socket_host(
            sync_url
        )
    if u.drivername == "sqlite+aiosqlite":
        sync = u.set(drivername="sqlite")
        return str(u), str(sync)
    raise ValueError(
        f"Unsupported DATABASE_URL driver {u.drivername!r}; "
        "use postgresql+asyncpg:// or sqlite+aiosqlite://"
    )


def is_sqlite_file_database(async_url: str | None = None) -> bool:
    """True when using on-disk SQLite (not in-memory)."""
    if async_url is None:
        async_url = get_database_urls()[0]
    u = make_url(async_url)
    if u.drivername != "sqlite+aiosqlite":
        return False
    database = u.database or ""
    if database in ("", ":memory:") or database.startswith("file::memory"):
        return False
    return True


def get_sqlite_filesystem_path(async_url: str | None = None) -> str | None:
    """Absolute path for SQLite file DB, or None for in-memory / non-sqlite."""
    if async_url is None:
        async_url = get_database_urls()[0]
    u = make_url(async_url)
    if u.drivername != "sqlite+aiosqlite":
        return None
    database = u.database or ""
    if database in ("", ":memory:") or database.startswith("file::memory"):
        return None
    if os.path.isabs(database):
        return database
    return os.path.abspath(os.path.join(_PROJECT_ROOT, database))


def get_database_path() -> str:
    """Legacy filesystem path used when SQLite file mode is active."""
    p = get_sqlite_filesystem_path()
    if p is not None:
        return p
    # Keep legacy behavior locally, but make Cloud Run writable by default.
    if _is_cloud_run():
        return os.path.join("/tmp", "my_database.db")
    return os.path.join(_PROJECT_ROOT, "my_database.db")


# ---------------------------------------------------------------------------
# SQL param helpers
# ---------------------------------------------------------------------------


def prepare_text(
    query: str, args: tuple[Any, ...] | list[Any] | dict[str, Any]
) -> tuple[str, dict[str, Any]]:
    """Return (query, bind dict) for SQLAlchemy ``text()``."""
    if isinstance(args, dict):
        return query, dict(args)
    if not isinstance(args, (tuple, list)):
        raise TypeError(f"args must be dict, tuple, or list, got {type(args).__name__}")
    tup = tuple(args)
    qmarks = query.count("?")
    if qmarks != len(tup):
        raise ValueError(
            f"Placeholder count mismatch: {qmarks} '?' in query, {len(tup)} parameters"
        )
    if qmarks == 0:
        return query, {}
    parts = query.split("?")
    out: list[str] = []
    params: dict[str, Any] = {}
    for i, part in enumerate(parts[:-1]):
        out.append(part)
        pname = f"p{i}"
        out.append(f":{pname}")
        params[pname] = tup[i]
    out.append(parts[-1])
    return "".join(out), params


# ---------------------------------------------------------------------------
# DB access (async SQLAlchemy)
# ---------------------------------------------------------------------------

_async_url, _ = get_database_urls()
async_engine = create_async_engine(_async_url, pool_pre_ping=True)

# Legacy: path to SQLite file when using default SQLite URL
DB = get_database_path()


class QueryRow:
    """Row adapter that supports both key- and index-based access."""

    def __init__(self, raw_row):
        self._raw_row = raw_row
        self._mapping = getattr(raw_row, "_mapping", None)

    def __getitem__(self, key):
        if isinstance(key, str):
            if self._mapping is not None:
                return self._mapping[key]
            raise TypeError("tuple indices must be integers or slices, not str")
        return self._raw_row[key]

    def keys(self):
        if self._mapping is not None:
            return self._mapping.keys()
        return ()

    def get(self, key, default=None):
        if self._mapping is None:
            return default
        return self._mapping.get(key, default)

    def __iter__(self):
        return iter(self._raw_row)

    def __len__(self):
        return len(self._raw_row)


def _adapt_row(raw_row):
    if raw_row is None:
        return None
    if isinstance(raw_row, dict):
        return raw_row
    return QueryRow(raw_row)


@asynccontextmanager
async def get_db_transaction():
    """Async connection with an open transaction (commit/rollback on exit)."""
    async with async_engine.connect() as conn:
        async with conn.begin():
            yield conn


async def query_db(query, args=(), one=False, commit=False, conn=None):
    """Run SQL via SQLAlchemy async; tuple/list args use ``?`` → named binds."""
    is_insert = str(query).lstrip().lower().startswith("insert")
    is_postgres = str(async_engine.url.drivername).startswith("postgresql")

    try:
        if isinstance(args, dict):
            stmt = text(query)
            bind_params = args
        else:
            q, bind_params = prepare_text(query, args)
            stmt = text(q)

        async def _execute(c: AsyncConnection):
            result = await c.execute(stmt, bind_params)
            if commit:
                # Support INSERT/UPDATE/DELETE ... RETURNING ...
                # This is the most reliable way to get generated IDs in Postgres.
                if getattr(result, "returns_rows", False):
                    try:
                        return result.scalar_one()
                    except Exception:
                        try:
                            return result.scalar()
                        except Exception:
                            pass

                lr = getattr(result, "lastrowid", None)
                if lr is not None:
                    return lr
                if is_insert and is_postgres:
                    try:
                        ipk = result.inserted_primary_key
                        if ipk is not None and len(ipk) == 1 and ipk[0] is not None:
                            return ipk[0]
                    except Exception:
                        pass
                    # Avoid `lastval()` here; it fails if no sequence was used in this session.
                    return None

                try:
                    ipk = result.inserted_primary_key
                    if ipk is not None and len(ipk) == 1 and ipk[0] is not None:
                        return ipk[0]
                except Exception:
                    pass
                return None

            if not getattr(result, "returns_rows", False):
                return None if one else []
            rows = result.fetchall()
            if one:
                return _adapt_row(rows[0]) if rows else None
            return [_adapt_row(r) for r in rows]

        if conn is not None:
            return await _execute(conn)
        if commit:
            async with async_engine.begin() as c:
                return await _execute(c)
        async with async_engine.connect() as c:
            return await _execute(c)

    except (RuntimeError, asyncio.CancelledError) as e:
        if "Event loop is closed" not in str(e) and "CancelledError" not in str(
            type(e).__name__
        ):
            logger.warning(f"Database query error during shutdown: {e}")
        return None if one else []
    except Exception as e:
        logger.exception(f"Database query error: {e}")
        raise


async def dispose_async_engine() -> None:
    await async_engine.dispose()


# ---------------------------------------------------------------------------
# Backend interface + factory
# ---------------------------------------------------------------------------


class DBBackend(Protocol):
    name: str

    def init_on_startup(self) -> None:
        """Ensure schema exists for this database (DDL / migrations)."""


def get_backend():
    """Return a DB backend implementation based on DATABASE_URL."""
    async_url, _ = get_database_urls()
    u = make_url(async_url)

    if u.drivername == "sqlite+aiosqlite":
        from server.db.sqlite import SQLiteBackend

        return SQLiteBackend()

    if u.drivername == "postgresql+asyncpg":
        from server.db.postgres import PostgresBackend

        return PostgresBackend()

    raise ValueError(f"Unsupported DATABASE_URL driver: {u.drivername!r}")


# ---------------------------------------------------------------------------
# Repo/domain errors and shared SQL strings
# ---------------------------------------------------------------------------


class ProjectRepoDomainError(Exception):
    """Base domain error for the projects repository layer."""

    status_code: int = 500
    detail: str
    debug_message: str | None

    def __init__(self, detail: str, debug_message: str | None = None):
        super().__init__(detail)
        self.status_code = int(getattr(self, "status_code", 500))
        self.detail = detail
        self.debug_message = debug_message


class ProjectNameConflict(ProjectRepoDomainError):
    status_code = 400


class GoogleCloudProjectIdConflict(ProjectRepoDomainError):
    status_code = 400


SQL_ROADS_LIST_BY_PROJECT_ID = """
SELECT id, project_id, polyline, center_lat, center_lng, length, is_enabled, name,
       created_at, updated_at, is_selected
FROM roads
WHERE project_id = ? AND deleted_at IS NULL
ORDER BY created_at DESC
"""

SQL_ROADS_SELECT_FOR_POLYGON_SELECTION_BASE = """
SELECT
    id,
    project_id,
    polyline,
    center_lat,
    center_lng,
    length,
    is_enabled,
    name,
    created_at,
    updated_at,
    is_selected
FROM roads
WHERE project_id = ?
  AND deleted_at IS NULL
  AND COALESCE(is_enabled, FALSE) = TRUE
  AND max_lat >= ?
  AND min_lat <= ?
  AND max_lng >= ?
  AND min_lng <= ?
"""

SQL_ROADS_GET_BY_ID = """
SELECT id, project_id, polyline, center_lat, center_lng, length, is_enabled, name,
       created_at, updated_at, is_selected
FROM roads
WHERE id = ? AND deleted_at IS NULL
"""

SQL_ROADS_CHECK_EXISTS_BY_ID = (
    "SELECT id, project_id FROM roads WHERE id = ? AND deleted_at IS NULL"
)

SQL_ROADS_SOFT_DELETE_BY_ID = """
UPDATE roads
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE id = ?
"""


def sql_roads_update_set_clause(set_clause_sql: str) -> str:
    return f"""
    UPDATE roads
    SET {set_clause_sql}
    WHERE id = ?
    """


SQL_USERS_PREFERENCES_GET = """
SELECT id, distance_unit, google_cloud_account, show_tooltip, route_color_mode, show_instructions, created_at, updated_at
FROM users
WHERE id = 1
"""

SQL_USERS_PREFERENCES_CREATE_DEFAULT = """
INSERT INTO users (id, distance_unit, google_cloud_account, show_tooltip, show_instructions,route_color_mode)
VALUES (1, 'km', NULL, 1, 1,'sync_status')
"""


def sql_users_update_set_clause(set_clause_sql: str) -> str:
    return f"""
    UPDATE users
    SET {set_clause_sql}
    WHERE id = ?
    """


SQL_TILES_CANDIDATE_ROADS = """
SELECT id, polyline, length, is_enabled, center_lat, center_lng, name , priority
FROM roads
WHERE project_id = ?
  AND deleted_at IS NULL
  AND center_lat BETWEEN ? AND ?
  AND center_lng BETWEEN ? AND ?
  AND COALESCE(is_enabled, FALSE) = TRUE
ORDER BY length DESC
"""

SQL_TILES_CANDIDATE_ROUTES = """
SELECT uuid, route_name, encoded_polyline, sync_status, is_enabled,
       origin, destination, waypoints, length, start_lat, start_lng, end_lat, end_lng,
       tag, created_at, updated_at, project_id, route_type , current_duration_seconds, static_duration_seconds , traffic_status , latest_data_update_time , synced_at
FROM routes
WHERE project_id = ?
  AND deleted_at IS NULL
  AND encoded_polyline IS NOT NULL
  AND min_lat <= ?
  AND max_lat >= ?
  AND min_lng <= ?
  AND max_lng >= ?
  AND parent_route_id IS NULL
ORDER BY length DESC
"""


def _extract_sqlstate(exc: BaseException) -> str | None:
    candidates: list[Any] = [
        getattr(exc, "sqlstate", None),
        getattr(getattr(exc, "orig", None), "sqlstate", None),
        getattr(getattr(getattr(exc, "orig", None), "orig", None), "sqlstate", None),
        getattr(getattr(exc, "__cause__", None), "sqlstate", None),
        getattr(getattr(exc, "__context__", None), "sqlstate", None),
    ]
    for c in candidates:
        if isinstance(c, str) and c:
            return c

    m = re.search(r"SQLSTATE\\s*[:=]?\\s*'?([0-9A-Z]{5})'?", str(exc))
    if m:
        return m.group(1)
    return None


def _row_get(row: Any, *, key: str, index: int) -> Any:
    try:
        return row[key]
    except Exception:
        mapping = getattr(row, "_mapping", None)
        if mapping is not None:
            try:
                return mapping[key]
            except Exception:
                pass
    return row[index]


async def get_project_row(project_id: int) -> Any | None:
    query = """
    SELECT id, project_uuid, project_name, jurisdiction_boundary_geojson,
           google_cloud_project_id, google_cloud_project_number, subscription_id,
           dataset_name, viewstate, map_snapshot, created_at, updated_at, deleted_at,
           session_id
    FROM projects
    WHERE id = ? AND deleted_at IS NULL
    """
    return await query_db(query, (project_id,), one=True)


async def list_project_rows() -> list[Any]:
    query = """
    SELECT id, project_uuid, project_name, jurisdiction_boundary_geojson,
           google_cloud_project_id, google_cloud_project_number, subscription_id,
           dataset_name, viewstate, map_snapshot, created_at, updated_at, deleted_at,
           session_id
    FROM projects
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    """
    return await query_db(query)


async def list_project_rows_paginated(
    *,
    page: int,
    limit: int,
    search: str | None = None,
    session_ids: list[str] | None = None,
) -> tuple[list[Any], int]:
    offset = (page - 1) * limit
    like = f"%{(search or '').strip()}%"

    session_filter_sql = ""
    session_filter_args: tuple[Any, ...] = ()
    if session_ids is not None:
        if not session_ids:
            return [], 0
        placeholders = ",".join("?" for _ in session_ids)
        session_filter_sql = f" AND session_id IN ({placeholders})"
        session_filter_args = tuple(session_ids)

    rows_query = f"""
    SELECT id, project_uuid, project_name, jurisdiction_boundary_geojson,
           google_cloud_project_id, google_cloud_project_number, subscription_id,
           dataset_name, viewstate, map_snapshot, created_at, updated_at, deleted_at,
           session_id
    FROM projects
    WHERE deleted_at IS NULL
      AND (? = '%%' OR LOWER(project_name) LIKE LOWER(?))
      {session_filter_sql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
    """
    count_query = f"""
    SELECT COUNT(*) AS total
    FROM projects
    WHERE deleted_at IS NULL
      AND (? = '%%' OR LOWER(project_name) LIKE LOWER(?))
      {session_filter_sql}
    """

    rows_args = (like, like) + session_filter_args + (limit, offset)
    count_args = (like, like) + session_filter_args
    rows = await query_db(rows_query, rows_args)
    total_row = await query_db(count_query, count_args, one=True)
    total = _row_get(total_row, key="total", index=0) if total_row else 0
    return rows, int(total or 0)


async def get_routes_summaries_by_project_ids(
    project_ids: list[int],
) -> dict[int, dict[str, int]]:
    if not project_ids:
        return {}
    placeholders = ",".join("?" for _ in project_ids)
    query = f"""
    SELECT project_id, type, count FROM (
        SELECT project_id, 'total' AS type, COUNT(*) AS count
        FROM routes
        WHERE project_id IN ({placeholders})
          AND deleted_at IS NULL
          AND COALESCE(has_children, FALSE) = FALSE
        GROUP BY project_id
        UNION ALL
        SELECT project_id, 'deleted' AS type, COUNT(*) AS count
        FROM routes
        WHERE project_id IN ({placeholders})
          AND deleted_at IS NOT NULL
          AND COALESCE(is_segmented, FALSE) = FALSE
          AND sync_status IN ('synced', 'validating', 'invalid')
        GROUP BY project_id
        UNION ALL
        SELECT project_id, 'added' AS type, COUNT(*) AS count
        FROM routes
        WHERE project_id IN ({placeholders})
          AND deleted_at IS NULL
          AND sync_status = 'unsynced'
          AND COALESCE(is_enabled, FALSE) = TRUE
          AND COALESCE(has_children, FALSE) = FALSE
        GROUP BY project_id
    ) s
    """
    args = tuple(project_ids) + tuple(project_ids) + tuple(project_ids)
    rows = await query_db(query, args)
    out: dict[int, dict[str, int]] = {
        pid: {"total": 0, "deleted": 0, "added": 0} for pid in project_ids
    }
    for row in rows:
        pid = int(_row_get(row, key="project_id", index=0))
        row_type = str(_row_get(row, key="type", index=1))
        count = int(_row_get(row, key="count", index=2) or 0)
        if pid in out and row_type in out[pid]:
            out[pid][row_type] = count
    return out


async def create_project(
    *,
    project_name: str,
    jurisdiction_boundary_geojson: str,
    google_cloud_project_id: str | None = None,
    google_cloud_project_number: str | None = None,
    subscription_id: str | None = None,
    dataset_name: str | None = None,
    enable_multitenant: bool,
    project_uuid: str | None = None,
    viewstate_json: str | None = None,
    session_id: str | None = None,
) -> Any:
    # Names are unique per session; unscoped rows (session_id NULL) stay globally unique by name.
    if session_id is not None:
        existing_name_query = """
        SELECT id FROM projects
        WHERE project_name = ? AND deleted_at IS NULL AND session_id = ?
        """
        existing_name = await query_db(
            existing_name_query, (project_name, session_id), one=True
        )
    else:
        existing_name_query = """
        SELECT id FROM projects
        WHERE project_name = ? AND deleted_at IS NULL AND session_id IS NULL
        """
        existing_name = await query_db(existing_name_query, (project_name,), one=True)
    if existing_name:
        raise ProjectNameConflict(
            detail=(
                f"A project with the name '{project_name}' already exists. "
                "Please choose a different name."
            )
        )

    if not enable_multitenant and google_cloud_project_id:
        existing_gcp_query = """
        SELECT id, project_name FROM projects
        WHERE google_cloud_project_id = ? AND deleted_at IS NULL
        """
        existing_gcp = await query_db(
            existing_gcp_query, (google_cloud_project_id,), one=True
        )
        if existing_gcp:
            existing_project_name = _row_get(existing_gcp, key="project_name", index=1)
            raise GoogleCloudProjectIdConflict(
                detail=(
                    f"A project with Google Cloud Project ID '{google_cloud_project_id}' already exists "
                    f"(Project: '{existing_project_name}'). Each GCP project can only be used once."
                )
            )

    if viewstate_json is None:
        from server.utils.viewstate_calculator import calculate_viewstate

        try:
            viewstate = calculate_viewstate(jurisdiction_boundary_geojson)
            import json as _json

            viewstate_json = _json.dumps(viewstate)
        except Exception:
            viewstate_json = None

    project_uuid_val = project_uuid if project_uuid is not None else str(uuid.uuid4())

    if session_id is not None:
        # Ensure session exists for FK (idempotent).
        await query_db(
            """
            INSERT INTO sessions (id)
            VALUES (?)
            ON CONFLICT(id) DO NOTHING
            """,
            (session_id,),
            commit=True,
        )
    is_postgres = str(async_engine.url.drivername).startswith("postgresql")
    returning_sql = " RETURNING id" if is_postgres else ""
    insert_query = f"""
    INSERT INTO projects (
        session_id, project_uuid, project_name, jurisdiction_boundary_geojson, viewstate,
        google_cloud_project_id, google_cloud_project_number, subscription_id, dataset_name
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    {returning_sql}
    """

    try:
        project_id = await query_db(
            insert_query,
            (
                session_id,
                project_uuid_val,
                project_name,
                jurisdiction_boundary_geojson,
                viewstate_json,
                google_cloud_project_id,
                google_cloud_project_number,
                subscription_id,
                dataset_name,
            ),
            commit=True,
        )
    except Exception as exc:
        if _extract_sqlstate(exc) == "23505":
            raise ProjectNameConflict(
                detail=(
                    f"A project with the name '{project_name}' already exists. "
                    "Please choose a different name."
                )
            ) from exc
        raise

    return await get_project_row(int(project_id))


__all__ = [
    # config
    "get_database_urls",
    "is_sqlite_file_database",
    "get_sqlite_filesystem_path",
    "get_database_path",
    # backend factory
    "DBBackend",
    "get_backend",
    # db
    "DB",
    "async_engine",
    "get_db_transaction",
    "query_db",
    "dispose_async_engine",
    # sql params
    "prepare_text",
    # repo errors
    "ProjectRepoDomainError",
    "ProjectNameConflict",
    "GoogleCloudProjectIdConflict",
    # shared sql
    "SQL_ROADS_LIST_BY_PROJECT_ID",
    "SQL_ROADS_SELECT_FOR_POLYGON_SELECTION_BASE",
    "SQL_ROADS_GET_BY_ID",
    "SQL_ROADS_CHECK_EXISTS_BY_ID",
    "SQL_ROADS_SOFT_DELETE_BY_ID",
    "sql_roads_update_set_clause",
    "SQL_USERS_PREFERENCES_GET",
    "SQL_USERS_PREFERENCES_CREATE_DEFAULT",
    "sql_users_update_set_clause",
    "SQL_TILES_CANDIDATE_ROADS",
    "SQL_TILES_CANDIDATE_ROUTES",
    # repo functions
    "get_project_row",
    "list_project_rows",
    "list_project_rows_paginated",
    "get_routes_summaries_by_project_ids",
    "create_project",
]


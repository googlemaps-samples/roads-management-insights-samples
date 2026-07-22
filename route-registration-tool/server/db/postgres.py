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


def init_db_postgres() -> None:
    """Apply Alembic migrations to PostgreSQL.

    Requires `DATABASE_URL` to be a Postgres async driver URL (e.g. `postgresql+asyncpg://...`).
    """

    import logging
    import os
    import time

    from alembic import command
    from alembic.config import Config

    import psycopg

    from server.db.common import get_database_urls
    from sqlalchemy.engine import make_url

    logger = logging.getLogger(__name__)

    # ---------------------------------------------------------------------
    # Advisory lock to prevent concurrent migrations
    # ---------------------------------------------------------------------
    # Alembic is idempotent (it won't re-run applied revisions), but multiple
    # Cloud Run instances can start at once and all attempt DDL. This lock
    # ensures only one instance migrates at a time.
    lock_key = int(os.getenv("MIGRATION_ADVISORY_LOCK_KEY", "4242424242"))
    lock_timeout_s = float(os.getenv("MIGRATION_LOCK_TIMEOUT_SECONDS", "10"))
    poll_s = float(os.getenv("MIGRATION_LOCK_POLL_INTERVAL_SECONDS", "0.5"))
    skip_if_locked = os.getenv("MIGRATION_SKIP_IF_LOCKED", "true").lower().strip() in (
        "true",
        "1",
        "yes",
        "on",
    )
    connect_timeout_s = float(os.getenv("MIGRATION_CONNECT_TIMEOUT_SECONDS", "5"))

    _, sync_url = get_database_urls()
    # get_database_urls() returns a SQLAlchemy sync URL (postgresql+psycopg://...),
    # but psycopg.connect expects a standard libpq DSN (postgresql://...).
    u = make_url(sync_url)
    if u.drivername == "postgresql+psycopg":
        u = u.set(drivername="postgresql")
    psycopg_dsn = u.render_as_string(hide_password=False)
    deadline = time.time() + max(lock_timeout_s, 0.0)

    def _try_acquire(conn: psycopg.Connection) -> bool:
        row = conn.execute("SELECT pg_try_advisory_lock(%s)", (lock_key,)).fetchone()
        return bool(row and row[0])

    logger.info(
        "Attempting to acquire migration lock (key=%s, timeout=%.1fs).",
        lock_key,
        lock_timeout_s,
    )

    try:
        with psycopg.connect(psycopg_dsn, connect_timeout=connect_timeout_s) as conn:
            acquired = False
            while True:
                acquired = _try_acquire(conn)
                if acquired:
                    break
                if time.time() >= deadline:
                    break
                time.sleep(max(poll_s, 0.05))

            if not acquired:
                msg = (
                    "Migration lock not acquired (another instance may be migrating). "
                    "Skipping Alembic migrations for this instance."
                )
                if skip_if_locked:
                    logger.warning(msg)
                    return
                raise TimeoutError(msg)

            logger.info("Migration lock acquired; proceeding with Alembic.")

            # This file lives at: route-registration-tool/server/db/postgres.py
            # So we need to go 2 levels up (db -> server) to reach:
            # route-registration-tool/ where alembic.ini lives.
            root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
            ini = os.path.join(root, "alembic.ini")
            cfg = Config(ini)
            # Defensive: if the ini isn't present (or config was loaded without sections),
            # ensure Alembic knows where migration scripts live relative to this repo root.
            if not cfg.get_main_option("script_location"):
                cfg.set_main_option("script_location", os.path.join(root, "alembic"))
            logger.info("Running Alembic migrations (upgrade head).")
            command.upgrade(cfg, "head")

            # Explicit unlock (connection close would also release it).
            try:
                conn.execute("SELECT pg_advisory_unlock(%s)", (lock_key,))
            except Exception:
                logger.warning("Failed to explicitly release migration lock.", exc_info=True)

    except Exception:
        logger.exception("Postgres migrations failed.")
        raise


class PostgresBackend:
    name = "postgres"

    def init_on_startup(self) -> None:
        init_db_postgres()


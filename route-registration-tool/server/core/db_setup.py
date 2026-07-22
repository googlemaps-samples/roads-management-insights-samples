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

"""DB setup entry points.

DB-specific DDL/migration code lives under `server/db/{sqlite.py,postgres.py}`.
"""

from __future__ import annotations

from server.db.postgres import init_db_postgres as _init_db_postgres
from server.db.sqlite import init_db_sqlite as _init_db_sqlite


def init_db_sqlite() -> None:
    """Initialize SQLite schema (SQLite file-backed or tests)."""
    _init_db_sqlite()


def init_db_postgres() -> None:
    """Initialize PostgreSQL schema (Alembic migrations)."""
    _init_db_postgres()


def init_db() -> None:
    """Backward-compatible alias for SQLite file initialization."""
    init_db_sqlite()

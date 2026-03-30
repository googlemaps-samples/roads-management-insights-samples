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

from sqlalchemy.engine import make_url

from server.db.config import get_database_urls


def get_backend():
    """Return a DB backend implementation based on DATABASE_URL."""
    async_url, _ = get_database_urls()
    u = make_url(async_url)

    if u.drivername == "sqlite+aiosqlite":
        from server.db.backends.sqlite_backend import SQLiteBackend

        return SQLiteBackend()

    if u.drivername == "postgresql+asyncpg":
        from server.db.backends.postgres_backend import PostgresBackend

        return PostgresBackend()

    raise ValueError(f"Unsupported DATABASE_URL driver: {u.drivername!r}")

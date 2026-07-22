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


def test_postgres_urls_derived(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:pass@localhost:5432/appdb",
    )
    from server.db.common import get_database_urls

    async_u, sync_u = get_database_urls()
    assert "asyncpg" in async_u
    assert sync_u.startswith("postgresql+psycopg://")
    assert "pass@" in sync_u, "Expected password to be present (not masked as '***')"


def test_sqlite_urls_derived(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:////tmp/test_market163.db")
    from server.db.common import get_database_urls

    async_u, sync_u = get_database_urls()
    assert "aiosqlite" in async_u
    assert sync_u.startswith("sqlite:///")


def test_unsupported_driver(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "mysql+aiomysql://u:p@localhost/db")
    from server.db.common import get_database_urls

    try:
        get_database_urls()
    except ValueError as e:
        assert "Unsupported" in str(e)
    else:
        raise AssertionError("expected ValueError")

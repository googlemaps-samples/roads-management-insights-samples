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


import importlib

import pytest


@pytest.mark.asyncio
async def test_query_db_select_one(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    import server.db.common as database

    importlib.reload(database)

    row = await database.query_db("SELECT 1 AS n", (), one=True)
    assert row is not None
    assert row[0] == 1

    await database.dispose_async_engine()


@pytest.mark.asyncio
async def test_query_db_tuple_params(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    import server.db.common as database

    importlib.reload(database)

    row = await database.query_db("SELECT ? AS n", (42,), one=True)
    assert row[0] == 42

    await database.dispose_async_engine()

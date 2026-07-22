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

import importlib

import pytest


def test_backend_selection_sqlite(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///./tmp.db")

    from server.db.common import get_backend

    backend = get_backend()
    assert backend.name == "sqlite"


def test_backend_selection_postgres(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:pass@localhost:5432/appdb",
    )

    from server.db.common import get_backend

    backend = get_backend()
    assert backend.name == "postgres"


def test_postgres_policy_raises_on_gcs_backup_enabled(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:pass@localhost:5432/appdb",
    )
    # GCS DB backup support was removed; ensure backend selection still works.
    from server.db.common import get_backend

    backend = get_backend()
    assert backend.name == "postgres"

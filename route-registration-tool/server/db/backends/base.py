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

from typing import Any, Protocol


class DBBackend(Protocol):
    """Dialect-specific DB behavior lives behind this interface."""

    name: str

    def restore_from_gcs_if_applicable(self) -> None:
        """Restore DB contents from GCS if enabled (SQLite file DB only)."""

    def init_on_startup(self) -> None:
        """Ensure schema exists for this database (DDL / migrations)."""

    def start_backup_if_applicable(self) -> None:
        """Start background backup thread if enabled (SQLite file DB only)."""

    def stop_backup_if_running(self) -> None:
        """Stop backup thread if running."""

    def ensure_pubsub_routes_table_schema(self, conn: Any) -> None:
        """Optional bootstrap for pubsub-ingestion tables."""

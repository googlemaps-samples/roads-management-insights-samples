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

import os

from server.core.db_setup import init_db_postgres


class PostgresBackend:
    name = "postgres"

    def _ensure_no_gcs_backup_policy_violation(self) -> None:
        enabled = os.getenv("GCS_DB_BACKUP_ENABLED", "false").lower().strip() in (
            "true",
            "1",
            "yes",
            "on",
        )
        if enabled:
            raise ValueError(
                "GCS_DB_BACKUP_ENABLED is not supported with PostgreSQL. "
                "Use managed Postgres backups/restore instead, or disable GCS_DB_BACKUP_ENABLED."
            )

    def restore_from_gcs_if_applicable(self) -> None:
        self._ensure_no_gcs_backup_policy_violation()
        # Postgres backups are managed externally.

    def init_on_startup(self) -> None:
        init_db_postgres()

    def start_backup_if_applicable(self) -> None:
        self._ensure_no_gcs_backup_policy_violation()

    def stop_backup_if_running(self) -> None:
        # No-op: Postgres backups are handled by external policy.
        return

    def ensure_pubsub_routes_table_schema(self, conn: object) -> None:
        # Postgres schema is managed by Alembic.
        return

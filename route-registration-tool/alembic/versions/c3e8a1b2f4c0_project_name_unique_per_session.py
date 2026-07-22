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

"""project_name_unique_per_session

Revision ID: c3e8a1b2f4c0
Revises: 7b2f6a8f2d10
Create Date: 2026-04-02

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "c3e8a1b2f4c0"
down_revision: Union[str, Sequence[str], None] = "7b2f6a8f2d10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _run(sql: str) -> None:
    op.execute(text(sql))


def upgrade() -> None:
    _run("DROP INDEX IF EXISTS idx_projects_name_unique;")
    _run(
        """
CREATE UNIQUE INDEX idx_projects_session_name_unique
ON projects (session_id, project_name)
WHERE deleted_at IS NULL AND session_id IS NOT NULL;
"""
    )
    _run(
        """
CREATE UNIQUE INDEX idx_projects_unscoped_name_unique
ON projects (project_name)
WHERE deleted_at IS NULL AND session_id IS NULL;
"""
    )


def downgrade() -> None:
    _run("DROP INDEX IF EXISTS idx_projects_session_name_unique;")
    _run("DROP INDEX IF EXISTS idx_projects_unscoped_name_unique;")
    _run(
        """
CREATE UNIQUE INDEX idx_projects_name_unique ON projects(project_name) WHERE deleted_at IS NULL;
"""
    )

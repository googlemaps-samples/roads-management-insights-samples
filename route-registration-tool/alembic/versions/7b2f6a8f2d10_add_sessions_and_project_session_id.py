"""add_sessions_and_project_session_id

Revision ID: 7b2f6a8f2d10
Revises: 41a6cc503c59
Create Date: 2026-04-02

"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "7b2f6a8f2d10"
down_revision: Union[str, Sequence[str], None] = "41a6cc503c59"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _run(sql: str) -> None:
    op.execute(text(sql))


def upgrade() -> None:
    _run(
        """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""
    )
    _run(
        """
CREATE TABLE IF NOT EXISTS session_links (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    linked_session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, linked_session_id)
);
"""
    )
    _run(
        """
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS session_id TEXT;
"""
    )
    _run(
        """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_projects_session_id'
    ) THEN
        ALTER TABLE projects
        ADD CONSTRAINT fk_projects_session_id
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;
    END IF;
END $$;
"""
    )
    _run(
        """
CREATE INDEX IF NOT EXISTS idx_projects_session_id
ON projects(session_id)
WHERE deleted_at IS NULL;
"""
    )


def downgrade() -> None:
    _run("DROP INDEX IF EXISTS idx_projects_session_id;")
    _run("ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_session_id;")
    _run("ALTER TABLE projects DROP COLUMN IF EXISTS session_id;")
    _run("DROP TABLE IF EXISTS session_links;")
    _run("DROP TABLE IF EXISTS sessions;")


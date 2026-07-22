import pytest


def test_alembic_ini_contains_script_location(monkeypatch):
    """Alembic config must include [alembic] script_location."""

    # Import inside test to ensure `monkeypatch` is applied before init runs.
    from alembic import command as alembic_command
    from server.db.postgres import init_db_postgres

    def fake_upgrade(cfg, _revision):
        script_location = cfg.get_main_option("script_location")
        assert script_location, "Expected [alembic] script_location to be present"

    monkeypatch.setattr(alembic_command, "upgrade", fake_upgrade)

    # Should not attempt a DB connection because upgrade is monkeypatched.
    init_db_postgres()


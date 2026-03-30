# Design: SQLite → PostgreSQL (MARKET-163)

**Jira:** [MARKET-163](https://leptonsoftware-team.atlassian.net/browse/MARKET-163) — Replace SQLite with PostgreSQL  
**Scope choice:** **C** — Abstract interface with SQLite + Postgres implementations; **production runs Postgres**; SQLite retained for **tests** and **transitional** use only.  
**Status:** Approved for implementation planning (brainstorm sections 1–2, consolidated below).

---

## 1. Goals

- Remove runtime dependency on a local `my_database.db` file for **production**.
- Centralize database access behind a **stable API** (`query_db`, `get_db_transaction`, SQLAlchemy engines) with **dialect-specific** code isolated under `server/db/`.
- Support **configuration via environment variables** (primary: `DATABASE_URL`).
- Preserve existing behavior for API consumers; **no** UI contract changes.

---

## 2. Jira acceptance criteria mapping

| Criterion | Design response |
|-----------|-----------------|
| Remove all SQLite database usage | **Production** builds use Postgres only; SQLite code paths remain **only** for tests/dev as explicitly configured. |
| Move SQLite-related queries/code into dedicated structure | Existing `aiosqlite` / raw file access moves behind **`server/db/`** backends; routes stop importing `aiosqlite` directly. |
| New Postgres-oriented layer | **Same** façade (`query_db`, transactions, engines); **Postgres** connection via `DATABASE_URL` (async + sync drivers as below). |
| Easy configuration for different databases | **`DATABASE_URL`** selects dialect; optional explicit `DB_BACKEND` only if team wants redundancy checks against the URL. |
| Environment variables for Postgres | Document in `.env.example`: **`DATABASE_URL`** (required for prod). Optional split vars (`PGHOST`, `PGUSER`, etc.) if the team prefers assembling the URL in config. |
| Folder structure includes a **`DB`** area | Use **`server/db/`** (Python package convention: `db` not `DB` to match imports). Subpackages: `config`, `backends` (or equivalent), plus migrations location (e.g. `alembic/` at `route-registration-tool/`). |

---

## 3. Architecture

- **Config:** Parse `DATABASE_URL` at startup; validate scheme (`sqlite+aiosqlite`, `postgresql+asyncpg`, etc.). Derive **sync** and **async** SQLAlchemy URLs from the same logical DSN (document mapping, e.g. async Postgres ↔ sync `psycopg`).
- **Facades:**
  - **Async path:** `query_db` / `get_db_transaction` → **SQLAlchemy `AsyncConnection`** (or async session) — replaces direct `aiosqlite` in `server/db/database.py`.
  - **Sync path:** `server/utils/create_engine.py` provides **sync `engine`** for **`RouteStatusChecker`** (already uses `text()` + named binds); point at Postgres in prod.
- **Backends:** `server/db/backends/` — `sqlite.py` and `postgres.py` (or `session_factory.py` per dialect) implementing one small **protocol**: connect / transaction / execute / fetch, consumed by the façade.
- **Schema:** **Alembic** recommended for Postgres as source of truth; SQLite test DB either applies migrations where supported or a **test bootstrap** if SQLite DDL must stay minimal for speed.
- **GCS backup (`db_gcs.py`):** **SQLite-only** or **no-op** when not using a file DB. Postgres relies on **managed backups** (Cloud SQL / operator policy); document in README.

---

## 4. Data flow

1. **Lifespan startup:** Load `.env` → build engines from `DATABASE_URL` → if SQLite: optional GCS restore + `init_db`; if Postgres: migrations / init → skip file restore → do not start file-based backup for Postgres.
2. **HTTP handlers:** `query_db` / transactions via **async** SQLAlchemy pool.
3. **`RouteStatusChecker`:** Keep **sync** `engine.begin()` in the **db worker thread**; tune **pool sizes** so async + sync pools stay within DB `max_connections`.
4. **Shutdown:** Dispose async and sync engines; stop GCS backup thread when applicable; preserve safe teardown (avoid noisy errors on loop close).

---

## 5. SQL portability

- Prefer **`text("...")` + named parameters** everywhere (aligns with `check_routes_status.py`).
- Migrate call sites off SQLite **`?`** placeholders to **named** binds.
- Handle dialect differences in **DDL** (Alembic) or **narrow backend helpers** — avoid scattering `if postgres` across routes.

---

## 6. Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Primary: async URL for app (e.g. `postgresql+asyncpg://user:pass@host:5432/dbname` or `sqlite+aiosqlite:///path` for tests). |
| Optional | `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — only if config layer builds `DATABASE_URL` from parts. |
| Existing | Review `GCS_*` — backup/restore applies only to SQLite file mode; gate or document. |

---

## 7. Testing strategy

- **Default CI:** SQLite via `sqlite+aiosqlite` (memory or temp file) + schema apply.
- **Optional:** Postgres service container + migration smoke + targeted integration tests for dialect-specific behavior.

---

## 8. Risks and follow-ups

- **Dual pools** (async app + sync worker): monitor connection counts; consider funneling worker writes through async layer later if limits bite.
- **Migration of existing `.db` data:** Out of scope unless product requires it — add a **one-off** ETL task if needed.
- **BigQuery / sync utilities** referencing SQLite in comments or logic: audit `sync_routes.py` and related modules during implementation.

---

## 9. Approval

- **Architecture (section 1):** Approved.  
- **Data flow / SQL / threading / testing / errors (section 2):** Approved.  
- **Consolidated spec:** Ready for implementation plan (`writing-plans`).

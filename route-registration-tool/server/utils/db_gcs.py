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


"""
GCS backup and restore for SQLite database.

Environment Variables (all configuration from env only):
- GCS_DB_BACKUP_ENABLED: "true" | "false" - Enable GCS backup/restore (default: "false")
- GCS_DB_BACKUP_BUCKET: GCS bucket name for backups
- GCS_DB_BACKUP_OBJECT: Object path in bucket (default: "db_backups/my_database.db")
- GCS_DB_BACKUP_INTERVAL: Backup interval - "5m" | "30m" | "1h" | "6h" | "24h" (default: "1h")
- GCS_DB_BACKUP_PROJECT: GCP project ID for GCS (required when backup enabled; fallback: GOOGLE_CLOUD_PROJECT)
- Uses Application Default Credentials (gcloud auth application-default login or GOOGLE_APPLICATION_CREDENTIALS)
"""
import logging
import os
import shutil
import threading
from typing import Optional

logger = logging.getLogger(__name__)

# Interval in seconds for each allowed value
INTERVAL_SECONDS = {
    "1m": 1 * 60,
    "5m": 5 * 60,
    "30m": 30 * 60,
    "1h": 60 * 60,
    "6h": 6 * 60 * 60,
    "24h": 24 * 60 * 60,
}


def _get_config() -> dict:
    """Get all GCS backup config from environment only."""
    enabled = os.getenv("GCS_DB_BACKUP_ENABLED", "false").lower().strip()
    project = (
        os.getenv("GCS_DB_BACKUP_PROJECT", "").strip()
        or os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
    )
    return {
        "enabled": enabled in ("true", "1", "yes", "on"),
        "bucket": os.getenv("GCS_DB_BACKUP_BUCKET", "").strip(),
        "object": os.getenv("GCS_DB_BACKUP_OBJECT", "db_backups/my_database.db").strip()
        or "db_backups/my_database.db",
        "interval_str": os.getenv("GCS_DB_BACKUP_INTERVAL", "1h").strip().lower()
        or "1h",
        "project": project,
    }


def _parse_interval_seconds(interval_str: str) -> int:
    """Parse interval string to seconds. Returns 3600 (1h) if invalid."""
    return INTERVAL_SECONDS.get(interval_str, INTERVAL_SECONDS["1h"])


def is_backup_configured() -> bool:
    """Check if GCS backup is enabled and properly configured."""
    cfg = _get_config()
    if not cfg["enabled"] or not cfg["bucket"]:
        return False
    if not cfg["project"]:
        logger.warning(
            "GCS_DB_BACKUP_ENABLED but GCS_DB_BACKUP_PROJECT (or GOOGLE_CLOUD_PROJECT) not set"
        )
        return False
    return True


def restore_db_from_gcs(db_path: str) -> bool:
    """
    Download DB file from GCS if local DB does not exist.
    Uses Application Default Credentials (gcloud auth application-default login).

    Returns:
        True if restore succeeded or DB already existed, False if restore failed.
    """
    if os.path.isfile(db_path):
        logger.info(f"DB file exists at {db_path}, skipping GCS restore")
        return True

    if not is_backup_configured():
        logger.info("GCS backup not configured; will create empty DB on first use")
        return True

    cfg = _get_config()
    bucket_name = cfg["bucket"]
    object_name = cfg["object"]

    try:
        from google.cloud import storage

        client = storage.Client(project=cfg["project"])
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(object_name)

        if not blob.exists():
            logger.warning(
                f"GCS object gs://{bucket_name}/{object_name} does not exist; "
                "will create empty DB"
            )
            return True

        # Ensure parent directory exists
        db_dir = os.path.dirname(db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)

        # Download to temp file then rename (atomic on same filesystem)
        tmp_path = db_path + ".restore_tmp"
        blob.download_to_filename(tmp_path)
        shutil.move(tmp_path, db_path)
        logger.info(f"Restored DB from gs://{bucket_name}/{object_name} to {db_path}")
        return True

    except Exception as e:
        logger.error(f"Failed to restore DB from GCS: {e}", exc_info=True)
        return False


def backup_db_to_gcs(db_path: str) -> bool:
    """
    Upload DB file to GCS.
    Uses Application Default Credentials (gcloud auth application-default login).

    Returns:
        True if backup succeeded, False otherwise.
    """
    if not os.path.isfile(db_path):
        logger.warning(f"DB file not found at {db_path}, skipping backup")
        return False

    if not is_backup_configured():
        return False

    cfg = _get_config()
    bucket_name = cfg["bucket"]
    object_name = cfg["object"]

    try:
        from google.cloud import storage

        client = storage.Client(project=cfg["project"])
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(object_name)
        blob.upload_from_filename(db_path)
        logger.info(f"Backed up DB to gs://{bucket_name}/{object_name}")
        return True

    except Exception as e:
        logger.error(f"Failed to backup DB to GCS: {e}", exc_info=True)
        return False


_backup_stop_event: Optional[threading.Event] = None
_backup_thread: Optional[threading.Thread] = None


def start_backup_thread(db_path: str) -> Optional[threading.Thread]:
    """
    Start a background thread that backs up DB to GCS at the configured interval.
    Returns the thread if started, None if backup is not configured.
    """
    global _backup_stop_event, _backup_thread

    if not is_backup_configured():
        return None

    cfg = _get_config()
    interval_sec = _parse_interval_seconds(cfg["interval_str"])
    _backup_stop_event = threading.Event()

    def _run():
        while not _backup_stop_event.is_set():
            _backup_stop_event.wait(interval_sec)
            if _backup_stop_event.is_set():
                break
            backup_db_to_gcs(db_path)

    _backup_thread = threading.Thread(target=_run, daemon=True)
    _backup_thread.start()
    logger.info(
        f"GCS DB backup thread started (interval: {cfg['interval_str']} = {interval_sec}s)"
    )
    return _backup_thread


def stop_backup_thread() -> None:
    """Signal the backup thread to stop (on server shutdown)."""
    global _backup_stop_event
    if _backup_stop_event:
        _backup_stop_event.set()
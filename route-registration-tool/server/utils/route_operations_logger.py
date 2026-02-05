"""
Route Operations Logger

Provides file-based logging for all route operations including:
- Creation (with retry attempt tracking)
- Deletion
- Validation status updates
- Final status after all attempts

Logs are stored in the 'logs' folder with daily rotation.
Each log entry includes timestamp, operation type, route UUID, route name, and details.
"""

import os
import logging
from typing import Optional
from logging.handlers import TimedRotatingFileHandler

# --- Logger Setup ---
_route_ops_logger = None


def _ensure_logs_folder():
    """Ensure the logs folder exists."""
    logs_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "logs"
    )
    logs_dir = os.path.normpath(logs_dir)
    if not os.path.exists(logs_dir):
        os.makedirs(logs_dir)
    return logs_dir


def _get_route_ops_logger(db_project_id: Optional[int] = None):
    """Get or create the route operations logger."""
    global _route_ops_logger
    
    if _route_ops_logger is not None:
        return _route_ops_logger
    
    logs_dir = _ensure_logs_folder()
    log_file = os.path.join(logs_dir, f"route_operations_{db_project_id}.log")
    
    # Create logger
    _route_ops_logger = logging.getLogger(f"route_operations_{db_project_id}")
    _route_ops_logger.setLevel(logging.INFO)
    
    # Prevent duplicate handlers
    if _route_ops_logger.handlers:
        return _route_ops_logger
    
    # Create file handler with daily rotation
    file_handler = TimedRotatingFileHandler(
        log_file,
        when="midnight",
        interval=1,
        backupCount=30,  # Keep 30 days of logs
        encoding="utf-8"
    )
    file_handler.suffix = "%Y-%m-%d"
    
    # Create formatter with detailed timestamp
    formatter = logging.Formatter(
        "%(asctime)s.%(msecs)03d | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    file_handler.setFormatter(formatter)
    
    _route_ops_logger.addHandler(file_handler)
    
    # Also add console handler for visibility during development
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(formatter)
    _route_ops_logger.addHandler(console_handler)
    
    return _route_ops_logger


# --- Operation Type Constants ---
OP_CREATION = "CREATION"
OP_CREATION_SUCCESS = "CREATION_SUCCESS"
OP_CREATION_FAILED = "CREATION_FAILED"
OP_CREATION_RETRY = "CREATION_RETRY"
OP_CREATION_FINAL_FAILURE = "CREATION_FINAL_FAILURE"
OP_DELETION = "DELETION"
OP_DELETION_SUCCESS = "DELETION_SUCCESS"
OP_DELETION_FAILED = "DELETION_FAILED"
OP_VALIDATION = "VALIDATION"
OP_VALIDATION_UPDATE = "VALIDATION_UPDATE"
OP_STATUS_CHANGE = "STATUS_CHANGE"
OP_SYNC_START = "SYNC_START"
OP_SYNC_COMPLETE = "SYNC_COMPLETE"


def _format_route_id(uuid: str, route_name: Optional[str] = None) -> str:
    """Format route identifier with optional name."""
    if route_name:
        return f"{uuid} ({route_name})"
    return uuid


# --- Public Logging Functions ---

def log_sync_start(project_id: int, project_number: str, total_routes: int, tag: Optional[str] = None):
    """Log the start of a sync operation."""
    logger = _get_route_ops_logger(project_id)
    tag_info = f", tag={tag}" if tag else ""
    logger.info(
        f"{OP_SYNC_START} | project_id={project_id} | project_number={project_number} | "
        f"total_routes={total_routes}{tag_info}"
    )


def log_sync_complete(project_id: int, stats: dict):
    """Log the completion of a sync operation."""
    logger = _get_route_ops_logger(project_id)
    stats_str = " | ".join(f"{k}={v}" for k, v in stats.items())
    logger.info(f"{OP_SYNC_COMPLETE} | project_id={project_id} | {stats_str}")


def log_creation_attempt(project_id: int, uuid: str, route_name: Optional[str] = None, attempt: int = 1, max_attempts: int = 5):
    """Log a route creation attempt."""
    logger = _get_route_ops_logger(project_id)
    route_id = _format_route_id(uuid, route_name)
    
    if attempt == 1:
        logger.info(f"{OP_CREATION} | {route_id} | attempt={attempt}/{max_attempts}")
    else:
        logger.info(f"{OP_CREATION_RETRY} | {route_id} | attempt={attempt}/{max_attempts}")


def log_creation_success(project_id: int, uuid: str, route_name: Optional[str] = None, attempt: int = 1, state: Optional[str] = None):
    """Log a successful route creation."""
    logger = _get_route_ops_logger(project_id)
    route_id = _format_route_id(uuid, route_name)
    state_info = f" | state={state}" if state else ""
    logger.info(f"{OP_CREATION_SUCCESS} | {route_id} | attempt={attempt}{state_info}")


def log_creation_failed(project_id: int, uuid: str, route_name: Optional[str] = None, attempt: int = 1, error: Optional[str] = None):
    """Log a failed route creation attempt."""
    logger = _get_route_ops_logger(project_id)
    route_id = _format_route_id(uuid, route_name)
    error_info = f" | error={error}" if error else ""
    logger.warning(f"{OP_CREATION_FAILED} | {route_id} | attempt={attempt}{error_info}")


def log_creation_final_failure(project_id: int, uuid: str, route_name: Optional[str] = None, max_attempts: int = 5):
    """Log when a route fails to create after all retry attempts."""
    logger = _get_route_ops_logger(project_id)
    route_id = _format_route_id(uuid, route_name)
    logger.error(
        f"{OP_CREATION_FINAL_FAILURE} | {route_id} | "
        f"Failed after {max_attempts} attempts - route remains unsynced"
    )


def log_deletion_attempt(project_id: int, uuid: str, route_name: Optional[str] = None):
    """Log a route deletion attempt."""
    logger = _get_route_ops_logger(project_id)
    route_id = _format_route_id(uuid, route_name)
    logger.info(f"{OP_DELETION} | {route_id}")


def log_deletion_success(project_id: int, uuid: str, route_name: Optional[str] = None):
    """Log a successful route deletion."""
    logger = _get_route_ops_logger(project_id)
    route_id = _format_route_id(uuid, route_name)
    logger.info(f"{OP_DELETION_SUCCESS} | {route_id}")


def log_deletion_failed(project_id: int, uuid: str, route_name: Optional[str] = None, error: Optional[str] = None):
    """Log a failed route deletion."""
    logger = _get_route_ops_logger(project_id)
    route_id = _format_route_id(uuid, route_name)
    error_info = f" | error={error}" if error else ""
    logger.warning(f"{OP_DELETION_FAILED} | {route_id}{error_info}")


def log_validation_update(
    project_id: int,
    uuid: str,
    route_name: Optional[str] = None,
    old_status: Optional[str] = None,
    new_status: Optional[str] = None,
    routes_status: Optional[str] = None
):
    """Log a validation status update."""
    logger = _get_route_ops_logger(project_id)
    route_id = _format_route_id(uuid, route_name)
    status_change = f"{old_status} -> {new_status}" if old_status else new_status
    routes_status_info = f" | routes_status={routes_status}" if routes_status else ""
    logger.info(f"{OP_VALIDATION_UPDATE} | {route_id} | sync_status: {status_change}{routes_status_info}")


def log_status_change(
    project_id: int,
    uuid: str,
    route_name: Optional[str] = None,
    operation: Optional[str] = None,
    old_status: Optional[str] = None,
    new_status: Optional[str] = None,
    details: Optional[str] = None
):
    """Log a general status change."""
    logger = _get_route_ops_logger(project_id)
    route_id = _format_route_id(uuid, route_name)
    op_info = f" | op={operation}" if operation else ""
    status_info = f" | {old_status} -> {new_status}" if old_status and new_status else ""
    details_info = f" | {details}" if details else ""
    logger.info(f"{OP_STATUS_CHANGE} | {route_id}{op_info}{status_info}{details_info}")


def log_batch_summary(
    project_id: int,
    operation: str,
    total: int,
    successful: int,
    failed: int,
    attempt: Optional[int] = None,
    max_attempts: Optional[int] = None
):
    """Log a summary of a batch operation."""
    logger = _get_route_ops_logger(project_id)
    attempt_info = f" | attempt={attempt}/{max_attempts}" if attempt else ""
    logger.info(
        f"BATCH_SUMMARY | operation={operation}{attempt_info} | "
        f"total={total} | successful={successful} | failed={failed}"
    )


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


import threading
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from server.utils.listening_to_pub_sub import listen_to_pubsub
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("pubsub_listener")

router = APIRouter()

class ListenerConfig(BaseModel):
    gcp_project_id: str
    project_db_id: int
    gcp_project_number: str

listener_thread = None
stop_event = threading.Event()
streaming_future = None  # Store the future to cancel it properly


def listener_runner(config: ListenerConfig):
    try:
        listen_to_pubsub(
            gcp_project_id=config.gcp_project_id,
            project_db_id=config.project_db_id,
            stop_event=stop_event,
            gcp_project_number=config.gcp_project_number
        )
    except Exception as e:
        logger.error(f"Listener stopped due to error: {e}")


@router.post("/start-listener")
async def start_listener(config: ListenerConfig):
    logger.info(f"Starting listener for project '{config.gcp_project_id}'")
    global listener_thread, stop_event

    if listener_thread and listener_thread.is_alive():
        logger.warning("Listener is already running.")
        return {
            "status": "already_running",
            "message": "Listener is already running."
        }

    stop_event.clear()
    listener_thread = threading.Thread(
        target=listener_runner, 
        args=(config,), 
        daemon=True
    )
    listener_thread.start()
    
    # Give it a moment to validate
    time.sleep(2)
    
    # Check if thread is still alive (validation succeeded)
    if not listener_thread.is_alive():
        raise HTTPException(
            status_code=400, 
            detail="Failed to start listener. Check GCP credentials and subscription."
        )

    return {
        "status": "started",
        "message": f"Pub/Sub listener started for project id '{config.gcp_project_id}'."
    }


@router.post("/stop-listener")
async def stop_listener():
    global listener_thread, stop_event

    if not listener_thread or not listener_thread.is_alive():
        logger.warning("Listener is not currently running.")
        return {
            "status": "not_running",
            "message": "Listener is not currently running."
        }

    logger.info("Stopping listener...")
    stop_event.set()

    def join_thread():
        global listener_thread
        try:
            listener_thread.join(timeout=0.1)
            if listener_thread.is_alive():
                logger.warning("Listener thread did not exit cleanly.")
            else:
                logger.info("Listener stopped successfully.")
        except Exception as e:
            logger.error(f"Error while joining listener thread: {e}")
        finally:
            listener_thread = None

    threading.Thread(target=join_thread, daemon=True).start()

    return {
        "status": "stopping",
        "message": "Stop signal sent listener is shutting down in background."
    }
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


import json
import asyncio
import logging
import os
import re
from contextlib import asynccontextmanager
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import warnings
warnings.filterwarnings("ignore", category=FutureWarning, module="pyproj")
from dotenv import load_dotenv

# Load .env before any app code that reads env vars (e.g. MAX_ROUTES_PER_PROJECT, ENABLE_MULTITENANT)
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from server.utils.connection_manager import ConnectionManager
from server.db.common import get_backend, dispose_async_engine
from server.routes.all_routes import router as all_routes_router
from server.utils.firebase_logger import initialize_firebase

ws_manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan handler for startup and shutdown"""

    backend = get_backend()
    run_migrations = True
    if run_migrations:
        try:
            backend.init_on_startup()
        except Exception:
            logging.exception(
                "Database init failed during startup (backend=%s).",
                getattr(backend, "name", "unknown"),
            )
            raise
    else:
        logging.warning(
            "Skipping DB init/migrations on startup (backend=%s). Set RUN_DB_MIGRATIONS_ON_STARTUP=true to enable.",
            getattr(backend, "name", "unknown"),
        )
    # Initialize Firebase Admin SDK for route metrics logging
    initialize_firebase()
    
    yield
    
    try:
        await dispose_async_engine()
    except Exception as e:
        logging.warning(f"Error disposing async engine: {e}")
    try:
        await asyncio.sleep(0.1)
    except asyncio.CancelledError:
        pass

app = FastAPI(title="My FastAPI Project", lifespan=lifespan)

app.mount("/assets", StaticFiles(directory="ui/dist/assets"), name="assets")

# CORS configuration
origins = ["http://localhost:5173", "http://localhost:5174"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routes at once
app.include_router(all_routes_router)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()  # Accept connection first
    project_id = None
    connected_to_project = False

    try:
        while True:
            data = await ws.receive_text()
            try:
                payload = json.loads(data)
                logging.info(f"[WEBSOCKET] Received message: {payload}")
            except json.JSONDecodeError:
                await ws.send_text(json.dumps({"error": "Invalid JSON"}))
                continue

            project_id = payload.get("project_id")
            project_number = payload.get("project_number")
            logging.info(f"[WEBSOCKET] Parsed project_id: {project_id} (type: {type(project_id).__name__}), project_number: {project_number}")

            if not project_id:
                await ws.send_text(json.dumps({"error": "project_id required"}))
                continue

            # Connect with project_id tracking for route status updates (only once)
            if project_id and not connected_to_project:
                # Ensure project_id is a string for consistent matching
                project_id_str = str(project_id)
                await ws_manager.connect(ws, project_id_str)
                connected_to_project = True
                connection_count = len(ws_manager.project_connections.get(project_id_str, []))
                all_projects = list(ws_manager.project_connections.keys())
                logging.info(f"[WEBSOCKET] ✅ Connected client to project {project_id_str} for route status updates. Total connections for this project: {connection_count}")
                logging.info(f"[WEBSOCKET] All registered projects: {all_projects}")
                # Send success message for route status updates
                await ws.send_text(json.dumps({
                    "status": "Connected for route status updates",
                    "project_id": project_id_str,
                    "connection_count": connection_count
                }))

    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
        logging.info("Client disconnected")
@app.get("/{full_path:path}", response_class=HTMLResponse)

async def serve_react_app(full_path: str):
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    DISCLAIMER_MESSAGE = os.getenv("DISCLAIMER_MESSAGE") or os.getenv("VITE_DISCLAIMER_MESSAGE") or ""
    print(f"Serving React app for path: {full_path}")
    html = open("ui/dist/index.html", "r").read()
    html = html.replace('window.GOOGLE_API_KEY = ""', f'window.GOOGLE_API_KEY = "{GOOGLE_API_KEY}"')

    # Disclaimer message (runtime-injected for built UI served by FastAPI)
    if 'window.DISCLAIMER_MESSAGE = ""' in html:
        html = html.replace(
            'window.DISCLAIMER_MESSAGE = ""',
            f'window.DISCLAIMER_MESSAGE = "{DISCLAIMER_MESSAGE}"',
        )
    else:
        # Backward compatible: inject next to GOOGLE_API_KEY if placeholder isn't present.
        injection = f'\n      window.DISCLAIMER_MESSAGE = "{DISCLAIMER_MESSAGE}"'
        html = html.replace('window.GOOGLE_API_KEY = ""', f'window.GOOGLE_API_KEY = ""{injection}')

    # Replace Google Maps API key using regex to handle all cases
    if GOOGLE_API_KEY:
        # Replace any existing key with our API key
        # Pattern matches ?key=anything& or ?key=anything followed by end of string or space
        html = re.sub(r'(\?key=)[^&\s"]*', rf'\g<1>{GOOGLE_API_KEY}', html)
    else:
        # Remove the key parameter entirely if no API key is provided
        # Handle ?key=value& (key is first parameter)
        html = re.sub(r'\?key=[^&\s"]*&', '?', html)
        # Handle &key=value (key is not first parameter)
        html = re.sub(r'&key=[^&\s"]*', '', html)
        # Handle ?key=value (key is only parameter)
        html = re.sub(r'\?key=[^&\s"]*', '', html)
    
    return html
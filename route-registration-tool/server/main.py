import json
import asyncio
import logging
import os
import re
import threading
from contextlib import asynccontextmanager
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import warnings
warnings.filterwarnings("ignore", category=FutureWarning, module="pyproj")
from dotenv import load_dotenv


from server.utils.connection_manager import ConnectionManager
from server.core.db_setup import init_db
from server.routes.all_routes import router as all_routes_router
from server.utils.firebase_logger import initialize_firebase
from server.utils.check_routes_status import RouteStatusChecker

ws_manager = ConnectionManager()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

# Suppress thread errors during shutdown
def handle_thread_exception(args):
    """Handle exceptions in threads during shutdown"""
    exc_value = args.exc_value
    if exc_value is None:
        return
    
    # Suppress event loop closed errors during shutdown (common with aiosqlite)
    if isinstance(exc_value, RuntimeError):
        error_msg = str(exc_value)
        if "Event loop is closed" in error_msg or "loop is closed" in error_msg.lower():
            # Suppress these errors - they're harmless during shutdown
            return
    
    # Log other exceptions normally (only if not during shutdown)
    try:
        logging.error(f"Unhandled exception in thread: {exc_value}", exc_info=exc_value)
    except Exception:
        # If logging fails (e.g., during shutdown), just ignore
        pass

# Set thread exception handler
threading.excepthook = handle_thread_exception

# Global validation checker instance
global_validation_checker = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan handler for startup and shutdown"""
    global global_validation_checker
    
    # Startup
    # Initialize Firebase Admin SDK for route metrics logging
    initialize_firebase()
    
    # Start global validation checker (checks all projects, runs every 20 seconds)
    logging.info("Starting global validation checker (runs every 20 seconds for all projects)")
    global_validation_checker = RouteStatusChecker(project_number=None)
    global_validation_checker.start_validation_checker(interval_seconds=20)
    
    yield
    
    # Shutdown - stop validation checker
    if global_validation_checker:
        logging.info("Stopping global validation checker")
        global_validation_checker.stop_validation_checker()
    
    # Shutdown - give time for pending operations to complete
    try:
        await asyncio.sleep(0.1)  # Brief delay to allow pending operations
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

# Initialize DB schema
init_db()

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
    print(f"Serving React app for path: {full_path}")
    html = open("ui/dist/index.html", "r").read()
    html = html.replace('window.GOOGLE_API_KEY = ""', f'window.GOOGLE_API_KEY = "{GOOGLE_API_KEY}"')
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
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


import os
import json
import math
import logging
from datetime import datetime
from google.cloud import pubsub_v1
from dotenv import load_dotenv
from shapely.geometry import LineString
from .create_engine import engine
from sqlalchemy import text
from sqlalchemy.orm import scoped_session, sessionmaker
import threading
import queue
import time
from google.api_core.exceptions import AlreadyExists, NotFound, PermissionDenied
import polyline

os.environ["GRPC_VERBOSITY"] = "NONE"
os.environ["GRPC_CPP_MIN_LOG_LEVEL"] = "3"
logging.getLogger("google").setLevel(logging.ERROR)
logging.getLogger("grpc").setLevel(logging.CRITICAL)
logging.getLogger("google.api_core.bidi").setLevel(logging.CRITICAL)
load_dotenv()

# -------------------------------------------------
# Recommended logging configuration (if not set elsewhere)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
# -------------------------------------------------


def calculate_length(coords):
    R = 6371
    length = 0.0
    for i in range(1, len(coords)):
        lat1, lon1 = math.radians(coords[i - 1][0]), math.radians(coords[i - 1][1])
        lat2, lon2 = math.radians(coords[i][0]), math.radians(coords[i][1])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
        length += 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(length, 2)


def listen_to_pubsub(gcp_project_id, project_db_id, stop_event, gcp_project_number):
    subscriber = pubsub_v1.SubscriberClient()
    subscription_id = f"rmi-sub-{gcp_project_number}"
    topic_name = f"projects/maps-platform-roads-management/topics/rmi-roadsinformation-{gcp_project_number}-json"
    subscription_path = subscriber.subscription_path(gcp_project_id, subscription_id)

    logging.info(f"Checking or creating subscription: {subscription_path}")

    # -------------------------------
    # Create or fetch subscription
    # -------------------------------
    try:
        subscription = subscriber.create_subscription(
            request={"name": subscription_path, "topic": topic_name}
        )
        logging.info(f"Subscription created: {subscription.name}")
    except AlreadyExists:
        logging.info(f"Subscription already exists: {subscription_path}")
        subscription = subscriber.get_subscription(request={"subscription": subscription_path})
    except PermissionDenied as e:
        logging.error("Permission Denied: You are not authorized to create or access this subscription.")
        logging.error(f"Details: {e.message}")
        return None
    except NotFound as e:
        logging.error("Topic not found — check if the topic name is correct.")
        logging.error(f"Tried topic: {topic_name}")
        logging.error(f"Details: {e.message}")
        return None
    except Exception as e:
        logging.exception(f"Unexpected error creating subscription: {e}")
        return None

    logging.info(f"Listening on: {subscription_path}")

    # -------------------------------
    # Database initialization
    # -------------------------------
    Session = scoped_session(sessionmaker(bind=engine))
    with engine.begin() as conn:
        conn.execute(text(""" 
        CREATE TABLE IF NOT EXISTS routes (
            uuid TEXT PRIMARY KEY NOT NULL,
            project_id INTEGER NOT NULL,
            route_name TEXT,
            origin TEXT,
            destination TEXT,
            waypoints TEXT,
            center TEXT,
            encoded_polyline TEXT,
            route_type TEXT,
            length REAL,
            parent_route_id TEXT,
            has_children BOOLEAN DEFAULT FALSE,
            is_segmented BOOLEAN DEFAULT FALSE,
            segmentation_type TEXT,
            segmentation_points TEXT,
            segmentation_config TEXT,
            sync_status TEXT CHECK(sync_status IN ('unsynced','validating','synced','invalid')) DEFAULT 'unsynced',
            is_enabled BOOLEAN DEFAULT TRUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME,
            tag TEXT,
            temp_geometry TEXT,
            start_lat REAL,
            start_lng REAL,
            end_lat REAL,
            end_lng REAL,
            min_lat REAL,
            max_lat REAL,
            min_lng REAL,
            max_lng REAL,
            latest_data_update_time DATETIME,
            static_duration_seconds REAL,
            current_duration_seconds REAL,
            routes_status TEXT,
            synced_at DATETIME,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY(parent_route_id) REFERENCES routes(uuid) ON DELETE SET NULL
        );
        """))

    logging.info("Database ready")

    db_queue = queue.Queue()
    batch_buffer = []
    lock = threading.Lock()

    # -------------------------------
    # DB Worker Thread
    # -------------------------------
    def db_worker():
        session = Session()
        last_commit_time = time.time()

        while not stop_event.is_set() or not db_queue.empty():
            try:
                item = db_queue.get(timeout=1)
                with lock:
                    batch_buffer.append(item)
                db_queue.task_done()
            except queue.Empty:
                pass

            if time.time() - last_commit_time >= 10 or (stop_event.is_set() and batch_buffer):
                with lock:
                    batch = batch_buffer.copy()
                    batch_buffer.clear()

                if batch:
                    try:
                        records = [dict(record) for record in batch]
                        uuids = [record["uuid"] for record in records]

                        length_map = {}
                        if uuids:
                            placeholders = ", ".join(f":uuid_{i}" for i in range(len(uuids)))
                            params = {f"uuid_{i}": uuid for i, uuid in enumerate(uuids)}
                            query = text(f"SELECT uuid, length FROM routes WHERE uuid IN ({placeholders})")
                            existing_entries = session.execute(query, params).fetchall()
                            length_map = {row.uuid: row.length for row in existing_entries}

                        update_records = []
                        insert_records = []

                        for record_data in records:
                            existing_length = length_map.get(record_data["uuid"])
                            temp_geometry = None
                            new_length = record_data.get("length")

                            if existing_length and existing_length > 0 and new_length and new_length > 0 and (
                                existing_length > 0.02 or new_length > 0.02
                            ):
                                length_ratio = new_length / existing_length
                                if length_ratio > 1.5 or length_ratio < 0.5:
                                    temp_geometry = record_data["encoded_polyline"]

                            record_data["temp_geometry"] = temp_geometry

                            if record_data["uuid"] in length_map:
                                update_records.append(record_data)
                            else:
                                insert_records.append(record_data)

                        conn = session.connection()
                        raw_conn = conn.connection.dbapi_connection
                        cursor = raw_conn.cursor()

                        if update_records:
                            update_stmt = """
                                UPDATE routes
                                SET latest_data_update_time = ?,
                                    static_duration_seconds = ?,
                                    current_duration_seconds = ?,
                                    temp_geometry = ?
                                WHERE uuid = ?
                            """
                            cursor.executemany(
                                update_stmt,
                                [
                                    (
                                        r["latest_data_update_time"],
                                        r["static_duration_seconds"],
                                        r["current_duration_seconds"],
                                        r["temp_geometry"],
                                        r["uuid"]
                                    )
                                    for r in update_records
                                ]
                            )

                        if insert_records:
                            insert_stmt = """
                                INSERT INTO routes (
                                    uuid, project_id, route_name, origin, destination, waypoints,
                                    center, encoded_polyline, route_type, length,
                                    parent_route_id, has_children, is_segmented, segmentation_type, segmentation_points, segmentation_config,
                                    sync_status, is_enabled, deleted_at, tag, temp_geometry,
                                    start_lat, start_lng, end_lat, end_lng,
                                    min_lat, max_lat, min_lng, max_lng,
                                    latest_data_update_time, static_duration_seconds, current_duration_seconds,
                                    routes_status, synced_at
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """
                            cursor.executemany(
                                insert_stmt,
                                [
                                    (
                                        r["uuid"], r["project_id"], r["route_name"], r["origin"], r["destination"], r["waypoints"],
                                        r["center"], r["encoded_polyline"], r["route_type"], r["length"],
                                        r["parent_route_id"], r["has_children"], r["is_segmented"], r["segmentation_type"], r["segmentation_points"], r["segmentation_config"],
                                        r["sync_status"], r["is_enabled"], r["deleted_at"], r["tag"], r["temp_geometry"],
                                        r["start_lat"], r["start_lng"], r["end_lat"], r["end_lng"],
                                        r["min_lat"], r["max_lat"], r["min_lng"], r["max_lng"],
                                        r["latest_data_update_time"], r["static_duration_seconds"], r["current_duration_seconds"],
                                        r["routes_status"], r["synced_at"]
                                    )
                                    for r in insert_records
                                ]
                            )

                        cursor.close()
                        session.commit()
                    except Exception as e:
                        logging.exception(f"DB batch insert error: {e}")
                        session.rollback()
                    finally:
                        last_commit_time = time.time()

        session.close()

    worker_thread = threading.Thread(target=db_worker, daemon=True)
    worker_thread.start()

    # -------------------------------
    # Pub/Sub Callback
    # -------------------------------
    def callback(message):
        try:
            data_json = json.loads(message.data.decode("utf-8"))
            attrs = message.attributes or {}
            route_id = attrs.get("selected_route_id") or data_json.get("selected_route_id")

            if not route_id:
                message.ack()
                return

            geometry = data_json.get("route_geometry")
            if isinstance(geometry, str):
                geometry = json.loads(geometry)
            if not geometry or "coordinates" not in geometry:
                message.ack()
                return

            coords = [[lat, lng] for lng, lat in geometry["coordinates"]]
            if len(coords) < 2:
                message.ack()
                return

            origin = {"lat": coords[0][0], "lng": coords[0][1]}
            destination = {"lat": coords[-1][0], "lng": coords[-1][1]}
            lats = [p[0] for p in coords]
            lngs = [p[1] for p in coords]

            start_lat = origin["lat"]
            start_lng = origin["lng"]
            end_lat = destination["lat"]
            end_lng = destination["lng"]

            min_lat = min(lats)
            max_lat = max(lats)
            min_lng = min(lngs)
            max_lng = max(lngs)

            line = LineString([(lng, lat) for lat, lng in coords])
            center = {"lat": line.centroid.y, "lng": line.centroid.x}

            travel_duration = data_json.get("travel_duration", {})
            static_duration = travel_duration.get("static_duration_in_seconds")
            current_duration = travel_duration.get("duration_in_seconds")

            retrieval_time = data_json.get("retrieval_time", {})
            timestamp = retrieval_time.get("seconds", 0) + retrieval_time.get("nanos", 0) / 1e9
            latest_data_update_time = datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M:%S")

            encoded_polyline = polyline.encode(coords)

            db_queue.put({
                "uuid": route_id,
                "project_id": project_db_id,
                "route_name": attrs.get("display_name") or data_json.get("display_name"),
                "origin": json.dumps(origin),
                "destination": json.dumps(destination),
                "waypoints": json.dumps([[lng, lat] for lat, lng in coords[1:-1]]),
                "center": json.dumps(center),
                "encoded_polyline": encoded_polyline,
                "route_type": "individual",
                "length": calculate_length(coords),
                "parent_route_id": None,
                "has_children": False,
                "is_segmented": False,
                "segmentation_type": None,
                "segmentation_points": None,
                "segmentation_config": None,
                "sync_status": "synced",
                "is_enabled": True,
                "deleted_at": None,
                "tag": None,
                "temp_geometry": None,
                "start_lat": start_lat,
                "start_lng": start_lng,
                "end_lat": end_lat,
                "end_lng": end_lng,
                "min_lat": min_lat,
                "max_lat": max_lat,
                "min_lng": min_lng,
                "max_lng": max_lng,
                "latest_data_update_time": latest_data_update_time,
                "static_duration_seconds": static_duration,
                "current_duration_seconds": current_duration,
                "routes_status": None,
                "synced_at": None
            })

            message.ack()

        except Exception as e:
            logging.exception(f"Error processing message: {e}")
            message.nack()

    streaming_future = subscriber.subscribe(subscription_path, callback=callback)
    logging.info("Listening indefinitely... waiting for stop signal...")

    # -------------------------------
    # MAIN EVENT LOOP
    # -------------------------------
    try:
        while not stop_event.is_set():
            time.sleep(1)
    except KeyboardInterrupt:
        logging.warning("Keyboard interrupt received, stopping listener...")
    except Exception as e:
        logging.exception(f"Listener runtime error (safe caught): {e}")
    finally:
        logging.info("Stop signal received, finalizing batch writes...")

        if streaming_future:
            try:
                streaming_future.cancel()
                time.sleep(0.5)
            except (ValueError, RuntimeError) as e:
                if "Channel closed" not in str(e):
                    logging.warning(f"Ignored gRPC cancel error: {e}")
            except Exception as e:
                logging.warning(f"Ignored gRPC cancel/shutdown error: {e}")

        try:
            if hasattr(subscriber, "_executor"):
                subscriber._executor.shutdown(wait=False)
        except Exception as e:
            logging.warning(f"Ignored executor shutdown error: {e}")

        time.sleep(0.5)
        logging.info("Finalizing DB writes...")

        stop_event.set()

        while not db_queue.empty():
            time.sleep(0.5)

        if not db_queue.empty():
            logging.warning(f"DB queue not empty after timeout ({db_queue.qsize()} items left), forcing shutdown.")

        if worker_thread.is_alive():
            worker_thread.join(timeout=0.1)
            if worker_thread.is_alive():
                logging.warning("Worker thread did not exit cleanly, continuing shutdown.")

        try:
            subscriber.close()
        except (ValueError, RuntimeError) as e:
            if "Channel closed" not in str(e):
                logging.warning(f"Ignored subscriber close error: {e}")
        except Exception as e:
            logging.warning(f"Ignored subscriber close error: {e}")

        try:
            Session.remove()
        except Exception:
            pass

        logging.info("Listener stopped successfully, all messages processed (or safely aborted).")

    db_queue.join()
    worker_thread.join(timeout=5)
    Session.remove()

    logging.info("Listener stopped.")
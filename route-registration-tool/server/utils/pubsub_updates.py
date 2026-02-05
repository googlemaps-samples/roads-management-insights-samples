import asyncio
from datetime import datetime, timezone
import json
import logging
from google.cloud import pubsub_v1
from google.api_core.exceptions import AlreadyExists, NotFound, PermissionDenied

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

class ClientSubscription:
    def __init__(self, websocket, project_id: str, project_number: int,
                 max_batch_size=1000, max_wait_seconds=30):
        self.ws = websocket
        self.project_id = project_id
        self.project_number = project_number
        self.max_batch_size = max_batch_size
        self.max_wait_seconds = max_wait_seconds

        self.latest_messages = {}
        self.last_batch_time = datetime.now(timezone.utc)
        self.total_messages_parsed = 0

        self._subscriber = None
        self._subscription_future = None
        self._loop = asyncio.get_running_loop()
        self._running = True
        self._lock = asyncio.Lock()

    async def start(self):
        """Start Pub/Sub subscription and listen."""
        self._subscriber = pubsub_v1.SubscriberClient()
        subscription_id = "hyd-test-sub"
        topic_path = f"projects/maps-platform-roads-management/topics/rmi-roadsinformation-{self.project_number}-json"
        subscription_path = self._subscriber.subscription_path(self.project_id, subscription_id)

        # Create subscription if it doesn't exist
        logger.info(f"Creating/Checking subscription: {subscription_path}")
        try:
            self._subscriber.create_subscription(
                request={"name": subscription_path, "topic": topic_path}
            )
            logger.info(f"Subscription created successfully: {subscription_path}")
        except AlreadyExists:
            logger.info(f"Subscription already exists: {subscription_path}")
        except PermissionDenied as e:
            # This is expected if Pub/Sub permissions aren't configured
            # The WebSocket will still work for route status updates
            logger.warning(f"Pub/Sub permission denied (this is OK - route status updates will still work): {e.message}")
            return ("Permission denied")
        except NotFound as e:
            # This is expected if the topic doesn't exist
            # The WebSocket will still work for route status updates
            logger.warning(f"Pub/Sub topic not found (this is OK - route status updates will still work): {e.message}")
            return ("Topic not found")
        except Exception as e:
            logger.warning(f"Pub/Sub unexpected error (this is OK - route status updates will still work): {e}")
            return ("Unexpected error")
        
        logger.info(f"Listening to Pub/Sub: {subscription_path}")

        def callback(message):
            if not self._running:
                # Client disconnected, just ack to remove from queue
                try:
                    message.ack()
                except Exception:
                    pass
                return
            try:
                raw = json.loads(message.data.decode("utf-8"))
                formatted = self.format_message(raw)
                route_id = formatted["selected_route_id"]
                self.latest_messages[route_id] = formatted
                self.total_messages_parsed += 1

                # Schedule batch check in main event loop
                asyncio.run_coroutine_threadsafe(self.check_batch_conditions(), self._loop)
                try:
                    message.ack()
                except Exception as e:
                    logger.warning(f"Failed to ack message: {e}")
            except Exception as e:
                logger.exception(f"Error parsing Pub/Sub message: {e}")
                try:
                    message.nack()
                except Exception:
                    pass

        self._subscription_future = self._subscriber.subscribe(subscription_path, callback=callback)

    async def stop(self):
        """Stop listening and clean up."""
        self._running = False
        if self._subscription_future:
            logger.info("Cancelling streaming pull future...")
            self._subscription_future.cancel()
            try:
                # Wait for the future to fully terminate
                await asyncio.wrap_future(self._subscription_future)
            except asyncio.CancelledError:
                # Expected when cancelling the subscription
                logger.debug("Subscription future cancelled successfully")
            except Exception as e:
                # Log any other unexpected errors but don't raise
                logger.warning(f"Error while waiting for subscription future to terminate: {e}")
            finally:
                if self._subscriber:
                    logger.info("Closing subscriber client...")
                    try:
                        self._subscriber.close()
                    except Exception as e:
                        logger.warning(f"Error closing subscriber client: {e}")
                    finally:
                        self._subscriber = None
                logger.info(f"Stopped Pub/Sub subscription for client {getattr(self.ws, 'client', 'unknown')}")
        logger.info(f"Total messages parsed: {self.total_messages_parsed}")

    async def broadcast_batch(self):
        """Send accumulated batch to WebSocket."""
        async with self._lock:
            if not self.latest_messages:
                return
            batch = list(self.latest_messages.values())
            try:
                await self.ws.send_text(json.dumps({"batch": batch}))
                logging.info(
                    f"Batch sent: {len(batch)} messages, total parsed: {self.total_messages_parsed}"
                )
            except Exception as e:
                logging.error(f"Error sending batch to WebSocket: {e}")
            finally:
                self.latest_messages = {}
                self.last_batch_time = datetime.now(timezone.utc)

    async def check_batch_conditions(self):
        """Check if batch conditions are met and broadcast."""
        if not self._running:
            return
        now = datetime.now(timezone.utc)
        if len(self.latest_messages) >= self.max_batch_size or \
           (now - self.last_batch_time).total_seconds() >= self.max_wait_seconds:
            await self.broadcast_batch()

    def format_message(self, raw: dict):
        """Format Pub/Sub message to client-friendly structure."""
        out = {
            "selected_route_id": raw.get("selected_route_id"),
            "display_name": raw.get("display_name"),
        }
        ts = raw.get("retrieval_time", {})
        seconds = ts.get("seconds", 0)
        nanos = ts.get("nanos", 0)
        dt = datetime.fromtimestamp(seconds + nanos / 1e9)
        out["retrieval_time"] = dt.strftime("%Y-%m-%d %H:%M:%S")

        dur = raw.get("travel_duration", {})
        out["static_duration_in_seconds"] = dur.get("static_duration_in_seconds")
        out["current_duration_in_seconds"] = dur.get("duration_in_seconds")

        speeds = raw.get("speed_reading_intervals", [])
        out["speed_reading_intervals"] = speeds[0]["speed"] if speeds else None
        
        return out
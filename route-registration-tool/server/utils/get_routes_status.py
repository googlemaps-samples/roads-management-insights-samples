from .create_engine import engine
from sqlalchemy import text
from .google_roads_api import list_routes
import logging

# -------------------------------------------------
# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
# -------------------------------------------------

class RouteUpdater:
    def __init__(self, project_number):
        self.project_number = project_number
        self.engine = engine

    def get_all_selected_routes(self):
        """
        Fetch all selected routes, handling pagination.
        """
        try:
            return list_routes(self.project_number)
        except Exception as e:
            logging.exception(f"Error fetching selected routes: {e}")
            return []

    def update_routes_in_db(self, routes):
        """
        Update `routes` table with the latest route states.
        """
        updated_count = 0
        try:
            with self.engine.begin() as conn:
                for route in routes:
                    selected_route_id = route["name"].split("/")[-1]
                    state = route.get("state", "UNKNOWN")

                    query = text("""
                        UPDATE routes
                        SET routes_status = :state
                        WHERE uuid = :uuid
                    """)
                    result = conn.execute(query, {"state": state, "uuid": selected_route_id})
                    updated_count += result.rowcount

            logging.info(f"Total routes updated: {updated_count}")
        except Exception as e:
            logging.exception(f"Error updating routes in DB: {e}")

    def run(self):
        logging.info("Fetching selected routes from Roads API...")
        routes = self.get_all_selected_routes()
        logging.info(f"Found {len(routes)} routes.")

        logging.info("Updating database records...")
        self.update_routes_in_db(routes)
        logging.info("Done.")

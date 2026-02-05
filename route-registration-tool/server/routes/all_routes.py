from fastapi import APIRouter
from .routes import router as routes_router
from .roads import router as roads_router
from .roads_connectivity import router as roads_connectivity_router
from .sync import router as sync_router
from .projects import router as projects_router
from .tiles import router as tiles_router
from .pubsub import router as pubsub_router
from .routes_status import router as routes_status_router
from .polygon_routes_api import router as polygon_routes_api_router
from .projects_list import router as projects_list_router
from .sync_status_route import router as sync_status_route_router
from .users import router as users_router
from .verify_details_route import router as verify_details_route_router
from .intersections import router as intersections_router
from .batch_save import router as batch_save_router
from .tag_routes import router as tag_routes_router
from .file_upload import router as file_upload_router
from .segmentation import router as segmentation_router
from .export import router as export_router
from .import_project import router as import_project_router
from .stretch_roads import router as stretch_roads_router
from .bigquery import router as bigquery_router

# Create a single router that includes all others
router = APIRouter()

router.include_router(routes_router, prefix="", tags=["Routes"])
router.include_router(roads_router, prefix="", tags=["Roads"])
# router.include_router(roads_connectivity_router, prefix="", tags=["Roads Connectivity"])
router.include_router(sync_router, prefix="", tags=["Sync"])
router.include_router(projects_router, prefix="", tags=["Projects"])
router.include_router(tiles_router, prefix="/tiles", tags=["Tiles"])
router.include_router(pubsub_router, prefix="", tags=["Pub/Sub"])
router.include_router(routes_status_router, prefix="", tags=["Routes Status"])
router.include_router(polygon_routes_api_router, prefix="/polygon", tags=["Polygon Routes API"])
router.include_router(projects_list_router, prefix="", tags=["Projects"])
router.include_router(sync_status_route_router, prefix="", tags=["Sync Status Route"])
router.include_router(users_router, prefix="", tags=["Users"])
router.include_router(verify_details_route_router, prefix="", tags=["Verify Details Route"])
router.include_router(file_upload_router, prefix="", tags=["File Upload"])
router.include_router(intersections_router, prefix="", tags=["Intersections"])
router.include_router(tag_routes_router, prefix="", tags=["Tag Routes"])
router.include_router(batch_save_router, prefix="", tags=["Batch Save"])
router.include_router(segmentation_router, prefix="", tags=["Routes Segmentation"])
router.include_router(export_router, prefix="", tags=["Export"])
router.include_router(import_project_router, prefix="", tags=["Import Project"])
router.include_router(stretch_roads_router, prefix="", tags=["Stretch Roads"])
router.include_router(bigquery_router, prefix="", tags=["BigQuery"])
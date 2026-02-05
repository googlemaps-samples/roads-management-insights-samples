from fastapi import APIRouter
from pydantic import BaseModel
from server.utils.verify_project_details import verify_project_details

router = APIRouter()

class VerifyProjectDetailsConfig(BaseModel):
    project_id: str

@router.post("/verify-project-details")
async def verify_project_details_route(config: VerifyProjectDetailsConfig):
    """
    Verify the details of a project.
    """
    return await verify_project_details(config.project_id)

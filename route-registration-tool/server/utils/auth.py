from google.auth import default
from google.auth.transport.requests import Request
from google.auth.exceptions import DefaultCredentialsError
import asyncio

async def get_oauth_token():
    try:
        credentials, _ = default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        await asyncio.to_thread(credentials.refresh, Request())
        return credentials.token
    except DefaultCredentialsError as e:
        raise RuntimeError(f"Failed to get default credentials: {e}")
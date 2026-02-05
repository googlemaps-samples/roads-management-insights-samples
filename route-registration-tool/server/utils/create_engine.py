import os
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine
DB_PATH = "my_database.db"

engine = create_engine(f"sqlite:///{os.path.abspath(DB_PATH)}", pool_pre_ping=True)
async_engine = create_async_engine(f"sqlite+aiosqlite:///{os.path.abspath(DB_PATH)}", pool_pre_ping=True)
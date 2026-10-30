"""Database URL and SQLAlchemy engine setup."""

import os

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from dotenv import load_dotenv

load_dotenv()


def database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL must be set before using the database.")
    return url


def create_database_engine(url: str | None = None) -> Engine:
    return create_engine(
        url or database_url(),
        pool_pre_ping=True,
        connect_args={"connect_timeout": 5},
    )

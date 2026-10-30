"""FastAPI application entry point for the urban heat platform."""

import os
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

import uvicorn
from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv()


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    """Create shared services once for the lifetime of the API process."""
    from urban_heat_mitigation.db.connection import create_database_engine
    from urban_heat_mitigation.ml.service import ModelService

    database_engine = create_database_engine()
    application.state.database_engine = database_engine
    try:
        application.state.model_service = ModelService.load()
        yield
    finally:
        if hasattr(application.state, "model_service"):
            del application.state.model_service
        database_engine.dispose()
        del application.state.database_engine


app = FastAPI(
    title="Urbivue Urban Heat Intelligence API",
    version="0.1.0",
    description="API for observed urban heat data and model-based analysis.",
    lifespan=lifespan,
)

from urban_heat_mitigation.api.routes.dashboard import router as dashboard_router
from urban_heat_mitigation.api.routes.insights import router as insights_router
from urban_heat_mitigation.api.routes.scenarios import router as scenarios_router
from urban_heat_mitigation.api.routes.spatial import router as spatial_router

app.include_router(spatial_router)
app.include_router(dashboard_router)
app.include_router(scenarios_router)
app.include_router(insights_router)


@app.get("/api/v1/health", tags=["health"])
def health() -> dict[str, str]:
    """Report that the API process is responsive."""
    return {"status": "ok"}


def main() -> None:
    """Run the local development server."""
    uvicorn.run(
        "urban_heat_mitigation.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )

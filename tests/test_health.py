from urban_heat_mitigation.main import app


def test_health_endpoint_is_registered_and_reports_api_status() -> None:
    route = next(
        route
        for route in app.routes
        if getattr(route, "path", None) == "/api/v1/health"
    )

    assert "GET" in route.methods
    assert route.endpoint() == {"status": "ok"}


def test_versioned_spatial_routes_are_in_openapi() -> None:
    paths = app.openapi()["paths"]

    assert "/api/v1/heatmap" in paths
    assert "/api/v1/locations/nearest" in paths
    assert "/api/v1/locations/{cell_id}" in paths
    assert "/api/v1/periods" in paths
    assert "/api/v1/dashboard/summary" in paths

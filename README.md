# Urbivue — Delhi Urban Heat Intelligence Platform

Backend starter for the Delhi urban heat analysis application.

## Backend setup

Install the pinned Python runtime and project dependencies with `uv`:

```powershell
uv sync
```

Run the API locally:

```powershell
uv run urban-heat-mitigation
```

The initial health endpoint is available at `GET /api/v1/health`.

Run the backend tests:

```powershell
uv run pytest
```

The local dataset and model files are intentionally excluded from Git. Their paths will be configured for the data import and model services in later stages.

## Local PostGIS database

1. Copy `.env.example` to `.env` and replace `POSTGRES_PASSWORD` and the matching password in `DATABASE_URL` with a local password.
2. Start PostGIS with `docker compose up -d db`.
3. Apply the tracked schema migration with `uv run alembic upgrade head`.
4. Import the processed master CSV with `uv run import-urban-heat-master`.

The importer reads `URBAN_HEAT_DATA_PATH` (default: `data/processed/Delhi_Master_Dataset.csv`), hashes the source file, streams 2,000 rows per batch, and upserts cells and observations in one transaction. Reimporting the same file hash is a no-op. Each observation is unique by cell, year, and month; duplicate rows cause the import transaction to fail its count check. The local database is bound to `127.0.0.1` and uses a persistent Docker volume.

## Spatial API

- `GET /api/v1/heatmap?west=76.8&south=28.4&east=77.4&north=29.0&year=2025&month=5` returns a bounded GeoJSON FeatureCollection of **observed** LST points. The default limit is 2,500 (maximum 10,000); `truncated` indicates that the viewport has more rows than returned.
- `GET /api/v1/locations/nearest?latitude=28.63&longitude=77.20&year=2025&month=5` finds the nearest cell with an observation in that period.
- `GET /api/v1/locations/{cell_id}?year=2025&month=5` returns that cell’s observed LST and environmental features.
- `GET /api/v1/periods` lists periods present in the imported database.
- `GET /api/v1/dashboard/summary?year=2025&month=5` returns observed LST statistics and 5°C distribution bins for the dashboard.
- `GET /api/v1/insights/hotspots?year=2025&month=5&limit=100` ranks observed cells by stored LST (maximum 500).
- `GET /api/v1/exports/observations.csv?year=2025&month=5&limit=50000` exports selected-period observations and environmental features (maximum 50,000 rows).
- `GET /api/v1/models/current` returns the loaded Random Forest artifact name, exact feature order, and global impurity-based feature importances.

Location responses identify temperature as `observed` and keep model estimates separate. Unsupported periods return 404 for location lookups; invalid viewport bounds return 422.

## Cooling scenarios

`POST /api/v1/scenarios` accepts one of `cell_id`, a `latitude`/`longitude` pair, or `coordinate_code`, plus a period and absolute changes for one or more of `NDVI`, `EVI`, `TreeCover`, and `BuiltSurface`. The compact code is `latitude-longitude`, for example `28.61-77.21`; the backend parses it into latitude and longitude and applies the same geographic range validation. Coordinate lookups resolve to the nearest cell with an observation in the requested period; the response returns that resolved cell ID and coordinates. Latitude must be −90..90, longitude −180..180, and TreeCover/BuiltSurface scenario values cannot be negative. NDVI/EVI may be negative. The route retrieves the stored feature vector, applies only submitted changes, and runs the loaded model on baseline and modified vectors. The response labels both values as model estimates and includes their estimated difference. This is a model-based what-if comparison, not a measured or causal cooling effect. Other correlated inputs remain fixed. The endpoint flags values beyond the master dataset's observed min/max; that is a coarse support check, not a complete training-distribution test.

The master CSV does not contain `cell_id`. During import, the app creates a stable SHA-256 cell ID from each latitude/longitude pair rounded to six decimal places. The same coordinates therefore map to the same ID in repeat imports.

From a selected cell in the map or location detail panel, choose **Explore a cooling scenario**. The details panel shows a copyable location code formed from the selected point's coordinates. On the scenario page, choose cell ID, latitude/longitude, or location code. Coordinate inputs resolve to the nearest cell with data for the selected month and display the resolved cell ID and distance; change one or more feature values and compare estimates. Invalid inputs and unsupported cells/periods are rejected instead of imputed.

## Insights and exports

The Insights page ranks up to 100 cells by descending **observed** LST for the selected period and links each cell to its scenario page. Its CSV download uses the selected period and includes identifiers, coordinates, observed LST, and stored environmental features. The API export is capped at 50,000 rows; increase the cap only with a reviewed pagination or streaming design if future periods exceed it. No model predictions are included in this observed-data export.

The same page displays the loaded model's global impurity-based feature importances from the Random Forest artifact. These values describe how the fitted forest used input features across its trees; they are not causal effects or explanations for an individual location. Historical validation metrics are omitted from the API because their match to this exact artifact has not been independently reproduced.

## Verification

Run backend unit and contract checks with `uv run pytest`. PostGIS integration checks are optional and require the local Compose database to be running: in PowerShell, set `$env:URBAN_HEAT_RUN_DB_TESTS='1'` and run `uv run pytest tests/test_spatial_api.py`. These cover viewport, nearest-cell, selected-cell, summary, hotspot ranking, and CSV export queries against imported data. Frontend checks run from `frontend`: `npm run lint`, `npm test`, and `npm run build`.

## Container build and local deployment preview

The root `Dockerfile` builds the API from the locked `uv` project, and `frontend/Dockerfile` builds the static frontend served by Nginx. The API image excludes the private dataset and model; Compose mounts the existing model directory read-only at runtime. No model or source dataset is copied into either image.

1. Configure `.env` with a URL-safe local database password and confirm `URBAN_HEAT_MODEL_DIR` points to the directory containing `urban_heat_rf.pkl`.
2. Run `docker compose up -d db`.
3. Apply migrations and import from the host with the documented `uv run alembic upgrade head` and `uv run import-urban-heat-master` commands (skip the import if the existing DB is already populated).
4. Build and start the application with `docker compose up --build -d api frontend`.
5. Open `http://127.0.0.1:8080`; the API is available locally at `http://127.0.0.1:8000`.

The API and frontend ports bind to loopback. This is a local deployment preview, not a public production configuration; a public deployment still needs a managed secret store, TLS ingress, backups, resource sizing for the large memory-mapped model, and an explicit hosting target. The API's `/api/v1/health` endpoint confirms process readiness, while database integration checks confirm the imported schema and data.

## Frontend

In a second terminal, run `cd frontend`, `npm install`, and `npm run dev`. The Vite development server proxies `/api` to `http://127.0.0.1:8000`; set `VITE_API_PROXY_TARGET` if the backend uses another local address. For a deployed backend, set `VITE_API_BASE_URL`. Run `npm test`, `npm run lint`, and `npm run build` to check the React application.

The dashboard uses `GET /api/v1/periods` and `GET /api/v1/dashboard/summary`. The summary is aggregated directly from the selected period’s stored observations; no example metrics are embedded in the page.

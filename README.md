# Urbivue

**Delhi Urban Heat Intelligence Platform**

Urbivue is a local web application for exploring monthly land surface temperature (LST) observations across Delhi. It combines a React map and analysis pages with a FastAPI service, a PostGIS database, and a previously trained Random Forest model.

The application keeps stored observations distinct from model estimates. A scenario result is a model-based what-if estimate; it is not a satellite measurement or evidence of a causal cooling effect.

## Features

- **Overview:** observed LST summaries and distribution for a selected month.
- **Heat map:** pan and zoom through observed LST cells; inspect a cell or search the nearest observed cell to a clicked coordinate.
- **Location analysis:** search by latitude and longitude and inspect the selected cell's observed LST and environmental features.
- **Cooling scenarios:** compare baseline and scenario estimates using a cell ID, coordinates, or a copyable location code.
- **Insights and reports:** rank the hottest observed cells, view global model feature importances, and download a selected month's observations as CSV.

## Data and model

- The processed master dataset is expected at `data/processed/Delhi_Master_Dataset.csv` unless `URBAN_HEAT_DATA_PATH` overrides it.
- The dataset contains monthly cell observations. The period selector reads periods from the database; it does not create weekly or daily views. The currently imported master data has 22 available monthly periods across 2021–2025.
- The master CSV does not contain `cell_id`. During import, the app generates a stable SHA-256 identifier from latitude and longitude rounded to six decimal places.
- The previously trained Random Forest artifact is expected at `artifacts/models/urban_heat_rf.pkl` unless `URBAN_HEAT_MODEL_PATH` overrides it. The API loads it once at startup; it is not retrained by this application.
- Large/private data and model files are excluded from Git and Docker build contexts. The Docker API mounts the model directory read-only at runtime.

### Scenario inputs

The scenario form accepts exactly one location selector:

1. **Cell ID** — the generated database identifier.
2. **Latitude and longitude** — the API resolves the nearest cell with an observation for the selected month.
3. **Location code** — a compact `latitude-longitude` value copied from a selected location, such as `28.61-77.21`. The backend parses the code into latitude and longitude and then resolves the nearest observed cell.

Latitude must be between −90 and 90; longitude must be between −180 and 180. TreeCover and BuiltSurface scenario values must be non-negative. NDVI and EVI can be negative. The API warns when changed values fall outside the imported dataset's min/max range; this is only a coarse support check, not a full training-distribution check.

Scenario changes are **absolute feature values**. The model keeps all other features fixed, including correlated features. The reported difference is an estimate from the model, not a guaranteed real-world temperature change.

## Requirements

- Windows with PowerShell, or an equivalent shell
- Python 3.12 or newer, managed with [`uv`](https://docs.astral.sh/uv/)
- Node.js 22 or newer and npm
- Docker Desktop running the PostGIS database

## First-time setup

Run commands from the repository root unless a step says to change directories.

### 1. Configure environment variables

If `.env` does not exist, create it from the example:

```powershell
Copy-Item .env.example .env
```

Set `POSTGRES_PASSWORD` in `.env` to a local URL-safe password and use the same password in `DATABASE_URL`. The example file contains placeholders only. Keep `.env` private; it is ignored by Git.

The defaults point to the processed master CSV and model artifact paths above. For the Docker API, `URBAN_HEAT_MODEL_DIR` must point to the directory containing `urban_heat_rf.pkl`.

### 2. Install Python dependencies

```powershell
uv sync
```

`uv run` executes project commands using the locked environment. The `urban-heat-mitigation` command starts Uvicorn, the ASGI server used by FastAPI.

### 3. Start PostGIS and prepare the database

Start Docker Desktop, then run:

```powershell
docker compose up -d db
uv run alembic upgrade head
```

Import the processed dataset **once for an empty database**, or when you intentionally change the source dataset:

```powershell
uv run import-urban-heat-master
```

The importer streams rows in batches, records the source file hash, and skips the same file hash on re-import. You do not need to run it every time you start the application. The PostgreSQL data lives in a persistent Docker volume.

### 4. Install frontend dependencies

```powershell
cd frontend
npm ci
cd ..
```

## Run locally in VS Code

Keep Docker Desktop running for PostGIS. Open three VS Code terminals in the repository.

**Terminal 1 — database** (run after Docker Desktop starts):

```powershell
docker compose up -d db
```

**Terminal 2 — backend** (repository root):

```powershell
uv run urban-heat-mitigation
```

The API listens on `http://127.0.0.1:8000`. Check it at `http://127.0.0.1:8000/api/v1/health`.

**Terminal 3 — frontend:**

```powershell
cd frontend
npm run dev
```

Open the Vite URL printed in the terminal, usually `http://localhost:5173`. Vite proxies `/api` requests to the local backend. To use a different backend address, set `VITE_API_PROXY_TARGET` in the frontend environment.

### Starting the app on later days

Start Docker Desktop, run `docker compose up -d db`, then start the backend and frontend in separate terminals as above. **Do not run the CSV import during normal startup.**

## Docker preview

The Compose setup can also run the API and built frontend in containers. Use this instead of starting the local API on port 8000; both modes use that port.

```powershell
docker compose up -d db
uv run alembic upgrade head
# Run the import command only if the database is empty or needs a new source file.
docker compose up --build -d api frontend
```

Open `http://127.0.0.1:8080`. The container API is available at `http://127.0.0.1:8000`. To return to local VS Code mode, stop the app containers while leaving the database running:

```powershell
docker compose stop api frontend
```

The Docker images exclude the model and dataset; Compose mounts the model directory read-only. This is a local preview configuration, not a public production deployment.

## Application guide

### Overview

Choose an available month to review stored observation counts, LST statistics, and the temperature distribution.

### Heat map

Choose a month, pan or zoom the map, then select a point to inspect its cell. Clicking elsewhere finds the nearest cell with an observation for that month. The displayed map layer is **observed LST**; it is not a model prediction.

The location details panel shows a database Cell ID and a copyable Location code. Paste the location code into Cooling scenarios when you want to use the selected point without copying separate coordinates.

### Locations

Enter latitude and longitude, select a month, and search for the nearest cell with an observation in that period.

### Cooling scenarios

Choose a cell by ID, coordinates, or location code. After the app resolves the cell and loads its environmental features, change one or more of NDVI, EVI, TreeCover, or BuiltSurface, then select **Compare estimates**. The result labels baseline and scenario values as model estimates and shows the resolved cell and period.

### Insights and reports

Select a month to see the top 100 cells ranked by observed LST. The CSV download is capped at 50,000 rows and contains stored observations and environmental features; it does not include scenario predictions. Feature importances are global impurity-based importances from the loaded Random Forest, not causal effects or per-location explanations.

## API reference

All endpoints use the `/api/v1` prefix.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | API process health |
| `GET /periods` | Months present in the database |
| `GET /dashboard/summary?year=2025&month=5` | Stored observation summaries and temperature bins |
| `GET /heatmap?...` | Bounded GeoJSON of observed LST points; default limit 2,500, maximum 10,000 |
| `GET /locations/nearest?...` | Nearest cell with an observation in the selected month |
| `GET /locations/{cell_id}?year=2025&month=5` | Stored cell observation and environmental features |
| `POST /scenarios` | Baseline and scenario model estimates |
| `GET /insights/hotspots?year=2025&month=5&limit=100` | Hottest observed cells; maximum 500 |
| `GET /exports/observations.csv?year=2025&month=5&limit=50000` | Selected-month CSV; maximum 50,000 rows |
| `GET /models/current` | Loaded model name, feature order, and global feature importances |

Example coordinate-code scenario request:

```json
{
  "coordinate_code": "28.61-77.21",
  "year": 2025,
  "month": 5,
  "changes": { "NDVI": 0.4 }
}
```

Use exactly one of `cell_id`, both `latitude` and `longitude`, or `coordinate_code`. Successful scenario responses identify `temperature_type` as `model_estimate`. Invalid input returns a validation response; unsupported observations return a not-found response.

## Tests and quality checks

Run backend tests from the repository root:

```powershell
uv run pytest
```

PostGIS integration tests are skipped by default. With the database running, enable them in PowerShell:

```powershell
$env:URBAN_HEAT_RUN_DB_TESTS = "1"
uv run pytest tests/test_spatial_api.py
```

Run frontend checks from `frontend`:

```powershell
npm run lint
npm test
npm run build
```

## Troubleshooting

### Port 8000 is already in use

The Docker API preview or another backend may already be using port 8000. To use the local VS Code backend while keeping PostGIS up:

```powershell
docker compose stop api frontend
```

Then restart `uv run urban-heat-mitigation` from the repository root.

### Scenario request returns 422

Restart the backend after changing Python code; the app starts Uvicorn without automatic reload. In the response, exactly one location selector must be supplied, along with `year`, `month`, and at least one supported feature change. Check the validation detail shown below the form for the specific field and reason.

### Model artifact is not found

Check that `artifacts/models/urban_heat_rf.pkl` exists, or set `URBAN_HEAT_MODEL_PATH`. In Docker mode, confirm `URBAN_HEAT_MODEL_DIR` points to the folder containing that file.

### No periods appear in the app

Confirm that PostGIS is running and the master CSV has been imported into the database. Check `http://127.0.0.1:8000/api/v1/periods` while the backend is running.

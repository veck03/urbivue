# Urbivue frontend

This directory contains the React, TypeScript, and Vite frontend for Urbivue. For complete database, backend, model, and Docker setup instructions, see the [project README](../README.md).

## Development

Install dependencies from this directory and start Vite:

```powershell
npm ci
npm run dev
```

The development server prints the local URL, usually `http://localhost:5173`. It proxies `/api` requests to the FastAPI backend at `http://127.0.0.1:8000`. Start the backend and PostGIS database using the project README.

## Checks

```powershell
npm run lint
npm test
npm run build
```

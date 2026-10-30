import type {
  AvailablePeriod,
  DashboardSummary,
  HeatmapResponse,
  LocationResponse,
  ScenarioResponse,
  Hotspot,
  ModelMetadata,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function formatApiDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item: unknown) => {
      if (!item || typeof item !== "object") return String(item);
      const issue = item as { loc?: unknown[]; msg?: unknown };
      const location = Array.isArray(issue.loc)
        ? issue.loc.filter((part) => part !== "body").map(String).join(".")
        : "";
      const message = typeof issue.msg === "string" ? issue.msg : JSON.stringify(item);
      return location ? `${location}: ${message}` : message;
    });
    return messages.join("; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return null;
}

async function responseError(response: Response): Promise<Error> {
  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as { detail?: unknown };
    message = formatApiDetail(body.detail) ?? message;
  } catch {
    // Keep the status-based message when an error response has no JSON body.
  }
  return new Error(message);
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw await responseError(response);
  }
  return (await response.json()) as T;
}

export function fetchAvailablePeriods(signal?: AbortSignal) {
  return getJson<AvailablePeriod[]>("/api/v1/periods", signal);
}

export function fetchDashboardSummary(
  year: number,
  month: number,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ year: String(year), month: String(month) });
  return getJson<DashboardSummary>(`/api/v1/dashboard/summary?${query}`, signal);
}

export interface ViewportBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function fetchHeatmap(
  bounds: ViewportBounds,
  year: number,
  month: number,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, value.toFixed(6)])),
    year: String(year),
    month: String(month),
    limit: "2500",
  });
  return getJson<HeatmapResponse>(`/api/v1/heatmap?${query}`, signal);
}

export function fetchLocationDetails(
  cellId: string,
  year: number,
  month: number,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ year: String(year), month: String(month) });
  return getJson<LocationResponse>(
    `/api/v1/locations/${encodeURIComponent(cellId)}?${query}`,
    signal,
  );
}

export function fetchNearestLocation(
  latitude: number,
  longitude: number,
  year: number,
  month: number,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    year: String(year),
    month: String(month),
  });
  return getJson<LocationResponse>(`/api/v1/locations/nearest?${query}`, signal);
}

export function postScenario(
  request: ({ cell_id: string } | { latitude: number; longitude: number } | { coordinate_code: string }) & {
    year: number; month: number; changes: Record<string, number>;
  },
  signal?: AbortSignal,
) {
  return fetch(`${API_BASE_URL}/api/v1/scenarios`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  }).then(async (response) => {
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as ScenarioResponse;
  });
}

export function fetchHotspots(year: number, month: number, signal?: AbortSignal) {
  const query = new URLSearchParams({ year: String(year), month: String(month), limit: "100" });
  return getJson<Hotspot[]>(`/api/v1/insights/hotspots?${query}`, signal);
}

export function observationExportUrl(year: number, month: number) {
  const query = new URLSearchParams({ year: String(year), month: String(month), limit: "50000" });
  return `${API_BASE_URL}/api/v1/exports/observations.csv?${query}`;
}

export function fetchCurrentModel(signal?: AbortSignal) {
  return getJson<ModelMetadata>("/api/v1/models/current", signal);
}

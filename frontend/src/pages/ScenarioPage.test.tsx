import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import ScenarioPage from "./ScenarioPage";

function jsonResponse(value: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value } as Response;
}

const periods = [{ year: 2025, month: 5 }];
const location = {
  cell_id: "resolved-from-coordinates",
  latitude: 28.61,
  longitude: 77.21,
  year: 2025,
  month: 5,
  observed_lst_c: 39,
  temperature_type: "observed",
  distance_m: 120,
  environmental_features: { NDVI: 0.3, EVI: 0.2, TreeCover: 0.1, BuiltSurface: 30 },
};
const result = {
  cell_id: location.cell_id,
  latitude: location.latitude,
  longitude: location.longitude,
  distance_m: 120,
  year: 2025,
  month: 5,
  temperature_type: "model_estimate",
  baseline_prediction_c: 39,
  scenario_prediction_c: 37.5,
  estimated_change_c: -1.5,
  changes: { NDVI: 0.5 },
  outside_dataset_range: false,
  assumptions: ["Model based estimate."],
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("cooling scenario location selection", () => {
  it("resolves coordinates for the selected period and submits coordinate-based scenario", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/periods")) return Promise.resolve(jsonResponse(periods));
      if (url.includes("/api/v1/locations/nearest")) return Promise.resolve(jsonResponse(location));
      if (url.includes("/api/v1/scenarios")) return Promise.resolve(jsonResponse(result));
      throw new Error(`Unexpected request: ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MemoryRouter initialEntries={["/scenarios?latitude=28.6&longitude=77.2"]}><Routes><Route path="/scenarios" element={<ScenarioPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByText("resolved-from-coordinates")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("latitude=28.6") && String(url).includes("longitude=77.2"))).toBe(true);
    fireEvent.change(screen.getByLabelText("NDVI"), { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: /compare estimates/i }));

    expect(await screen.findByText("37.50", { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/scenarios",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"latitude":28.6') }),
    ));
    const submitted = JSON.parse(fetchMock.mock.calls.find(([url]) => String(url).includes("/api/v1/scenarios"))![1].body as string) as Record<string, unknown>;
    expect(submitted.longitude).toBe(77.2);
    expect(submitted.cell_id).toBeUndefined();
  });

  it("loads the scenario baseline by cell ID when opened from a selected cell", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/periods")) return Promise.resolve(jsonResponse(periods));
      if (url.includes("/api/v1/locations/cell-123")) return Promise.resolve(jsonResponse({ ...location, cell_id: "cell-123", distance_m: null }));
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MemoryRouter initialEntries={["/scenarios?cell_id=cell-123&year=2025&month=5"]}><Routes><Route path="/scenarios" element={<ScenarioPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByText("cell-123")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/v1/locations/cell-123"))).toBe(true);
  });

  it("uses a pasted location code and sends it for backend coordinate normalization", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/periods")) return Promise.resolve(jsonResponse(periods));
      if (url.includes("/api/v1/locations/nearest")) return Promise.resolve(jsonResponse(location));
      if (url.includes("/api/v1/scenarios")) return Promise.resolve(jsonResponse(result));
      throw new Error(`Unexpected request: ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MemoryRouter initialEntries={["/scenarios?coordinate_code=28.6-77.2"]}><Routes><Route path="/scenarios" element={<ScenarioPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByText("resolved-from-coordinates")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("NDVI"), { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: /compare estimates/i }));
    await screen.findByText("37.50", { exact: false });

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/v1/scenarios"));
    expect(JSON.parse(call?.[1]?.body as string)).toMatchObject({ coordinate_code: "28.6-77.2" });
  });
});

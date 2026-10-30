import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHeatmap, fetchNearestLocation, postScenario } from "./client";

afterEach(() => vi.unstubAllGlobals());

function response(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

describe("spatial API client", () => {
  it("requests a bounded viewport and returns observed GeoJSON features", async () => {
    const payload = {
      type: "FeatureCollection",
      features: [],
      truncated: false,
      limit: 2500,
    };
    const fetchMock = vi.fn().mockResolvedValue(response(payload));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchHeatmap(
      { west: 76.8, south: 28.4, east: 77.4, north: 29.0 },
      2025,
      5,
    );

    expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/heatmap?");
    expect(fetchMock.mock.calls[0][0]).toContain("west=76.800000");
    expect(fetchMock.mock.calls[0][0]).toContain("month=5");
    expect(result.type).toBe("FeatureCollection");
    expect(result.limit).toBe(2500);
  });

  it("encodes coordinates and period for nearest-cell lookup", async () => {
    const payload = { cell_id: "abc", temperature_type: "observed" };
    const fetchMock = vi.fn().mockResolvedValue(response(payload));
    vi.stubGlobal("fetch", fetchMock);

    await fetchNearestLocation(28.6139, 77.209, 2025, 5);

    expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/locations/nearest?");
    expect(fetchMock.mock.calls[0][0]).toContain("latitude=28.6139");
    expect(fetchMock.mock.calls[0][0]).toContain("longitude=77.209");
  });

  it("formats FastAPI validation errors as readable field messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [{ loc: ["body", "changes", "TreeCover"], msg: "Input should be a valid number", type: "float_parsing" }],
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(postScenario({
      coordinate_code: "28.6-77.2",
      year: 2025,
      month: 5,
      changes: { NDVI: 0.4 },
    })).rejects.toThrow("changes.TreeCover: Input should be a valid number");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ "Content-Type": "application/json" });
  });
});

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./DashboardPage";

function jsonResponse(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}

const periods = [{ year: 2025, month: 5 }];
const summary = {
  year: 2025,
  month: 5,
  observed_cells: 49257,
  mean_lst_c: 38.2,
  min_lst_c: 21.4,
  max_lst_c: 54.8,
  mean_ndvi: 0.24,
  mean_tree_cover: 0.07,
  temperature_bins: [
    { label: "20–25°", lower_c: 20, upper_c: 25, cell_count: 50 },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dashboard data states", () => {
  it("shows loading while the selected period summary is being fetched", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(periods))
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(jsonResponse(summary)), 80)),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    expect(await screen.findByText("Observation period")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading dashboard data")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("49,257")).toBeInTheDocument();
  });

  it("shows a useful message when the summary API returns an error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(periods))
      .mockResolvedValueOnce(jsonResponse({ detail: "Database unavailable" }, 503));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    await waitFor(() => expect(screen.queryByLabelText("Loading dashboard data")).not.toBeInTheDocument());
  });
});

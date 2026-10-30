import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import LocationDetailsPanel from "./LocationDetailsPanel";

const location = {
  cell_id: "cell-123",
  latitude: 1.23,
  longitude: 25.4,
  year: 2025,
  month: 5,
  observed_lst_c: 39,
  temperature_type: "observed" as const,
  distance_m: null,
  environmental_features: {},
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("location details coordinate code", () => {
  it("shows and copies the compact latitude-longitude code", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MemoryRouter><LocationDetailsPanel location={location} loading={false} error={null} /></MemoryRouter>);

    expect(screen.getByText("1.23-25.4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy location code" }));

    expect(writeText).toHaveBeenCalledWith("1.23-25.4");
    expect(await screen.findByRole("button", { name: "Copy location code" })).toHaveTextContent("Copied");
  });
});

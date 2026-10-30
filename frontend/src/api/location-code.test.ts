import { describe, expect, it } from "vitest";
import { formatLocationCode, parseLocationCode } from "./location-code";

describe("coordinate location code", () => {
  it("formats a latitude and longitude pair", () => {
    expect(formatLocationCode(1.23, 25.4)).toBe("1.23-25.4");
  });

  it("parses signed coordinates and validates their geographic ranges", () => {
    expect(parseLocationCode("-1.23--25.4")).toEqual({ latitude: -1.23, longitude: -25.4 });
    expect(parseLocationCode("91-25.4")).toBeNull();
    expect(parseLocationCode("1.23-181")).toBeNull();
    expect(parseLocationCode("one-two")).toBeNull();
  });
});

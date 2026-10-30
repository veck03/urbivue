import { useState } from "react";
import type { LocationResponse } from "../api/types";
import { Link } from "react-router";
import { formatLocationCode } from "../api/location-code";

const featureLabels: Record<string, string> = {
  AirTemp: "Air temperature",
  BuiltSurface: "Built surface",
  DistanceToWater: "Distance to water",
  EVI: "EVI",
  Elevation: "Elevation",
  LandCover: "Land cover class",
  NDBI: "NDBI",
  NDVI: "NDVI",
  NDWI: "NDWI",
  Population: "Population",
  Slope: "Slope",
  TreeCover: "Tree cover",
  WindSpeed: "Wind speed",
  Humidity: "Humidity",
};

function displayValue(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value);
}

export default function LocationDetailsPanel({
  location,
  loading,
  error,
  onClear,
}: {
  location: LocationResponse | null;
  loading: boolean;
  error: string | null;
  onClear?: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const locationCode = location ? formatLocationCode(location.latitude, location.longitude) : "";
  const copyLabel = copyStatus.startsWith(`${locationCode}:`) ? copyStatus.slice(locationCode.length + 1) : "Copy";

  async function copyLocationCode() {
    if (!location) return;
    try {
      await navigator.clipboard.writeText(locationCode);
      setCopyStatus(`${locationCode}:Copied`);
    } catch {
      setCopyStatus(`${locationCode}:Clipboard unavailable`);
    }
  }

  return (
    <section className="location-panel" aria-label="Location details">
      <div className="location-panel-heading">
        <div>
          <p className="eyebrow">CELL INSPECTION</p>
          <h2>{location ? "Observed location" : "Location details"}</h2>
        </div>
        {(location || loading || error) && onClear && (
          <button className="clear-selection" type="button" onClick={onClear} aria-label="Clear selected location">×</button>
        )}
      </div>

      {loading && (
        <div className="detail-loading" role="status" aria-live="polite">
          <span className="spinner" />
          <span>Loading this cell’s observations…</span>
        </div>
      )}

      {!loading && error && (
        <div className="detail-message detail-error" role="alert">
          <strong>Location unavailable</strong>
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && !location && (
        <div className="detail-empty" role="status">
          <div className="empty-crosshair">⌖</div>
          <strong>Select a point or map coordinate</strong>
          <p>Choose a grid cell to inspect its observed LST and environmental features for the selected period.</p>
        </div>
      )}

      {!loading && !error && location && (
        <>
          <div className="location-coordinates">
            <span>LAT {location.latitude.toFixed(5)}</span>
            <span>LON {location.longitude.toFixed(5)}</span>
          </div>
          <div className="location-observation">
            <div>
              <span className="observed-pill"><i /> OBSERVED LST</span>
              <strong>{location.observed_lst_c.toFixed(1)}<small>°C</small></strong>
              <span className="location-period">{new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2020, location.month - 1, 1))} {location.year}</span>
            </div>
            {location.distance_m !== null && (
              <div className="distance-card">
                <span>FROM CLICK</span>
                <strong>{location.distance_m < 1000 ? `${Math.round(location.distance_m)} m` : `${(location.distance_m / 1000).toFixed(2)} km`}</strong>
              </div>
            )}
          </div>

          <div className="cell-id-row">
            <span>Cell ID</span>
            <code title={location.cell_id}>{location.cell_id.slice(0, 12)}…</code>
          </div>
          <div className="cell-id-row location-code-row">
            <span>Location code</span>
            <code title={locationCode}>{locationCode}</code>
            <button type="button" className="copy-location-code" onClick={copyLocationCode} aria-label="Copy location code">{copyLabel}</button>
          </div>

          <div className="feature-heading">
            <span>ENVIRONMENTAL FEATURES</span>
            <span>{Object.keys(location.environmental_features).length} VALUES</span>
          </div>
          <dl className="feature-list">
            {Object.entries(location.environmental_features).map(([key, value]) => (
              <div className="feature-row" key={key}>
                <dt>{featureLabels[key] ?? key}</dt>
                <dd>{displayValue(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="location-footnote">Temperature shown is the stored observed LST. No model estimate is shown in this panel.</p>
          <Link className="text-link location-scenario-link" to={`/scenarios?cell_id=${encodeURIComponent(location.cell_id)}&year=${location.year}&month=${location.month}`}>Explore a cooling scenario <span>→</span></Link>
        </>
      )}
    </section>
  );
}

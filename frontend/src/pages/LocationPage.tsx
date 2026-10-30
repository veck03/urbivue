import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { fetchAvailablePeriods, fetchNearestLocation } from "../api/client";
import type { AvailablePeriod, LocationResponse } from "../api/types";
import LocationDetailsPanel from "../components/LocationDetailsPanel";

function labelForPeriod(period: AvailablePeriod) {
  return `${new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2020, period.month - 1, 1))} ${period.year}`;
}

export default function LocationPage() {
  const [periods, setPeriods] = useState<AvailablePeriod[]>([]);
  const [periodKey, setPeriodKey] = useState("");
  const [latitude, setLatitude] = useState("28.6139");
  const [longitude, setLongitude] = useState("77.2090");
  const [location, setLocation] = useState<LocationResponse | null>(null);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAvailablePeriods(controller.signal)
      .then((items) => {
        setPeriods(items);
        if (items[0]) setPeriodKey(`${items[0].year}-${items[0].month}`);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setPeriodError(reason instanceof Error ? reason.message : "Could not load available periods.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPeriods(false);
      });
    return () => controller.abort();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lat = Number(latitude);
    const lon = Number(longitude);
    const period = periods.find((item) => `${item.year}-${item.month}` === periodKey);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      setError("Enter a latitude from −90 to 90 and a longitude from −180 to 180.");
      setLocation(null);
      return;
    }
    if (!period) {
      setError("Choose a period with available observations.");
      setLocation(null);
      return;
    }

    setLoading(true);
    setError(null);
    setLocation(null);
    try {
      const result = await fetchNearestLocation(lat, lon, period.year, period.month);
      setLocation(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not find an observed cell near this coordinate.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="content location-page-content">
      <header className="page-heading">
        <div>
          <p className="eyebrow">DELHI · POINT ANALYSIS</p>
          <h1>Inspect a location.</h1>
          <p className="page-subtitle">Enter coordinates to find the nearest cell with an observed LST for that period.</p>
        </div>
      </header>

      {periodError && <div className="state-card error-state" role="alert"><span className="state-icon">!</span><div><h2>Periods are unavailable</h2><p>{periodError}</p></div></div>}
      {loadingPeriods && <div className="skeleton location-form-skeleton" aria-label="Loading periods" aria-busy="true" />}

      {!loadingPeriods && !periodError && (
        <div className="location-analysis-layout">
          <section className="panel coordinate-form-panel">
            <p className="eyebrow">SEARCH BY COORDINATE</p>
            <h2>Find the nearest observed cell</h2>
            <p className="form-description">The result reports the dataset cell closest to your point. Distance is measured in meters.</p>
            <form className="coordinate-form" onSubmit={handleSubmit}>
              <label>
                <span>Latitude</span>
                <input type="number" inputMode="decimal" min="-90" max="90" step="any" value={latitude} onChange={(event) => { setLatitude(event.target.value); setLocation(null); setError(null); }} required />
              </label>
              <label>
                <span>Longitude</span>
                <input type="number" inputMode="decimal" min="-180" max="180" step="any" value={longitude} onChange={(event) => { setLongitude(event.target.value); setLocation(null); setError(null); }} required />
              </label>
              <label className="form-period">
                <span>Observation period</span>
                <select value={periodKey} onChange={(event) => { setPeriodKey(event.target.value); setLocation(null); setError(null); }} required>
                  {periods.map((period) => <option key={`${period.year}-${period.month}`} value={`${period.year}-${period.month}`}>{labelForPeriod(period)}</option>)}
                </select>
              </label>
              <button type="submit" className="search-button" disabled={loading}>
                {loading ? <><span className="button-spinner" /> Searching…</> : <>Find nearest cell <span>→</span></>}
              </button>
            </form>
            <p className="coordinate-hint">Tip: use a point from the map or enter coordinates in decimal degrees.</p>
          </section>

          <LocationDetailsPanel location={location} loading={loading} error={error} />
        </div>
      )}
    </main>
  );
}

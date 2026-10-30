import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";
import { fetchAvailablePeriods, fetchLocationDetails, fetchNearestLocation, postScenario } from "../api/client";
import type { AvailablePeriod, LocationResponse, ScenarioResponse } from "../api/types";
import { parseLocationCode } from "../api/location-code";

const scenarioFeatures = [
  { key: "NDVI", label: "NDVI" },
  { key: "EVI", label: "EVI" },
  { key: "TreeCover", label: "Tree cover" },
  { key: "BuiltSurface", label: "Built surface" },
] as const;

function periodLabel(period: AvailablePeriod) {
  return `${new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2020, period.month - 1, 1))} ${period.year}`;
}

export default function ScenarioPage() {
  const [searchParams] = useSearchParams();
  const [periods, setPeriods] = useState<AvailablePeriod[]>([]);
  const [periodKey, setPeriodKey] = useState(() => {
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    return year && month ? `${year}-${month}` : "";
  });
  const [lookupMode, setLookupMode] = useState<"cell_id" | "coordinates" | "coordinate_code">(
    searchParams.get("cell_id") ? "cell_id" : searchParams.get("coordinate_code") ? "coordinate_code" : "coordinates",
  );
  const [cellId, setCellId] = useState(searchParams.get("cell_id") ?? "");
  const [latitude, setLatitude] = useState(searchParams.get("latitude") ?? "");
  const [longitude, setLongitude] = useState(searchParams.get("longitude") ?? "");
  const [coordinateCode, setCoordinateCode] = useState(searchParams.get("coordinate_code") ?? "");
  const [baseline, setBaseline] = useState<LocationResponse | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ScenarioResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodsLoading, setPeriodsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchAvailablePeriods(controller.signal).then((items) => {
      setPeriods(items);
      setPeriodKey((current) => {
        const stillAvailable = items.some((period) => `${period.year}-${period.month}` === current);
        return stillAvailable ? current : items[0] ? `${items[0].year}-${items[0].month}` : "";
      });
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load periods.");
    }).finally(() => { if (!controller.signal.aborted) setPeriodsLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const [yearText, monthText] = periodKey.split("-");
    if (!yearText || !monthText) return;
    const year = Number(yearText);
    const month = Number(monthText);
    const controller = new AbortController();
    let lookup: Promise<LocationResponse> | null = null;
    if (lookupMode === "cell_id" && cellId) {
      lookup = fetchLocationDetails(cellId, year, month, controller.signal);
    } else if (lookupMode === "coordinate_code") {
      const coordinates = parseLocationCode(coordinateCode);
      if (coordinates) lookup = fetchNearestLocation(coordinates.latitude, coordinates.longitude, year, month, controller.signal);
    } else if (lookupMode === "coordinates" && latitude !== "" && longitude !== "") {
      const lat = Number(latitude);
      const lon = Number(longitude);
      if (Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180) {
        lookup = fetchNearestLocation(lat, lon, year, month, controller.signal);
      }
    }
    if (!lookup) return;
    lookup.then((location) => {
      setBaseline(location);
      setValues(Object.fromEntries(scenarioFeatures.map(({ key }) => [key, String(location.environmental_features[key] ?? "")] )));
      setError(null);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load the selected cell.");
    });
    return () => controller.abort();
  }, [cellId, coordinateCode, latitude, longitude, lookupMode, periodKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [yearText, monthText] = periodKey.split("-");
    if (!baseline || !yearText || !monthText) return;
    const negativeFeature = scenarioFeatures.find(({ key }) =>
      (key === "TreeCover" || key === "BuiltSurface") && Number(values[key]) < 0,
    );
    if (negativeFeature) {
      setError(`${negativeFeature.label} must be non-negative.`);
      return;
    }
    const changes = Object.fromEntries(scenarioFeatures
      .filter(({ key }) => Number(values[key]) !== baseline.environmental_features[key])
      .map(({ key }) => [key, Number(values[key])]));
    if (Object.values(changes).some((value) => !Number.isFinite(value))) {
      setError("Enter a finite value for each changed feature.");
      return;
    }
    if (Object.keys(changes).length === 0) { setError("Change at least one feature value."); return; }
    setLoading(true); setError(null); setResult(null);
    const lookup = lookupMode === "cell_id"
      ? { cell_id: cellId }
      : lookupMode === "coordinate_code"
        ? { coordinate_code: coordinateCode.trim() }
        : { latitude: Number(latitude), longitude: Number(longitude) };
    try { setResult(await postScenario({ ...lookup, year: Number(yearText), month: Number(monthText), changes })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not evaluate this scenario."); }
    finally { setLoading(false); }
  }

  return (
    <main className="content location-page-content">
      <header className="page-heading"><div><p className="eyebrow">DELHI · MODEL BASED ANALYSIS</p><h1>Explore a cooling scenario.</h1><p className="page-subtitle">Change selected environmental inputs and compare model estimates for one observed cell.</p></div></header>
      <div className="location-analysis-layout scenario-layout">
        <section className="panel coordinate-form-panel">
          <p className="eyebrow">WHAT IF?</p><h2>Set feature values</h2>
          <p className="form-description">Find a stored cell by its ID or coordinates, then enter absolute feature values. Other model inputs remain fixed.</p>
          <form className="coordinate-form" onSubmit={submit}>
            <fieldset className="lookup-mode"><legend>Find the location by</legend>
              <label><input type="radio" name="lookup-mode" value="cell_id" checked={lookupMode === "cell_id"} onChange={() => { setLookupMode("cell_id"); setBaseline(null); setResult(null); setError(null); }} />Cell ID</label>
              <label><input type="radio" name="lookup-mode" value="coordinates" checked={lookupMode === "coordinates"} onChange={() => { setLookupMode("coordinates"); setBaseline(null); setResult(null); setError(null); }} />Latitude / longitude</label>
              <label><input type="radio" name="lookup-mode" value="coordinate_code" checked={lookupMode === "coordinate_code"} onChange={() => { setLookupMode("coordinate_code"); setBaseline(null); setResult(null); setError(null); }} />Location code</label>
            </fieldset>
            {lookupMode === "cell_id" ? (
              <label><span>Cell ID</span><input value={cellId} onChange={(event) => { setCellId(event.target.value); setBaseline(null); setResult(null); setError(null); }} required /></label>
            ) : lookupMode === "coordinates" ? <>
              <label><span>Latitude</span><input type="number" inputMode="decimal" min="-90" max="90" step="any" value={latitude} onChange={(event) => { setLatitude(event.target.value); setBaseline(null); setResult(null); setError(null); }} required /></label>
              <label><span>Longitude</span><input type="number" inputMode="decimal" min="-180" max="180" step="any" value={longitude} onChange={(event) => { setLongitude(event.target.value); setBaseline(null); setResult(null); setError(null); }} required /></label>
            </> : <label><span>Location code</span><input value={coordinateCode} onChange={(event) => { setCoordinateCode(event.target.value); setBaseline(null); setResult(null); setError(null); }} placeholder="28.6139-77.209" required /><small>Paste the code copied from a selected map point.</small>{coordinateCode && !parseLocationCode(coordinateCode) && <span className="input-validation-error" role="alert">Use latitude-longitude format with latitude −90..90 and longitude −180..180.</span>}</label>}
            <label className="form-period"><span>Observation period</span><select value={periodKey} onChange={(event) => { setPeriodKey(event.target.value); setBaseline(null); setResult(null); }} disabled={periodsLoading}>{periods.map((period) => <option key={`${period.year}-${period.month}`} value={`${period.year}-${period.month}`}>{periodLabel(period)}</option>)}</select></label>
            {baseline && <div className="scenario-resolved-cell" role="status"><strong>Resolved cell</strong><code>{baseline.cell_id}</code>{baseline.distance_m !== null && <span>{baseline.distance_m.toFixed(0)} m from your coordinate</span>}</div>}
            {scenarioFeatures.map(({ key, label }) => (
              <label key={key}><span>{label} {baseline && <small>(current {baseline.environmental_features[key]?.toFixed(3) ?? "missing"})</small>}</span><input aria-label={label} type="number" min={key === "TreeCover" || key === "BuiltSurface" ? 0 : undefined} step="any" value={values[key] ?? ""} onChange={(event) => { setValues((current) => ({ ...current, [key]: event.target.value })); setResult(null); }} required /></label>
            ))}
            <button type="submit" className="search-button" disabled={!baseline || loading}>{loading ? <><span className="button-spinner" /> Evaluating…</> : <>Compare estimates <span>→</span></>}</button>
          </form>
          {error && <div className="detail-message detail-error" role="alert">{error}</div>}
        </section>

        <section className="panel scenario-result" aria-live="polite">
          <p className="eyebrow">MODEL ESTIMATES</p><h2>Baseline and scenario</h2>
          {!result && <p className="form-description">Choose a cell and change one or more values to see a model comparison.</p>}
          {result && <>
            <p className="scenario-resolved-result">Resolved cell: <code>{result.cell_id}</code> · {result.latitude.toFixed(5)}, {result.longitude.toFixed(5)}{result.distance_m !== null && ` · ${result.distance_m.toFixed(0)} m from your coordinate`} · {periodLabel({ year: result.year, month: result.month })}</p>
            <div className="scenario-values"><div><span>BASELINE ESTIMATE</span><strong>{result.baseline_prediction_c.toFixed(2)}<small>°C</small></strong></div><div><span>SCENARIO ESTIMATE</span><strong>{result.scenario_prediction_c.toFixed(2)}<small>°C</small></strong></div><div><span>ESTIMATED CHANGE</span><strong>{result.estimated_change_c > 0 ? "+" : ""}{result.estimated_change_c.toFixed(2)}<small>°C</small></strong></div></div>
            <p className="scenario-label">Model estimates · not observed LST</p>
            {result.outside_dataset_range && <div className="detail-message detail-error" role="status">One or more values are outside the master dataset min/max range. Treat this estimate with extra caution.</div>}
            <ul className="scenario-assumptions">{result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
          </>}
        </section>
      </div>
    </main>
  );
}

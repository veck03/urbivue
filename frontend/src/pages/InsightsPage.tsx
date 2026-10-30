import { useEffect, useState } from "react";
import { Link } from "react-router";
import { fetchAvailablePeriods, fetchCurrentModel, fetchHotspots, observationExportUrl } from "../api/client";
import type { AvailablePeriod, Hotspot, ModelMetadata } from "../api/types";

function periodLabel(period: AvailablePeriod) {
  return `${new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2020, period.month - 1, 1))} ${period.year}`;
}

export default function InsightsPage() {
  const [periods, setPeriods] = useState<AvailablePeriod[]>([]);
  const [periodKey, setPeriodKey] = useState("");
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<ModelMetadata | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAvailablePeriods(controller.signal).then((items) => {
      setPeriods(items);
      if (items[0]) setPeriodKey((current) => current || `${items[0].year}-${items[0].month}`);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "Could not load periods."); setLoading(false); }
    });
    fetchCurrentModel(controller.signal).then(setModel).catch((reason: unknown) => {
      if (!controller.signal.aborted) setModelError(reason instanceof Error ? reason.message : "Model metadata is unavailable.");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const [yearText, monthText] = periodKey.split("-");
    if (!yearText || !monthText) return;
    const controller = new AbortController();
    fetchHotspots(Number(yearText), Number(monthText), controller.signal).then(setHotspots).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load hotspot rankings.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [periodKey]);

  const [yearText, monthText] = periodKey.split("-");
  const selected = periods.find((period) => `${period.year}-${period.month}` === periodKey);

  return (
    <main className="content insights-page-content">
      <header className="page-heading">
        <div><p className="eyebrow">DELHI · OBSERVED DATA</p><h1>Find the hottest observed cells.</h1><p className="page-subtitle">Rankings use stored LST for the selected period. They describe the dataset and do not imply a causal explanation.</p></div>
        <label className="period-control"><span>Observation period</span><select value={periodKey} onChange={(event) => { setPeriodKey(event.target.value); setLoading(true); setError(null); }}>{periods.map((period) => <option key={`${period.year}-${period.month}`} value={`${period.year}-${period.month}`}>{periodLabel(period)}</option>)}</select></label>
      </header>
      <section className="panel importance-panel">
        <div className="hotspot-heading"><div><p className="eyebrow">CURRENT VERIFIED ARTIFACT</p><h2>Global feature importance</h2></div>
          {model && <span className="model-tag">{model.model_type} · {model.artifact_name}</span>}
        </div>
        {modelError && <div className="detail-message detail-error" role="alert">{modelError}</div>}
        {model && <>
          <div className="importance-list">{model.feature_importances.slice(0, 8).map(({ feature, importance }) => <div className="importance-row" key={feature}><span>{feature}</span><div className="importance-track"><i style={{ width: `${Math.max(0, importance / model.feature_importances[0].importance * 100)}%` }} /></div><strong>{importance.toFixed(3)}</strong></div>)}</div>
          <p className="export-note">{model.importance_method}. These global model associations are not causal effects or explanations for an individual cell.</p>
        </>}
      </section>
      <section className="panel hotspot-panel">
        <div className="hotspot-heading"><div><p className="eyebrow">TOP 100 BY STORED LST</p><h2>Observed hotspots</h2></div>
          {selected && <a className="search-button export-button" href={observationExportUrl(Number(yearText), Number(monthText))}>Download period CSV <span>↓</span></a>}
        </div>
        {loading && <div className="detail-loading" role="status"><span className="spinner" />Loading observed rankings…</div>}
        {error && <div className="detail-message detail-error" role="alert">{error}</div>}
        {!loading && !error && hotspots.length === 0 && <div className="detail-empty" role="status"><strong>No observations for this period.</strong></div>}
        {!loading && !error && hotspots.length > 0 && <div className="hotspot-table-wrap"><table className="hotspot-table"><thead><tr><th>Rank</th><th>Observed LST</th><th>Cell</th><th>Latitude</th><th>Longitude</th><th>NDVI</th><th>Tree cover</th><th>Analysis</th></tr></thead><tbody>{hotspots.map((spot, index) => <tr key={spot.cell_id}><td>{String(index + 1).padStart(2, "0")}</td><td className="hotspot-temp">{spot.observed_lst_c.toFixed(2)}°C</td><td><code title={spot.cell_id}>{spot.cell_id.slice(0, 12)}…</code></td><td>{spot.latitude.toFixed(4)}</td><td>{spot.longitude.toFixed(4)}</td><td>{spot.ndvi?.toFixed(3) ?? "—"}</td><td>{spot.tree_cover?.toFixed(3) ?? "—"}</td><td><Link to={`/scenarios?cell_id=${encodeURIComponent(spot.cell_id)}&year=${spot.year}&month=${spot.month}`}>Scenario →</Link></td></tr>)}</tbody></table></div>}
        <p className="export-note">CSV export is capped at 50,000 rows for the selected month and includes observed LST and stored environmental features.</p>
      </section>
    </main>
  );
}

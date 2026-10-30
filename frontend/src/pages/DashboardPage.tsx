import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchAvailablePeriods, fetchDashboardSummary } from "../api/client";
import type { AvailablePeriod, DashboardSummary } from "../api/types";

const monthNames = new Intl.DateTimeFormat("en", { month: "long" });
const periodKey = (period: AvailablePeriod) => `${period.year}-${period.month}`;

function periodLabel(period: AvailablePeriod) {
  return `${monthNames.format(new Date(2020, period.month - 1, 1))} ${period.year}`;
}

function formatTemperature(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}°C`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function MetricCard({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent: string;
}) {
  return (
    <article className="metric-card">
      <div className={`metric-accent ${accent}`} />
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-note">{note}</p>
    </article>
  );
}

function DashboardContent({
  periods,
}: {
  periods: AvailablePeriod[];
}) {
  const [selectedKey, setSelectedKey] = useState(() =>
    periods.length ? periodKey(periods[0]) : "",
  );
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedPeriodKey, setLoadedPeriodKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isLoading = loading || loadedPeriodKey !== selectedKey;
  const selectedPeriod = useMemo(
    () => periods.find((period) => periodKey(period) === selectedKey) ?? null,
    [periods, selectedKey],
  );
  const meanPosition = summary?.mean_lst_c !== null && summary?.mean_lst_c !== undefined &&
    summary.min_lst_c !== null && summary.max_lst_c !== null &&
    summary.max_lst_c > summary.min_lst_c
    ? ((summary.mean_lst_c - summary.min_lst_c) / (summary.max_lst_c - summary.min_lst_c)) * 100
    : 50;

  useEffect(() => {
    if (!selectedPeriod) return;
    const controller = new AbortController();
    fetchDashboardSummary(selectedPeriod.year, selectedPeriod.month, controller.signal)
      .then((data) => {
        setSummary(data);
        setLoadedPeriodKey(periodKey(selectedPeriod));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Could not load dashboard data.");
          setLoadedPeriodKey(periodKey(selectedPeriod));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedPeriod]);

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">DELHI · OBSERVATION OVERVIEW</p>
          <h1>Heat, at a glance.</h1>
          <p className="page-subtitle">
            Explore recorded land surface temperatures and the environmental context around them.
          </p>
        </div>
        <label className="period-control">
          <span>Observation period</span>
          <select
            aria-label="Observation period"
            value={selectedKey}
            onChange={(event) => {
              setError(null);
              setSelectedKey(event.target.value);
            }}
          >
            {periods.map((period) => (
              <option key={periodKey(period)} value={periodKey(period)}>
                {periodLabel(period)}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="observed-banner">
        <span className="observed-dot" />
        Values below are stored observations for {selectedPeriod ? periodLabel(selectedPeriod) : "the selected period"}.
        <span className="source-tag">OBSERVED DATA</span>
      </div>

      {isLoading && (
        <div className="loading-grid" aria-label="Loading dashboard data" aria-busy="true">
          <div className="skeleton metric-skeleton" />
          <div className="skeleton metric-skeleton" />
          <div className="skeleton metric-skeleton" />
          <div className="skeleton metric-skeleton" />
          <div className="skeleton chart-skeleton" />
          <div className="skeleton side-skeleton" />
        </div>
      )}

      {!isLoading && error && (
        <div className="state-card error-state" role="alert">
          <span className="state-icon">!</span>
          <div>
            <h2>Dashboard data is unavailable</h2>
            <p>{error}</p>
          </div>
        </div>
      )}

      {!isLoading && !error && summary && summary.observed_cells === 0 && (
        <div className="state-card" role="status">
          <span className="state-icon">∅</span>
          <div>
            <h2>No observations for this period</h2>
            <p>Choose a month with recorded data to view its summary.</p>
          </div>
        </div>
      )}

      {!isLoading && !error && summary && summary.observed_cells > 0 && (
        <>
          <section className="metric-grid" aria-label="Observed temperature summary">
            <MetricCard
              label="Observed cells"
              value={formatCount(summary.observed_cells)}
              note="Cells with an LST record"
              accent="accent-sand"
            />
            <MetricCard
              label="Mean LST"
              value={formatTemperature(summary.mean_lst_c)}
              note="Across observed cells"
              accent="accent-coral"
            />
            <MetricCard
              label="Period high"
              value={formatTemperature(summary.max_lst_c)}
              note="Highest stored observation"
              accent="accent-rust"
            />
            <MetricCard
              label="Mean NDVI"
              value={summary.mean_ndvi === null ? "—" : summary.mean_ndvi.toFixed(3)}
              note="Vegetation index · source scale"
              accent="accent-green"
            />
          </section>

          <section className="dashboard-panels">
            <article className="panel distribution-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">TEMPERATURE PROFILE</p>
                  <h2>Observed LST distribution</h2>
                </div>
                <span className="unit-pill">°C · cell count</span>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.temperature_bins} margin={{ top: 12, right: 12, bottom: 2, left: -12 }}>
                    <CartesianGrid vertical={false} stroke="#e8e3dc" strokeDasharray="3 5" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#77736d", fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "#77736d", fontSize: 11 }} />
                    <Tooltip
                      cursor={{ fill: "#f5eee5" }}
                      formatter={(value) => [formatCount(Number(value)), "Observed cells"]}
                      contentStyle={{ border: "1px solid #e7e0d6", borderRadius: 12, boxShadow: "0 12px 30px #2e261714" }}
                    />
                    <Bar dataKey="cell_count" fill="#d3654d" radius={[5, 5, 0, 0]} maxBarSize={42} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="panel-footnote">
                Counts are grouped into 5°C bands using the stored LST values.
              </p>
            </article>

            <article className="panel range-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">PERIOD RANGE</p>
                  <h2>Observed span</h2>
                </div>
                <span className="range-mark">↗</span>
              </div>
              <div className="range-value">
                <strong>{formatTemperature(summary.min_lst_c)}</strong>
                <span>to</span>
                <strong>{formatTemperature(summary.max_lst_c)}</strong>
              </div>
              <div className="range-track" aria-hidden="true">
                <span style={{ marginLeft: `calc(${meanPosition}% - 4px)` }} />
              </div>
              <p className="range-description">
                Minimum and maximum observed land surface temperature in this period.
              </p>
              <div className="range-divider" />
              <div className="range-detail">
                <span>Mean tree cover value</span>
                <strong>{summary.mean_tree_cover === null ? "—" : summary.mean_tree_cover.toFixed(3)}</strong>
              </div>
              <div className="range-detail">
                <span>Selected period</span>
                <strong>{selectedPeriod ? periodLabel(selectedPeriod) : "—"}</strong>
              </div>
            </article>
          </section>

          <footer className="data-note">
            <span className="note-mark">i</span>
            <p>
              This dashboard summarizes observed records. Model estimates and cooling scenarios are not included in these values.
            </p>
          </footer>
        </>
      )}
    </>
  );
}

export default function DashboardPage() {
  const [periods, setPeriods] = useState<AvailablePeriod[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [periodError, setPeriodError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAvailablePeriods(controller.signal)
      .then((items) => setPeriods(items))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setPeriodError(reason instanceof Error ? reason.message : "Could not load observation periods.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPeriods(false);
      });
    return () => controller.abort();
  }, []);

  if (loadingPeriods) {
    return <main className="content"><div className="skeleton heading-skeleton" /><div className="loading-grid"><div className="skeleton metric-skeleton" /><div className="skeleton metric-skeleton" /><div className="skeleton metric-skeleton" /></div></main>;
  }

  if (periodError) {
    return (
      <main className="content">
        <div className="state-card error-state" role="alert">
          <span className="state-icon">!</span>
          <div><h2>Could not load observation periods</h2><p>{periodError}</p></div>
        </div>
      </main>
    );
  }

  if (!periods.length) {
    return (
      <main className="content">
        <div className="state-card" role="status">
          <span className="state-icon">∅</span>
          <div><h2>No periods available</h2><p>The database has no imported observation periods yet.</p></div>
        </div>
      </main>
    );
  }

  return <main className="content"><DashboardContent periods={periods} /></main>;
}

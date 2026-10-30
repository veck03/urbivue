import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LeafletMouseEvent } from "leaflet";
import {
  fetchAvailablePeriods,
  fetchHeatmap,
  fetchLocationDetails,
  fetchNearestLocation,
} from "../api/client";
import type {
  AvailablePeriod,
  HeatmapResponse,
  LocationResponse,
} from "../api/types";
import type { ViewportBounds } from "../api/client";
import LocationDetailsPanel from "../components/LocationDetailsPanel";

type Selection =
  | { kind: "cell"; cellId: string }
  | { kind: "coordinate"; latitude: number; longitude: number }
  | null;

function keyForPeriod(period: AvailablePeriod) {
  return `${period.year}-${period.month}`;
}

function labelForPeriod(period: AvailablePeriod) {
  return `${new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2020, period.month - 1, 1))} ${period.year}`;
}

function temperatureColor(value: number) {
  if (value < 25) return "#438f91";
  if (value < 35) return "#d7b559";
  if (value < 45) return "#df8750";
  return "#b94d42";
}

function MapBoundsTracker({ onChange }: { onChange: (bounds: ViewportBounds) => void }) {
  const map = useMap();

  useEffect(() => {
    const update = () => {
      const bounds = map.getBounds();
      onChange({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    };
    update();
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
    };
  }, [map, onChange]);

  return null;
}

function MapClickHandler({ onSelect }: { onSelect: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click: (event: LeafletMouseEvent) => onSelect(event.latlng.lat, event.latlng.lng),
  });
  return null;
}

export default function MapPage() {
  const [periods, setPeriods] = useState<AvailablePeriod[]>([]);
  const [selectedPeriodKey, setSelectedPeriodKey] = useState("");
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportBounds | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [loadedHeatmapKey, setLoadedHeatmapKey] = useState("");
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [location, setLocation] = useState<LocationResponse | null>(null);
  const [resolvedSelectionKey, setResolvedSelectionKey] = useState("");
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAvailablePeriods(controller.signal)
      .then((items) => {
        setPeriods(items);
        if (items[0]) setSelectedPeriodKey(keyForPeriod(items[0]));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setPeriodError(reason instanceof Error ? reason.message : "Could not load available periods.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPeriodsLoading(false);
      });
    return () => controller.abort();
  }, []);

  const selectedPeriod = useMemo(
    () => periods.find((period) => keyForPeriod(period) === selectedPeriodKey) ?? null,
    [periods, selectedPeriodKey],
  );

  const heatmapRequestKey = selectedPeriod && viewport
    ? `${keyForPeriod(selectedPeriod)}:${viewport.west.toFixed(4)}:${viewport.south.toFixed(4)}:${viewport.east.toFixed(4)}:${viewport.north.toFixed(4)}`
    : "";
  const heatmapLoading = Boolean(heatmapRequestKey) && loadedHeatmapKey !== heatmapRequestKey;

  useEffect(() => {
    if (!selectedPeriod || !viewport) return;
    const controller = new AbortController();
    fetchHeatmap(viewport, selectedPeriod.year, selectedPeriod.month, controller.signal)
      .then((result) => {
        setHeatmap(result);
        setHeatmapError(null);
        setLoadedHeatmapKey(heatmapRequestKey);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setHeatmapError(reason instanceof Error ? reason.message : "Could not load map observations.");
          setLoadedHeatmapKey(heatmapRequestKey);
        }
      });
    return () => controller.abort();
  }, [heatmapRequestKey, selectedPeriod, viewport]);

  const selectionKey = selection && selectedPeriod
    ? `${keyForPeriod(selectedPeriod)}:${selection.kind === "cell" ? selection.cellId : `${selection.latitude},${selection.longitude}`}`
    : "";
  const locationLoading = Boolean(selectionKey) && resolvedSelectionKey !== selectionKey;

  useEffect(() => {
    if (!selection || !selectedPeriod) return;
    const controller = new AbortController();
    const request = selection.kind === "cell"
      ? fetchLocationDetails(selection.cellId, selectedPeriod.year, selectedPeriod.month, controller.signal)
      : fetchNearestLocation(
          selection.latitude,
          selection.longitude,
          selectedPeriod.year,
          selectedPeriod.month,
          controller.signal,
        );
    request
      .then((result) => {
        setLocation(result);
        setLocationError(null);
        setResolvedSelectionKey(selectionKey);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLocation(null);
          setLocationError(reason instanceof Error ? reason.message : "Could not load this location.");
          setResolvedSelectionKey(selectionKey);
        }
      });
    return () => controller.abort();
  }, [selectedPeriod, selection, selectionKey]);

  const updateViewport = useCallback((bounds: ViewportBounds) => {
    setViewport((current) => {
      if (current && Object.keys(bounds).every((key) => {
        const field = key as keyof ViewportBounds;
        return current[field].toFixed(5) === bounds[field].toFixed(5);
      })) return current;
      return bounds;
    });
  }, []);
  const selectCoordinate = useCallback((latitude: number, longitude: number) => {
    setLocation(null);
    setSelection({ kind: "coordinate", latitude, longitude });
  }, []);
  const clearSelection = useCallback(() => {
    setSelection(null);
    setLocation(null);
    setLocationError(null);
    setResolvedSelectionKey("");
  }, []);

  if (periodsLoading) {
    return <main className="content"><div className="skeleton heading-skeleton" /><div className="skeleton map-loading" /></main>;
  }
  if (periodError) {
    return <main className="content"><div className="state-card error-state" role="alert"><span className="state-icon">!</span><div><h2>Map data is unavailable</h2><p>{periodError}</p></div></div></main>;
  }
  if (!periods.length) {
    return <main className="content"><div className="state-card" role="status"><span className="state-icon">∅</span><div><h2>No observations available</h2><p>Import observations before opening the heat map.</p></div></div></main>;
  }

  return (
    <main className="content map-page-content">
      <header className="page-heading map-page-heading">
        <div>
          <p className="eyebrow">DELHI · SPATIAL OBSERVATIONS</p>
          <h1>Find the heat, cell by cell.</h1>
          <p className="page-subtitle">Pan or zoom the map. Select a grid cell or click a coordinate to inspect its data.</p>
        </div>
        <label className="period-control">
          <span>Observation period</span>
          <select value={selectedPeriodKey} onChange={(event) => setSelectedPeriodKey(event.target.value)}>
            {periods.map((period) => <option key={keyForPeriod(period)} value={keyForPeriod(period)}>{labelForPeriod(period)}</option>)}
          </select>
        </label>
      </header>

      <div className="map-toolbar">
        <label className="layer-select">
          <span>MAP LAYER</span>
          <select aria-label="Map layer" value="observed" onChange={() => undefined}>
            <option value="observed">Observed LST</option>
            <option value="predicted" disabled>Model estimate · later stage</option>
          </select>
        </label>
        <div className="temperature-legend" aria-label="Observed LST color legend">
          <span className="legend-title">OBSERVED LST</span>
          <span><i className="legend-cool" />&lt;25°C</span>
          <span><i className="legend-warm" />25–35°C</span>
          <span><i className="legend-hot" />35–45°C</span>
          <span><i className="legend-extreme" />&gt;45°C</span>
        </div>
      </div>

      <section className="map-workspace" aria-label="Heat map and cell details">
        <div className="map-frame">
          <MapContainer center={[28.6139, 77.209]} zoom={10} minZoom={8} maxZoom={16} scrollWheelZoom className="heat-map">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapBoundsTracker onChange={updateViewport} />
            <MapClickHandler onSelect={selectCoordinate} />
            {!heatmapLoading && !heatmapError && heatmap?.features.map((feature) => {
              const [longitude, latitude] = feature.geometry.coordinates;
              const color = temperatureColor(feature.properties.observed_lst_c);
              return (
                <CircleMarker
                  key={feature.properties.cell_id}
                  center={[latitude, longitude]}
                  radius={5}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.78, weight: 1 }}
                  eventHandlers={{
                    click: (event) => {
                      event.originalEvent.stopPropagation();
                      setLocation(null);
                      setSelection({ kind: "cell", cellId: feature.properties.cell_id });
                    },
                  }}
                />
              );
            })}
          </MapContainer>
          {heatmapLoading && <div className="map-status-chip" role="status"><span className="spinner" />Loading observations…</div>}
          {!heatmapLoading && heatmapError && <div className="map-overlay-error" role="alert"><strong>Could not load this view</strong><span>{heatmapError}</span></div>}
          {!heatmapLoading && !heatmapError && heatmap?.features.length === 0 && <div className="map-empty-overlay">No observations in this viewport for the selected period.</div>}
          {!heatmapLoading && heatmap?.truncated && <div className="map-truncated">Showing up to {heatmap.limit.toLocaleString("en-IN")} cells · zoom in for finer detail</div>}
          <div className="map-period-tag"><span className="observed-dot" />{selectedPeriod ? labelForPeriod(selectedPeriod) : ""} · STORED DATA</div>
        </div>
        <LocationDetailsPanel
          location={location}
          loading={locationLoading}
          error={locationError}
          onClear={clearSelection}
        />
      </section>
      <p className="map-disclaimer">Observed LST is stored with the dataset. Map colors are display bands; cell values are shown in the detail panel.</p>
    </main>
  );
}

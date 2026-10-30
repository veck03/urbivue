export interface AvailablePeriod {
  year: number;
  month: number;
}

export interface TemperatureBin {
  label: string;
  lower_c: number;
  upper_c: number;
  cell_count: number;
}

export interface DashboardSummary {
  year: number;
  month: number;
  observed_cells: number;
  mean_lst_c: number | null;
  min_lst_c: number | null;
  max_lst_c: number | null;
  mean_ndvi: number | null;
  mean_tree_cover: number | null;
  temperature_bins: TemperatureBin[];
}

export interface GeoJsonPointFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    cell_id: string;
    year: number;
    month: number;
    observed_lst_c: number;
    temperature_type: "observed";
  };
}

export interface HeatmapResponse {
  type: "FeatureCollection";
  features: GeoJsonPointFeature[];
  truncated: boolean;
  limit: number;
}

export interface LocationResponse {
  cell_id: string;
  latitude: number;
  longitude: number;
  year: number;
  month: number;
  observed_lst_c: number;
  temperature_type: "observed";
  distance_m: number | null;
  environmental_features: Record<string, number>;
}

export interface ScenarioResponse {
  cell_id: string;
  latitude: number;
  longitude: number;
  distance_m: number | null;
  year: number;
  month: number;
  temperature_type: "model_estimate";
  baseline_prediction_c: number;
  scenario_prediction_c: number;
  estimated_change_c: number;
  changes: Record<string, number>;
  outside_dataset_range: boolean;
  assumptions: string[];
}

export interface Hotspot {
  cell_id: string;
  latitude: number;
  longitude: number;
  year: number;
  month: number;
  observed_lst_c: number;
  ndvi: number | null;
  tree_cover: number | null;
  built_surface: number | null;
}

export interface ModelMetadata {
  model_type: "RandomForestRegressor";
  artifact_name: string;
  feature_order: string[];
  importance_method: string;
  feature_importances: Array<{ feature: string; importance: number }>;
}

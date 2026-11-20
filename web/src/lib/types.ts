// Shapes of the JSON files written by analysis/06_export_web.py into public/data/.

export type Category = "Low" | "Moderate" | "High" | "Severe";

export type ComponentKey =
  | "rain_variability"
  | "drought_frequency"
  | "heat_stress"
  | "soil_degradation"
  | "yield_volatility";

export interface CropRisk {
  index: number | null;
  category: Category | null;
  mean_yield: number | null;
  driver: string | null;
  components: Record<ComponentKey, number | null>;
}

export interface DistrictProps {
  district: string;
  risk_index: number | null;
  risk_category: Category | null;
  cluster: string | null;
  driver: string | null;
  crops: Record<string, CropRisk>;
}

export interface DistrictsGeo {
  type: "FeatureCollection";
  features: { type: "Feature"; geometry: GeoJSON.Geometry; properties: DistrictProps }[];
}

export interface Series {
  year: number[];
  yield: (number | null)[];
  trend: (number | null)[];
  anomaly_pct: (number | null)[];
  rain_mm: (number | null)[];
  spi3: (number | null)[];
  heat_days: (number | null)[];
}

export interface Timeseries {
  crops: string[];
  district: Record<string, Record<string, Series>>;
  state: Record<string, { year: number[]; yield: (number | null)[] }>;
}

export interface Scenarios {
  rain_change_pct: number[];
  temp_change_c: number[];
  model: string;
  reliable: boolean;
  pairs: Record<string, { baseline_yield: number | null; pct: (number | null)[][] }>;
  state: Record<string, { pct: (number | null)[][] }>;
}

export interface MetricRow {
  model: string;
  split: string;
  crop: string;
  n: number;
  rmse_t_ha: number;
  mae_t_ha: number;
  r2: number;
  rmse_pct: number;
  r2_anomaly: number;
}

export interface Metrics {
  best_model: string;
  beats_trend_only_cv: boolean;
  train_years: [number, number];
  test_years: [number, number];
  rows: MetricRow[];
  test_predictions: { district: string; crop: string; year: number; actual_t_ha: number; predicted_t_ha: number }[];
}

export interface ShapImportance {
  model: string;
  unit: string;
  features: { feature: string; label: string; mean_abs_shap_pct: number; mean_shap_pct: number }[];
}

export interface Correlations {
  target: string;
  rows: { crop: string; feature: string; label: string; r: number; p: number; n: number }[];
}

export interface Recommendations {
  actions: Record<string, { title: string; detail: string }>;
  categories: Record<Category, { index_range: [number, number]; actions: string[] }>;
  trigger_level: number;
  district_crop: {
    district: string;
    crop: string;
    risk_index: number;
    risk_category: Category;
    actions: { id: string; why: string }[];
  }[];
}

export interface Summary {
  project: string;
  state: string | null;
  crops: string[];
  districts: number;
  years: [number, number];
  district_crop_pairs: number;
  severe_pairs: number;
  severe_share: number | null;
  highest_risk_district: { district: string; index: number; category: Category; cluster: string };
  model: {
    name: string;
    test_rmse_t_ha: number | null;
    test_r2: number | null;
    test_r2_deviation: number | null;
    beats_trend_only_cv: boolean;
  };
  risk_weights: Record<ComponentKey, number>;
  risk_weight_method: string;
  pair_category_cutoffs: Record<Category, [number, number]> | null;
  district_category_cutoffs: Record<Category, [number, number]> | null;
  scenario_state_pct: { "rain_-20": number | null; "temp_+2": number | null; "rain_-40_temp_+3": number | null };
}

export interface ElevationTiers {
  baseElevationFt: number;
  midElevationFt: number;
  summitElevationFt: number;
  baseTempF: number;
  midTempF: number;
  summitTempF: number;
  lapseRateFPer1000Ft: number;
}

export interface WindAnalysis {
  speedMph: number;
  gustMph: number;
  directionDeg: number;
  cardinal: string;
  windHoldRiskIndex: number; // 0 - 100
  scouredAspects: string[];
  loadedAspects: string[];
}

export interface HourlyForecastStep {
  hourOffset: number; // 0 to 72
  timestamp: string;
  freezingLevelElevationFt: number;
  summitTempF: number;
  midTempF: number;
  baseTempF: number;
  summitTempC: number;
  phase: "rain" | "mixed" | "dense_snow" | "blower_powder" | "clear";
  snowfallInches: number; // cumulative or incremental
  cumulativeSnowInches: number;
  windSpeedMph: number;
  windGustMph: number;
  inDGZ: boolean; // Dendritic Growth Zone active (-12°C to -18°C)
}

export interface ResortForecast {
  resortId: string;
  name: string;
  region: "VT" | "NH" | "ME" | "NY" | "MA";
  passType: "Ikon" | "Epic" | "Indy" | "Independent";
  latitude: number;
  longitude: number;
  summitFt: number;
  baseFt: number;
  verticalFt: number;
  skiableAcres: number;
  powderScore: number; // 0 - 100
  confidenceInterval: number;
  predictedSnowfallInches: number; // Modeled storm total
  snowfall24hInches: number;
  snowfall48hInches: number;
  snowfall72hInches?: number;
  snowToLiquidRatio: number;
  freezingLevelElevationFt: number;
  windowStart: string;
  windowEnd: string;
  gladesRecommended: boolean;
  windHoldWarning: boolean;
  crustRisk: boolean;
  baseDepthInches: number;
  distanceMiles?: number;
  driveTimeEstimate?: string;
  elevationTiers?: ElevationTiers;
  windAnalysis?: WindAnalysis;
  hourlySeries?: HourlyForecastStep[];
}

export interface ForecastResponse {
  count: number;
  items: ResortForecast[];
}

export interface UserOrigin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export type PersonaPreset = "all" | "glade_hunter" | "wind_avoider" | "bluebird_cruiser";

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
  predictedSnowfallInches: number; // Modeled 48h storm total
  snowfall24hInches: number;
  snowfall48hInches: number;
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

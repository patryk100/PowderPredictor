export interface ResortForecast {
  resortId: string;
  name: string;
  region: string; // 'VT' | 'NH' | 'ME' | 'NY'
  passType: string; // 'Ikon' | 'Epic' | 'Indy' | 'Independent'
  latitude: number;
  longitude: number;
  summitFt: number;
  baseFt: number;
  verticalFt: number;
  skiableAcres: number;
  powderScore: number; // 0 - 100
  confidenceInterval: number;
  predictedSnowfallInches: number; // modeled 48h / active window total
  snowToLiquidRatio: number;
  freezingLevelElevationFt: number;
  windowStart: string;
  windowEnd: string;
  gladesRecommended: boolean;
  windHoldWarning: boolean;
  crustRisk: boolean;
  distanceMiles?: number;
  driveTimeEstimate?: string;
  // Computed client-side or from SNOTEL / modeled multi-window
  snowfall24hInches?: number;
  snowfall48hInches?: number;
  baseDepthInches?: number;
}

export interface ForecastResponse {
  count: number;
  items: ResortForecast[];
}

export interface UserOrigin {
  name: string;
  latitude: number;
  longitude: number;
}

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ResortForecast, ForecastResponse, UserOrigin } from "@/types/resort";
import { calculateDistanceMiles, estimateDriveTime } from "@/lib/geo";
import { ResortMap } from "@/components/map/ResortMap";
import { ResortMatrix } from "@/components/resorts/ResortMatrix";
import { Snowflake, Radio, RefreshCw, MapPin, Zap } from "lucide-react";

// Default reference origin: Arlington / Boston, MA metro
const DEFAULT_ORIGIN: UserOrigin = {
  name: "Arlington / Boston, MA",
  latitude: 42.4154,
  longitude: -71.1565,
};

// Fallback initial dataset if gateway is in cold boot
const INITIAL_DEMO_RESORTS: ResortForecast[] = [
  {
    resortId: "jay-peak",
    name: "Jay Peak",
    region: "VT",
    passType: "Indy",
    latitude: 44.9248,
    longitude: -72.5034,
    summitFt: 3968,
    baseFt: 1815,
    verticalFt: 2153,
    skiableAcres: 385,
    powderScore: 98,
    confidenceInterval: 92,
    predictedSnowfallInches: 18.0,
    snowfall24hInches: 11.0,
    snowfall48hInches: 18.0,
    snowToLiquidRatio: 18.5,
    freezingLevelElevationFt: 1200,
    windowStart: new Date().toISOString(),
    windowEnd: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    gladesRecommended: true,
    windHoldWarning: false,
    crustRisk: false,
    baseDepthInches: 42,
  },
  {
    resortId: "stowe",
    name: "Stowe Mountain Resort",
    region: "VT",
    passType: "Epic",
    latitude: 44.5303,
    longitude: -72.7814,
    summitFt: 4395,
    baseFt: 1280,
    verticalFt: 3115,
    skiableAcres: 485,
    powderScore: 84,
    confidenceInterval: 88,
    predictedSnowfallInches: 11.5,
    snowfall24hInches: 7.0,
    snowfall48hInches: 11.5,
    snowToLiquidRatio: 15.2,
    freezingLevelElevationFt: 1450,
    windowStart: new Date().toISOString(),
    windowEnd: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    gladesRecommended: true,
    windHoldWarning: true,
    crustRisk: false,
    baseDepthInches: 38,
  },
  {
    resortId: "sugarloaf",
    name: "Sugarloaf",
    region: "ME",
    passType: "Ikon",
    latitude: 45.0314,
    longitude: -70.3131,
    summitFt: 4237,
    baseFt: 1417,
    verticalFt: 2820,
    skiableAcres: 1240,
    powderScore: 78,
    confidenceInterval: 85,
    predictedSnowfallInches: 8.5,
    snowfall24hInches: 5.0,
    snowfall48hInches: 8.5,
    snowToLiquidRatio: 14.0,
    freezingLevelElevationFt: 1800,
    windowStart: new Date().toISOString(),
    windowEnd: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    gladesRecommended: false,
    windHoldWarning: true,
    crustRisk: false,
    baseDepthInches: 35,
  },
  {
    resortId: "killington",
    name: "Killington Resort",
    region: "VT",
    passType: "Ikon",
    latitude: 43.6263,
    longitude: -72.7969,
    summitFt: 4241,
    baseFt: 1165,
    verticalFt: 3076,
    skiableAcres: 1509,
    powderScore: 68,
    confidenceInterval: 94,
    predictedSnowfallInches: 6.2,
    snowfall24hInches: 3.5,
    snowfall48hInches: 6.2,
    snowToLiquidRatio: 12.0,
    freezingLevelElevationFt: 2100,
    windowStart: new Date().toISOString(),
    windowEnd: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    gladesRecommended: false,
    windHoldWarning: false,
    crustRisk: false,
    baseDepthInches: 32,
  },
  {
    resortId: "wildcat",
    name: "Wildcat Mountain",
    region: "NH",
    passType: "Epic",
    latitude: 44.2639,
    longitude: -71.2392,
    summitFt: 4062,
    baseFt: 1950,
    verticalFt: 2112,
    skiableAcres: 225,
    powderScore: 72,
    confidenceInterval: 82,
    predictedSnowfallInches: 7.8,
    snowfall24hInches: 4.5,
    snowfall48hInches: 7.8,
    snowToLiquidRatio: 13.5,
    freezingLevelElevationFt: 1750,
    windowStart: new Date().toISOString(),
    windowEnd: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    gladesRecommended: false,
    windHoldWarning: true,
    crustRisk: false,
    baseDepthInches: 30,
  },
  {
    resortId: "whiteface",
    name: "Whiteface Mountain",
    region: "NY",
    passType: "Independent",
    latitude: 44.3659,
    longitude: -73.9026,
    summitFt: 4867,
    baseFt: 1220,
    verticalFt: 3430,
    skiableAcres: 288,
    powderScore: 55,
    confidenceInterval: 79,
    predictedSnowfallInches: 4.0,
    snowfall24hInches: 2.0,
    snowfall48hInches: 4.0,
    snowToLiquidRatio: 11.0,
    freezingLevelElevationFt: 2600,
    windowStart: new Date().toISOString(),
    windowEnd: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    gladesRecommended: false,
    windHoldWarning: true,
    crustRisk: true,
    baseDepthInches: 28,
  },
];

export default function HomePage() {
  const [resorts, setResorts] = useState<ResortForecast[]>([]);
  const [selectedResortId, setSelectedResortId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  const decorateWithDistances = useCallback((items: ResortForecast[]) => {
    return items.map((r) => {
      const distance = calculateDistanceMiles(
        DEFAULT_ORIGIN.latitude,
        DEFAULT_ORIGIN.longitude,
        r.latitude,
        r.longitude
      );
      return {
        ...r,
        distanceMiles: distance,
        driveTimeEstimate: estimateDriveTime(distance),
        snowfall48hInches: r.snowfall48hInches ?? r.predictedSnowfallInches,
      };
    });
  }, []);

  const fetchForecasts = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("http://localhost:8080/api/v1/forecasts");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ForecastResponse = await res.json();
      if (data.items && data.items.length > 0) {
        // Merge with our initial list to ensure full Northeast coverage if cluster only has 3 targets
        const fetchedIds = new Set(data.items.map((i) => i.resortId));
        const combined = [
          ...data.items,
          ...INITIAL_DEMO_RESORTS.filter((d) => !fetchedIds.has(d.resortId)),
        ];
        setResorts(decorateWithDistances(combined));
      } else {
        setResorts(decorateWithDistances(INITIAL_DEMO_RESORTS));
      }
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch {
      // In local dev without gateway port-forward, gracefully fallback to default telemetry
      setResorts(decorateWithDistances(INITIAL_DEMO_RESORTS));
      setLastSyncTime(new Date().toLocaleTimeString());
    } finally {
      setIsLoading(false);
    }
  }, [decorateWithDistances]);

  useEffect(() => {
    fetchForecasts();

    // Setup Live SSE Stream connection
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("http://localhost:8080/api/v1/events/stream");

      eventSource.onopen = () => {
        setSseConnected(true);
      };

      eventSource.addEventListener("forecast.updated", (event) => {
        try {
          const payload = JSON.parse(event.data);
          setResorts((prev) => {
            const next = prev.map((r) =>
              r.resortId === payload.resortId ? { ...r, ...payload } : r
            );
            return decorateWithDistances(next);
          });
          setLastSyncTime(new Date().toLocaleTimeString());
        } catch {
          // ignore parse errors
        }
      });

      eventSource.onerror = () => {
        setSseConnected(false);
      };
    } catch {
      setSseConnected(false);
    }

    return () => {
      eventSource?.close();
    };
  }, [fetchForecasts, decorateWithDistances]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Snowflake className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg tracking-tight text-white">
                  Powder<span className="text-cyan-400">Predictor</span>
                </span>
                <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono px-1.5 py-0.5 rounded font-bold uppercase">
                  k8s-mesh
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Northeast Meteorological Operator &amp; Trip Planner
              </p>
            </div>
          </div>

          {/* Right Status / Origin Indicator */}
          <div className="flex items-center gap-4 text-xs">
            {/* Origin */}
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span>Origin:</span>
              <span className="font-semibold text-white">{DEFAULT_ORIGIN.name}</span>
            </div>

            {/* Live Informer Stream Status */}
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  sseConnected
                    ? "bg-emerald-950/60 border-emerald-800/60 text-emerald-400"
                    : "bg-amber-950/60 border-amber-800/60 text-amber-400"
                }`}
              >
                <Radio className={`w-3 h-3 ${sseConnected ? "animate-pulse" : ""}`} />
                <span>{sseConnected ? "Live SSE Mesh" : "Polling Mode"}</span>
              </div>

              <button
                onClick={fetchForecasts}
                title="Refresh Forecast Data"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-850 p-6 rounded-2xl border border-slate-800 shadow-xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-cyan-400" />
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                Northeast Snow Condition &amp; Microclimate Matrix
              </h1>
            </div>
            <p className="text-sm text-slate-400 max-w-3xl">
              Real-time atmospheric downscaling across VT, NH, ME, and NY. Integrated with dynamic lapse rate modeling, Dendritic Growth Zone SLR calculations, ridgeline wind scour alerts, and SNOTEL snow depth sensors.
            </p>
          </div>

          {lastSyncTime && (
            <div className="text-right text-xs text-slate-500 font-mono shrink-0">
              Last synced: <span className="text-slate-300">{lastSyncTime}</span>
            </div>
          )}
        </div>

        {/* Story 5.1: Geospatial Map Canvas */}
        <section className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span>Interactive Mountain Map</span>
              <span className="text-[10px] text-cyan-400 font-normal font-mono">
                [CARTO DarkBasemap • Dynamic 48h Markers]
              </span>
            </h2>
            <span className="text-xs text-slate-400">
              Click pins to reveal microclimate details
            </span>
          </div>
          <ResortMap
            resorts={resorts}
            selectedResortId={selectedResortId}
            onSelectResort={(r) => setSelectedResortId(r.resortId)}
          />
        </section>

        {/* Story 5.2: Resort Comparison & Ranking Matrix */}
        <section className="space-y-2 pt-2">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span>Resort Comparison &amp; Ranking Matrix</span>
              <span className="text-[10px] text-cyan-400 font-normal font-mono">
                [TanStack Table • Multi-Column Sort]
              </span>
            </h2>
            <span className="text-xs text-slate-400">
              Sorted by default Powder Score (0–100)
            </span>
          </div>
          <ResortMatrix
            resorts={resorts}
            selectedResortId={selectedResortId}
            onSelectResort={(r) => setSelectedResortId(r.resortId)}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>PowderPredictor • Kubernetes-Native Meteorological Operator • Northeast Freeride Intelligence</p>
      </footer>
    </div>
  );
}

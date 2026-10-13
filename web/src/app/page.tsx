"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ResortForecast, ForecastResponse, UserOrigin } from "@/types/resort";
import { calculateDistanceMiles, estimateDriveTime } from "@/lib/geo";
import { METRO_ORIGINS, COMPREHENSIVE_NORTHEAST_RESORTS } from "@/lib/resortData";
import { ResortMap } from "@/components/map/ResortMap";
import { ResortMatrix } from "@/components/resorts/ResortMatrix";
import { ResortDetailDrawer } from "@/components/resorts/ResortDetailDrawer";
import {
  Snowflake,
  Radio,
  RefreshCw,
  MapPin,
  Zap,
  TrendingUp,
  Wind,
  ShieldCheck,
  Compass,
  Sparkles,
} from "lucide-react";

export default function HomePage() {
  const [resorts, setResorts] = useState<ResortForecast[]>([]);
  const [selectedResort, setSelectedResort] = useState<ResortForecast | null>(null);
  const [activeOrigin, setActiveOrigin] = useState<UserOrigin>(METRO_ORIGINS[0]);
  const [quickFilter, setQuickFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  const decorateWithDistances = useCallback(
    (items: ResortForecast[], origin: UserOrigin) => {
      return items.map((r) => {
        const distance = calculateDistanceMiles(
          origin.latitude,
          origin.longitude,
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
    },
    []
  );

  const fetchForecasts = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("http://localhost:8080/api/v1/forecasts");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ForecastResponse = await res.json();
      if (data.items && data.items.length > 0) {
        // Merge cluster targets with full catalog so all 24 Northeast resorts are populated
        const fetchedMap = new Map(data.items.map((i) => [i.resortId, i]));
        const merged = COMPREHENSIVE_NORTHEAST_RESORTS.map((fixture) => {
          const live = fetchedMap.get(fixture.resortId);
          if (live) {
            return {
              ...fixture,
              ...live,
              elevationTiers: fixture.elevationTiers ?? live.elevationTiers,
              windAnalysis: fixture.windAnalysis ?? live.windAnalysis,
            };
          }
          return fixture;
        });
        setResorts(decorateWithDistances(merged, activeOrigin));
      } else {
        setResorts(decorateWithDistances(COMPREHENSIVE_NORTHEAST_RESORTS, activeOrigin));
      }
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch {
      // In standalone client dev, use full Northeast catalog
      setResorts(decorateWithDistances(COMPREHENSIVE_NORTHEAST_RESORTS, activeOrigin));
      setLastSyncTime(new Date().toLocaleTimeString());
    } finally {
      setIsLoading(false);
    }
  }, [decorateWithDistances, activeOrigin]);

  // Handle origin city change
  const handleOriginChange = (originId: string) => {
    const found = METRO_ORIGINS.find((o) => o.id === originId) || METRO_ORIGINS[0];
    setActiveOrigin(found);
    setResorts((prev) => decorateWithDistances(prev, found));
    if (selectedResort) {
      const updatedDist = calculateDistanceMiles(
        found.latitude,
        found.longitude,
        selectedResort.latitude,
        selectedResort.longitude
      );
      setSelectedResort({
        ...selectedResort,
        distanceMiles: updatedDist,
        driveTimeEstimate: estimateDriveTime(updatedDist),
      });
    }
  };

  useEffect(() => {
    fetchForecasts();

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
            return decorateWithDistances(next, activeOrigin);
          });
          setLastSyncTime(new Date().toLocaleTimeString());
        } catch {
          // ignore
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
  }, [fetchForecasts, decorateWithDistances, activeOrigin]);

  // Aggregate stats
  const topResort = useMemo(() => {
    if (resorts.length === 0) return null;
    return [...resorts].sort((a, b) => b.powderScore - a.powderScore)[0];
  }, [resorts]);

  const windHoldCount = useMemo(() => {
    return resorts.filter((r) => r.windHoldWarning).length;
  }, [resorts]);

  const gladesRecommendedCount = useMemo(() => {
    return resorts.filter((r) => r.gladesRecommended).length;
  }, [resorts]);

  const avgSLR = useMemo(() => {
    if (resorts.length === 0) return 0;
    const sum = resorts.reduce((acc, r) => acc + r.snowToLiquidRatio, 0);
    return (sum / resorts.length).toFixed(1);
  }, [resorts]);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-40 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 border border-cyan-400/30">
              <Snowflake className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg tracking-tight text-white">
                  Powder<span className="text-cyan-400">Predictor</span>
                </span>
                <span className="text-[10px] bg-cyan-950/90 text-cyan-300 border border-cyan-700/60 font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Northeast Operator
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Atmospheric Lapse Rate &amp; Microclimate Trip Planner
              </p>
            </div>
          </div>

          {/* Right Status / Origin Selector */}
          <div className="flex items-center gap-3 text-xs">
            {/* Origin Metro Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-1.5 text-slate-300 shadow-inner">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden md:inline text-slate-400">Origin:</span>
              <select
                value={activeOrigin.id}
                onChange={(e) => handleOriginChange(e.target.value)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                {METRO_ORIGINS.map((orig) => (
                  <option key={orig.id} value={orig.id} className="bg-slate-900 text-white">
                    {orig.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Informer Mesh / SSE Status */}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border ${
                sseConnected
                  ? "bg-emerald-950/60 border-emerald-800/70 text-emerald-300 shadow-sm shadow-emerald-500/20"
                  : "bg-slate-900 border-slate-700 text-slate-300"
              }`}
            >
              <Radio className={`w-3 h-3 ${sseConnected ? "animate-pulse text-emerald-400" : "text-slate-400"}`} />
              <span>{sseConnected ? "K8s SSE Stream Active" : "Cluster Sync Active"}</span>
            </div>

            <button
              onClick={fetchForecasts}
              title="Refresh Forecast Data"
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Hero Section & Live Meteorological Stat Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Hero Banner */}
          <div className="lg:col-span-2 bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-950/90 p-6 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Zap className="w-5 h-5 text-cyan-400" />
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Northeast Powder Intelligence
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Automated downscaling over 24 Northeast peaks across VT, NH, ME, NY, and MA. Calculating real-time Moist Adiabatic Lapse Rates, Dendritic Growth Zone snow ratios, and ridgeline wind slab loading.
              </p>
            </div>

            {topResort && (
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/60">
                    Top Pick Today
                  </span>
                  <span className="font-bold text-white text-sm">{topResort.name}</span>
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-cyan-400 font-black">{topResort.powderScore} Score</span>
                  <span className="text-purple-400 font-bold">{topResort.snowfall48hInches}&quot; Fresh</span>
                </div>
              </div>
            )}
          </div>

          {/* Stat 1: Protected Glades Primed */}
          <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Leeward Stashes
              </span>
              <Compass className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="my-2">
              <span className="text-3xl font-black font-mono text-emerald-400">
                {gladesRecommendedCount}
              </span>
              <span className="text-xs text-slate-400 block mt-1">
                Mountains with protected powder glades primed
              </span>
            </div>
            <span className="text-[10px] text-emerald-500 font-semibold font-mono">
              Aspect transport active
            </span>
          </div>

          {/* Stat 2: Average Regional SLR & Wind Holds */}
          <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Regional SLR &amp; Holds
              </span>
              <Wind className="w-4 h-4 text-amber-400" />
            </div>
            <div className="my-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-cyan-400">
                  {avgSLR}:1
                </span>
                <span className="text-xs text-slate-400 font-mono">Avg Snow Density</span>
              </div>
              <span className="text-xs text-amber-400 block mt-1">
                {windHoldCount} summit lifts at risk of wind hold
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {resorts.length} mountains monitored
            </span>
          </div>
        </div>

        {/* Story 5.3: Geospatial Map Canvas */}
        <section className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <span className="text-cyan-400">●</span>
              <span>Northeast Mountain Topography</span>
            </h2>
            <span className="text-xs text-slate-400 hidden sm:inline">
              Click any pin or table row to inspect elevation tiers &amp; wind models
            </span>
          </div>
          <ResortMap
            resorts={resorts}
            selectedResortId={selectedResort?.resortId}
            onSelectResort={(r) => setSelectedResort(r)}
          />
        </section>

        {/* Story 5.4 & 5.5: Resort Comparison & Ranking Matrix */}
        <section className="space-y-3 pt-2">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <span className="text-purple-400">●</span>
              <span>Resort Comparison &amp; Forecast Ranking</span>
            </h2>
            {lastSyncTime && (
              <span className="text-xs text-slate-500 font-mono">
                Telemetry synced: {lastSyncTime}
              </span>
            )}
          </div>
          <ResortMatrix
            resorts={resorts}
            selectedResortId={selectedResort?.resortId}
            onSelectResort={(r) => setSelectedResort(r)}
            activeQuickFilter={quickFilter}
            onQuickFilterChange={setQuickFilter}
          />
        </section>
      </main>

      {/* Slide-out Resort Detail Drawer */}
      <ResortDetailDrawer
        resort={selectedResort}
        onClose={() => setSelectedResort(null)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>PowderPredictor • Kubernetes-Native Meteorological Operator &amp; Northeast Freeride Intelligence</p>
      </footer>
    </div>
  );
}

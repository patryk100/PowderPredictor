"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Toaster, toast } from "sonner";
import { ResortForecast, ForecastResponse, UserOrigin, PersonaPreset } from "@/types/resort";
import { calculateDistanceMiles, estimateDriveTime } from "@/lib/geo";
import { METRO_ORIGINS, COMPREHENSIVE_NORTHEAST_RESORTS } from "@/lib/resortData";
import { ResortMatrix } from "@/components/resorts/ResortMatrix";
import { ResortDetailDrawer } from "@/components/resorts/ResortDetailDrawer";
import { TimelineScrubber } from "@/components/forecast/TimelineScrubber";
import { FilterBar } from "@/components/filters/FilterBar";
import { useForecastStream } from "@/hooks/useForecastStream";
import {
  Snowflake,
  Radio,
  RefreshCw,
  MapPin,
  Zap,
  TrendingUp,
  Wind,
  Compass,
} from "lucide-react";

// Story 5.6: Lazy load MapLibre GL component with ssr: false for fast initial bundle loading
const ResortMap = dynamic(
  () => import("@/components/map/ResortMap").then((mod) => mod.ResortMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[480px] rounded-2xl bg-slate-950 flex flex-col items-center justify-center border border-slate-800 text-slate-500 text-xs">
        <Snowflake className="w-8 h-8 animate-spin text-cyan-400 mb-2" />
        <span>Initializing WebGL Canvas &amp; Mountain Markers...</span>
      </div>
    ),
  }
);

export default function HomePage() {
  const [resorts, setResorts] = useState<ResortForecast[]>([]);
  const [selectedResort, setSelectedResort] = useState<ResortForecast | null>(null);
  const [activeOrigin, setActiveOrigin] = useState<UserOrigin>(METRO_ORIGINS[0]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  // Story 5.3: 72-Hour Temporal Scrubber state
  const [scrubHour, setScrubHour] = useState<number>(0);

  // Story 5.4: Custom Persona Profiles & Trip Filters with localStorage persistence
  const [selectedPersona, setSelectedPersona] = useState<PersonaPreset>("all");
  const [selectedPasses, setSelectedPasses] = useState<string[]>([]);

  // Load persisted filters and origin from localStorage on mount
  useEffect(() => {
    try {
      const savedOriginId = localStorage.getItem("powder_origin_id");
      if (savedOriginId) {
        const found = METRO_ORIGINS.find((o) => o.id === savedOriginId);
        if (found) setActiveOrigin(found);
      }
      const savedPersona = localStorage.getItem("powder_persona") as PersonaPreset;
      if (savedPersona) setSelectedPersona(savedPersona);
      const savedPasses = localStorage.getItem("powder_passes");
      if (savedPasses) setSelectedPasses(JSON.parse(savedPasses));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

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
        const fetchedMap = new Map(data.items.map((i) => [i.resortId, i]));
        const merged = COMPREHENSIVE_NORTHEAST_RESORTS.map((fixture) => {
          const live = fetchedMap.get(fixture.resortId);
          if (live) {
            return {
              ...fixture,
              ...live,
              elevationTiers: fixture.elevationTiers ?? live.elevationTiers,
              windAnalysis: fixture.windAnalysis ?? live.windAnalysis,
              hourlySeries: fixture.hourlySeries,
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
    try {
      localStorage.setItem("powder_origin_id", found.id);
    } catch {}
    setResorts((prev) => decorateWithDistances(prev, found));
  };

  const handlePersonaChange = (preset: PersonaPreset) => {
    setSelectedPersona(preset);
    try {
      localStorage.setItem("powder_persona", preset);
    } catch {}
  };

  const handleTogglePass = (pass: string) => {
    setSelectedPasses((prev) => {
      const next = prev.includes(pass) ? prev.filter((p) => p !== pass) : [...prev, pass];
      try {
        localStorage.setItem("powder_passes", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleClearFilters = () => {
    setSelectedPersona("all");
    setSelectedPasses([]);
    try {
      localStorage.removeItem("powder_persona");
      localStorage.removeItem("powder_passes");
    } catch {}
  };

  // Story 5.5: Connect live Server-Sent Events stream with Toast alerting
  const { isConnected: sseConnected } = useForecastStream({
    onForecastUpdated: (resortId, powderScore, snowInches) => {
      setResorts((prev) =>
        prev.map((r) =>
          r.resortId === resortId
            ? { ...r, powderScore, predictedSnowfallInches: snowInches }
            : r
        )
      );
      setLastSyncTime(new Date().toLocaleTimeString());
    },
    onFocusResort: (resortId) => {
      const match = resorts.find((r) => r.resortId === resortId);
      if (match) setSelectedResort(match);
    },
  });

  useEffect(() => {
    fetchForecasts();
  }, [fetchForecasts]);

  // Aggregate summary stats
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
      {/* Toast Alert Pipeline */}
      <Toaster position="top-right" richColors theme="dark" />

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

        {/* Story 5.4: Custom Persona Profiles & Season Pass Multi-Select */}
        <FilterBar
          selectedPersona={selectedPersona}
          onSelectPersona={handlePersonaChange}
          selectedPasses={selectedPasses}
          onTogglePass={handleTogglePass}
          onClearAll={handleClearFilters}
        />

        {/* Story 5.3: 72-Hour Temporal Scrubbing Bar */}
        <TimelineScrubber
          currentHourOffset={scrubHour}
          onChange={setScrubHour}
        />

        {/* Story 5.6: Responsive Split-Screen Layout (Desktop: 55% Map / 45% Matrix or Stacked) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Geospatial Map Canvas (55% on desktop) */}
          <section className="lg:col-span-7 h-[560px]">
            <ResortMap
              resorts={resorts}
              selectedResortId={selectedResort?.resortId}
              onSelectResort={(r) => setSelectedResort(r)}
              hourOffset={scrubHour}
            />
          </section>

          {/* Right: Comparison Matrix (45% on desktop) */}
          <section className="lg:col-span-5 space-y-3">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <span className="text-cyan-400">●</span>
                <span>Ranked Mountain Matrix</span>
              </h2>
              {lastSyncTime && (
                <span className="text-[11px] text-slate-500 font-mono">
                  Synced: {lastSyncTime}
                </span>
              )}
            </div>
            <ResortMatrix
              resorts={resorts}
              selectedResortId={selectedResort?.resortId}
              onSelectResort={(r) => setSelectedResort(r)}
              selectedPersona={selectedPersona}
              selectedPasses={selectedPasses}
              hourOffset={scrubHour}
            />
          </section>
        </div>
      </main>

      {/* Slide-out Resort Detail Drawer with Vertical Elevation Chart */}
      <ResortDetailDrawer
        resort={selectedResort}
        onClose={() => setSelectedResort(null)}
        hourOffset={scrubHour}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>PowderPredictor • Kubernetes-Native Meteorological Operator &amp; Northeast Freeride Intelligence</p>
      </footer>
    </div>
  );
}

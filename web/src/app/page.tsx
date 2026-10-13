"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Toaster } from "sonner";
import { ResortForecast, ForecastResponse, UserOrigin, PersonaPreset } from "@/types/resort";
import { calculateDistanceMiles, estimateDriveTime } from "@/lib/geo";
import { METRO_ORIGINS, COMPREHENSIVE_NORTHEAST_RESORTS } from "@/lib/resortData";
import { ResortMatrix } from "@/components/resorts/ResortMatrix";
import { ResortDetailModal } from "@/components/resorts/ResortDetailModal";
import { RegionalGuideBento } from "@/components/resorts/RegionalGuideBento";
import { TimelineScrubber } from "@/components/forecast/TimelineScrubber";
import { FilterBar } from "@/components/filters/FilterBar";
import { useForecastStream } from "@/hooks/useForecastStream";
import {
  Snowflake,
  RefreshCw,
  MapPin,
  Thermometer,
  Wind,
  Map as MapIcon,
  TableProperties,
  LayoutGrid,
  Sparkles,
} from "lucide-react";

// Lazy load MapLibre GL component with ssr: false for fast initial bundle loading
const ResortMap = dynamic(
  () => import("@/components/map/ResortMap").then((mod) => mod.ResortMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[580px] rounded-3xl craft-card flex flex-col items-center justify-center text-stone-500 text-xs">
        <Snowflake className="w-6 h-6 animate-spin text-stone-400 mb-2" />
        <span>Initializing Topographical Alpine Canvas...</span>
      </div>
    ),
  }
);

type ActiveViewTab = "map" | "bento" | "matrix";

export default function HomePage() {
  const [resorts, setResorts] = useState<ResortForecast[]>([]);
  const [selectedResort, setSelectedResort] = useState<ResortForecast | null>(null);
  const [activeOrigin, setActiveOrigin] = useState<UserOrigin>(METRO_ORIGINS[0]);
  const [activeTab, setActiveTab] = useState<ActiveViewTab>("map");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  // 72-Hour Temporal Scrubber state
  const [scrubHour, setScrubHour] = useState<number>(0);

  // Custom Persona Profiles & Trip Filters with localStorage persistence
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
      const savedTab = localStorage.getItem("powder_view_tab") as ActiveViewTab;
      if (savedTab && ["map", "bento", "matrix"].includes(savedTab)) {
        setActiveTab(savedTab);
      }
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

  const handleTabChange = (tab: ActiveViewTab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem("powder_view_tab", tab);
    } catch {}
  };

  // Connect live Server-Sent Events stream with Toast alerting
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

  const avgSLR = useMemo(() => {
    if (resorts.length === 0) return 0;
    const sum = resorts.reduce((acc, r) => acc + r.snowToLiquidRatio, 0);
    return (sum / resorts.length).toFixed(1);
  }, [resorts]);

  const avgFreezingLevel = useMemo(() => {
    if (resorts.length === 0) return 5800;
    const sum = resorts.reduce((acc, r) => acc + r.freezingLevelElevationFt, 0);
    return Math.round(sum / resorts.length);
  }, [resorts]);

  return (
    <div className="relative min-h-screen bg-[#0b0c0f] text-[#f4f3ef] flex flex-col font-sans selection:bg-white/15 selection:text-white overflow-hidden">
      {/* Apple-style ethereal ambient radiance */}
      <div className="ambient-glow" />
      <div className="ambient-glow-secondary" />

      {/* Toast Alert Pipeline */}
      <Toaster position="top-right" richColors theme="dark" />

      {/* Top Navigation Bar with Integrated View Tabs (GitHub / Apple style) */}
      <header className="border-b hairline-border bg-[#0b0c0f]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.09] flex items-center justify-center text-stone-200 shadow-sm">
              <Snowflake className="w-4 h-4" />
            </div>
            <div>
              <span className="font-medium text-sm tracking-tight text-[#f4f3ef] block">
                PowderPredictor
              </span>
              <span className="text-[10px] text-stone-500 font-mono tracking-wider uppercase block">
                Northeast
              </span>
            </div>
          </div>

          {/* Central Segmented View Mode Tabs */}
          <nav className="flex items-center bg-white/[0.03] p-1 rounded-2xl border border-white/[0.07] text-xs shadow-inner">
            <button
              onClick={() => handleTabChange("map")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "map"
                  ? "bg-white text-[#0b0c0f] shadow-sm"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Alpine Canvas</span>
            </button>
            <button
              onClick={() => handleTabChange("bento")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "bento"
                  ? "bg-white text-[#0b0c0f] shadow-sm"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Regional Guide</span>
            </button>
            <button
              onClick={() => handleTabChange("matrix")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "matrix"
                  ? "bg-white text-[#0b0c0f] shadow-sm"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              <TableProperties className="w-3.5 h-3.5" />
              <span>Summit Matrix</span>
            </button>
          </nav>

          {/* Right Status / Origin Selector */}
          <div className="flex items-center gap-2.5 text-xs shrink-0">
            {/* Origin Metro Dropdown */}
            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.07] rounded-xl px-2.5 py-1 text-stone-300">
              <MapPin className="w-3 h-3 text-stone-400" />
              <span className="hidden lg:inline text-stone-500 text-[11px]">Origin:</span>
              <select
                value={activeOrigin.id}
                onChange={(e) => handleOriginChange(e.target.value)}
                className="bg-transparent text-xs text-stone-200 focus:outline-none cursor-pointer"
              >
                {METRO_ORIGINS.map((orig) => (
                  <option key={orig.id} value={orig.id} className="bg-[#121318] text-stone-200">
                    {orig.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Live Telemetry Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium border bg-white/[0.02] border-white/[0.06] text-stone-300">
              <span className={`w-1.5 h-1.5 rounded-full ${sseConnected ? "bg-emerald-400 animate-pulse" : "bg-stone-500"}`} />
              <span className="hidden xl:inline">{sseConnected ? "Live Telemetry" : "Mesh Connected"}</span>
            </div>

            <button
              onClick={fetchForecasts}
              title="Refresh Forecast Data"
              className="p-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] text-stone-400 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-stone-300" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Editorial Narrative & Quick Metric Dock (Ellipsus + Apple style) */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium tracking-widest uppercase text-stone-400 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-stone-400" />
                <span>Northeast Mountain Weather Intelligence</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#fbfbfa]">
                Alpine Lapse Rates &amp; Snowpack Microclimates
              </h1>
              <p className="text-xs sm:text-sm text-stone-400 max-w-2xl leading-relaxed">
                Atmospheric downscaling across 26 summits in Vermont, New Hampshire, Maine, New York, and Massachusetts.
              </p>
            </div>

            {/* Quick Metrics Dock */}
            <div className="flex flex-wrap items-center gap-2 craft-card p-1.5 rounded-2xl text-xs font-mono">
              {topResort && (
                <div
                  onClick={() => setSelectedResort(topResort)}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] cursor-pointer transition-colors"
                >
                  <span className="text-[10px] text-stone-500 block uppercase">Top Target</span>
                  <span className="text-stone-200 font-semibold">{topResort.name} ({topResort.powderScore} pts)</span>
                </div>
              )}
              <div className="px-3 py-1.5 rounded-xl bg-white/[0.04]">
                <span className="text-[10px] text-stone-500 block uppercase">Freeze Line</span>
                <span className="text-stone-300">{avgFreezingLevel.toLocaleString()}&apos; MSL</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white/[0.04]">
                <span className="text-[10px] text-stone-500 block uppercase">SLR Density</span>
                <span className="text-stone-300">{avgSLR}:1</span>
              </div>
            </div>
          </div>

          {/* Custom Persona Profiles & Pass Alliance Multi-Select */}
          <FilterBar
            selectedPersona={selectedPersona}
            onSelectPersona={handlePersonaChange}
            selectedPasses={selectedPasses}
            onTogglePass={handleTogglePass}
            onClearAll={handleClearFilters}
          />

          {/* 72-Hour Temporal Scrubbing Bar */}
          <TimelineScrubber
            currentHourOffset={scrubHour}
            onChange={setScrubHour}
          />
        </div>

        {/* View Content (Dynamic based on activeTab) */}
        <div>
          {activeTab === "map" && (
            <section className="w-full h-[640px]">
              <ResortMap
                resorts={resorts}
                selectedResortId={selectedResort?.resortId}
                onSelectResort={(r) => setSelectedResort(r)}
                hourOffset={scrubHour}
              />
            </section>
          )}

          {activeTab === "bento" && (
            <section className="w-full">
              <RegionalGuideBento
                resorts={resorts}
                onSelectResort={(r) => setSelectedResort(r)}
                hourOffset={scrubHour}
              />
            </section>
          )}

          {activeTab === "matrix" && (
            <section className="w-full space-y-3">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xs font-medium text-stone-300 uppercase tracking-wider">
                  Full 26-Mountain Comparative Matrix
                </h3>
                {lastSyncTime && (
                  <span className="text-[11px] text-stone-500 font-mono">
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
          )}
        </div>
      </main>

      {/* Centered Apple-Style Modal for Full Mountain Sounding */}
      <ResortDetailModal
        resort={selectedResort}
        onClose={() => setSelectedResort(null)}
        hourOffset={scrubHour}
      />

      {/* Editorial Footer */}
      <footer className="border-t hairline-border bg-[#0b0c0f] py-8 text-center text-xs text-stone-500 mt-16">
        <p>PowderPredictor • Meteorological downscaling &amp; alpine snowpack modeling for the Northeast Appalachian ranges.</p>
      </footer>
    </div>
  );
}

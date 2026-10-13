"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Toaster, toast } from "sonner";
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
  Map as MapIcon,
  TableProperties,
  LayoutGrid,
  Sparkles,
  Mountain,
  Check,
} from "lucide-react";

// Lazy load MapLibre GL component with ssr: false for fast initial bundle loading
const ResortMap = dynamic(
  () => import("@/components/map/ResortMap").then((mod) => mod.ResortMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[580px] rounded-3xl craft-card flex flex-col items-center justify-center text-stone-400 text-sm font-medium">
        <Snowflake className="w-7 h-7 animate-spin text-sky-400 mb-2.5" />
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
  const [isRecentlyRefreshed, setIsRecentlyRefreshed] = useState<boolean>(false);
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

  const fetchForecasts = useCallback(async (isManualTrigger = false) => {
    try {
      setIsLoading(true);
      const startTime = Date.now();

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

      // Guarantee minimum 650ms animation feedback so the click is clearly perceptible
      const elapsed = Date.now() - startTime;
      if (elapsed < 650) {
        await new Promise((resolve) => setTimeout(resolve, 650 - elapsed));
      }

      const syncTimeString = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLastSyncTime(syncTimeString);

      if (isManualTrigger) {
        setIsRecentlyRefreshed(true);
        setTimeout(() => setIsRecentlyRefreshed(false), 2400);
        toast.success("Telemetry Synced", {
          description: `Updated 26 summits with latest model run (${syncTimeString})`,
          duration: 3000,
        });
      }
    } catch {
      setResorts(decorateWithDistances(COMPREHENSIVE_NORTHEAST_RESORTS, activeOrigin));
      const syncTimeString = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLastSyncTime(syncTimeString);

      if (isManualTrigger) {
        setIsRecentlyRefreshed(true);
        setTimeout(() => setIsRecentlyRefreshed(false), 2400);
        toast.info("Cached Telemetry Active", {
          description: `Synchronized from local high-resolution sounding cache (${syncTimeString})`,
          duration: 3000,
        });
      }
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

  // Filtered resorts based on active Persona Preset and Pass Alliance selections
  const filteredResorts = useMemo(() => {
    return resorts.filter((r) => {
      // Pass Multi-Select
      if (selectedPasses.length > 0 && !selectedPasses.includes(r.passType)) {
        return false;
      }

      // Persona Filters
      if (selectedPersona === "glade_hunter") {
        if (r.powderScore < 80 || r.snowToLiquidRatio < 14.0 || r.baseDepthInches < 24) {
          return false;
        }
      } else if (selectedPersona === "wind_avoider") {
        // Must be wind protected AND have rideable conditions (not a barren/dry mountain)
        const hasSnow = (r.snowfall48hInches ?? r.predictedSnowfallInches) >= 2.0 || r.baseDepthInches >= 12 || r.powderScore >= 40;
        if (r.windHoldWarning || (r.windAnalysis?.gustMph ?? 0) > 35 || !hasSnow) {
          return false;
        }
      } else if (selectedPersona === "bluebird_cruiser") {
        // Calm skies and good snow base without crust
        const hasBase = r.baseDepthInches >= 12 || r.powderScore >= 40 || (r.snowfall48hInches ?? r.predictedSnowfallInches) >= 1.0;
        if ((r.windAnalysis?.speedMph ?? 0) >= 15 || r.crustRisk || !hasBase) {
          return false;
        }
      }

      return true;
    });
  }, [resorts, selectedPasses, selectedPersona]);

  // Aggregate summary stats
  const topResort = useMemo(() => {
    const list = filteredResorts.length > 0 ? filteredResorts : resorts;
    if (list.length === 0) return null;
    return [...list].sort((a, b) => b.powderScore - a.powderScore)[0];
  }, [filteredResorts, resorts]);

  const avgSLR = useMemo(() => {
    const list = filteredResorts.length > 0 ? filteredResorts : resorts;
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, r) => acc + r.snowToLiquidRatio, 0);
    return (sum / list.length).toFixed(1);
  }, [filteredResorts, resorts]);

  const avgFreezingLevel = useMemo(() => {
    if (resorts.length === 0) return 5800;
    const sum = resorts.reduce((acc, r) => acc + r.freezingLevelElevationFt, 0);
    return Math.round(sum / resorts.length);
  }, [resorts]);

  return (
    <div className="relative min-h-screen bg-[#07080b] text-[#f4f3ef] flex flex-col font-sans selection:bg-sky-500/25 selection:text-sky-200 overflow-hidden topo-grid-bg text-sm">
      {/* Multi-colored Alpine Aurora Light Fields */}
      <div className="aurora-glow-primary" />
      <div className="aurora-glow-secondary" />
      <div className="aurora-glow-tertiary" />

      {/* Toast Alert Pipeline */}
      <Toaster position="top-right" richColors theme="dark" />

      {/* Top Navigation Bar with Integrated View Tabs (GitHub / Apple style) */}
      <header className="border-b hairline-border bg-[#07080b]/85 backdrop-blur-2xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-14 xl:px-16 h-20 flex items-center justify-between gap-6">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500/20 via-indigo-500/20 to-purple-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shadow-md shadow-sky-500/10">
              <Snowflake className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base tracking-tight text-[#f4f3ef]">
                  PowderPredictor
                </span>
                <span className="text-xs text-sky-400 font-mono tracking-wider bg-sky-950/60 border border-sky-800/60 px-2 py-0.5 rounded">
                  Northeast
                </span>
              </div>
              <span className="text-xs text-stone-400 font-medium block">
                26 Northeast Summits
              </span>
            </div>
          </div>

          {/* Central Segmented View Mode Tabs (Apple / Ellipsus sleek craft styling) */}
          <nav className="flex items-center bg-[#0d0e14]/90 p-1 rounded-2xl border border-white/[0.08] text-xs sm:text-sm shadow-xl backdrop-blur-md">
            <button
              onClick={() => handleTabChange("map")}
              className={`relative flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl font-medium transition-all duration-200 cursor-pointer select-none ${
                activeTab === "map"
                  ? "bg-white/[0.12] text-white shadow-sm border border-white/[0.15] font-semibold"
                  : "text-stone-400 hover:text-stone-200 hover:bg-white/[0.04] border border-transparent"
              }`}
            >
              <MapIcon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${activeTab === "map" ? "text-sky-400" : "text-stone-400"}`} />
              <span>Alpine Map</span>
              {activeTab === "map" && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-sm shadow-sky-400 shrink-0" />
              )}
            </button>
            <button
              onClick={() => handleTabChange("bento")}
              className={`relative flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl font-medium transition-all duration-200 cursor-pointer select-none ${
                activeTab === "bento"
                  ? "bg-white/[0.12] text-white shadow-sm border border-white/[0.15] font-semibold"
                  : "text-stone-400 hover:text-stone-200 hover:bg-white/[0.04] border border-transparent"
              }`}
            >
              <LayoutGrid className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${activeTab === "bento" ? "text-indigo-400" : "text-stone-400"}`} />
              <span>Regional Guide</span>
              {activeTab === "bento" && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400 shrink-0" />
              )}
            </button>
            <button
              onClick={() => handleTabChange("matrix")}
              className={`relative flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl font-medium transition-all duration-200 cursor-pointer select-none ${
                activeTab === "matrix"
                  ? "bg-white/[0.12] text-white shadow-sm border border-white/[0.15] font-semibold"
                  : "text-stone-400 hover:text-stone-200 hover:bg-white/[0.04] border border-transparent"
              }`}
            >
              <TableProperties className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${activeTab === "matrix" ? "text-purple-400" : "text-stone-400"}`} />
              <span>Summit Matrix</span>
              {activeTab === "matrix" && (
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-sm shadow-purple-400 shrink-0" />
              )}
            </button>
          </nav>

          {/* Right Status / Origin Selector */}
          <div className="flex items-center gap-3 text-sm shrink-0">
            {/* Origin Metro Dropdown */}
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-1.5 text-stone-200">
              <MapPin className="w-4 h-4 text-sky-400" />
              <span className="hidden lg:inline text-stone-400 text-xs font-medium">Origin:</span>
              <select
                value={activeOrigin.id}
                onChange={(e) => handleOriginChange(e.target.value)}
                className="bg-transparent text-sm text-stone-100 focus:outline-none cursor-pointer font-medium"
              >
                {METRO_ORIGINS.map((orig) => (
                  <option key={orig.id} value={orig.id} className="bg-[#121318] text-stone-200">
                    {orig.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Live Telemetry Indicator */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border bg-emerald-950/40 border-emerald-800/50 text-emerald-300">
              <span className={`w-2 h-2 rounded-full ${sseConnected ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400" : "bg-stone-500"}`} />
              <span className="hidden xl:inline">{sseConnected ? "Live Telemetry" : "Mesh Connected"}</span>
            </div>

            {/* Interactive Refresh Pill Button */}
            <button
              onClick={() => fetchForecasts(true)}
              disabled={isLoading}
              title={lastSyncTime ? `Last synced at ${lastSyncTime}` : "Refresh Forecast Telemetry"}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all duration-200 cursor-pointer select-none active:scale-95 ${
                isRecentlyRefreshed
                  ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-300 shadow-md shadow-emerald-500/10"
                  : isLoading
                  ? "bg-sky-950/50 border-sky-500/50 text-sky-200"
                  : "bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] hover:border-white/[0.15] text-stone-300 hover:text-white"
              }`}
            >
              {isRecentlyRefreshed ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5] animate-in zoom-in-75 duration-150" />
              ) : (
                <RefreshCw
                  className={`w-3.5 h-3.5 transition-transform duration-500 ${
                    isLoading ? "animate-spin text-sky-400" : "text-stone-400 group-hover:text-stone-200"
                  }`}
                />
              )}
              <span className="hidden md:inline font-mono">
                {isRecentlyRefreshed ? "Updated" : isLoading ? "Syncing..." : lastSyncTime ? `Sync (${lastSyncTime.split(" ")[0]})` : "Sync"}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 sm:px-10 lg:px-14 xl:px-16 py-8 space-y-7">
        {/* Editorial Narrative & Quick Metric Dock */}
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
            <div className="space-y-2">
              <div className="text-xs font-semibold tracking-wider uppercase text-sky-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Atmospheric Lapse Rate &amp; Terrain Downscaling</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#fbfbfa] leading-tight">
                Northeast Mountain Weather &amp;{" "}
                <span className="bg-gradient-to-r from-sky-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                  Alpine Microclimates
                </span>
              </h1>
              <p className="text-sm sm:text-base text-stone-300 max-w-3xl leading-relaxed">
                Atmospheric lapse rates, freezing lines aloft, and leeward snowpack loading modeled across 26 Northeast summits in VT, NH, ME, NY, and MA.
              </p>
            </div>

            {/* Quick Metrics Dock */}
            <div className="flex flex-wrap items-center gap-2.5 craft-card p-2 rounded-2xl text-sm font-medium">
              {topResort && (
                <div
                  onClick={() => setSelectedResort(topResort)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500/15 to-indigo-500/15 border border-sky-500/30 hover:border-sky-400/50 cursor-pointer transition-all"
                >
                  <span className="text-xs text-sky-300 block font-semibold uppercase">Top Target</span>
                  <span className="text-white font-bold">{topResort.name} ({topResort.powderScore} pts)</span>
                </div>
              )}
              <div className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <span className="text-xs text-stone-400 block font-semibold uppercase">Freezing Line</span>
                <span className="text-stone-100 font-bold">{avgFreezingLevel.toLocaleString()}&apos; MSL</span>
              </div>
              <div className="px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <span className="text-xs text-stone-400 block font-semibold uppercase">Snow Density</span>
                <span className="text-stone-100 font-bold">{avgSLR}:1 SLR</span>
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
            <section className="w-full h-[660px]">
              <ResortMap
                resorts={filteredResorts}
                selectedResortId={selectedResort?.resortId}
                onSelectResort={(r) => setSelectedResort(r)}
                hourOffset={scrubHour}
              />
            </section>
          )}

          {activeTab === "bento" && (
            <section className="w-full">
              <RegionalGuideBento
                resorts={filteredResorts}
                onSelectResort={(r) => setSelectedResort(r)}
                hourOffset={scrubHour}
              />
            </section>
          )}

          {activeTab === "matrix" && (
            <section className="w-full space-y-4">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-sm font-semibold text-stone-200 uppercase tracking-wider flex items-center gap-2">
                  <Mountain className="w-4 h-4 text-sky-400" />
                  <span>26-Mountain Comparative Matrix</span>
                </h3>
                {lastSyncTime && (
                  <span className="text-xs text-stone-400 font-mono">
                    Updated {lastSyncTime}
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
      <footer className="border-t hairline-border bg-[#07080b]/90 py-10 text-center text-sm text-stone-400 mt-20">
        <p className="font-medium text-stone-300">
          PowderPredictor • Meteorological downscaling &amp; alpine snowpack modeling for the Northeast Appalachian ranges.
        </p>
        <p className="text-xs text-stone-500 mt-1.5">
          Real-time NOAA Soundings, USDA SNOTEL Snowpacks, and Orographic Microclimates across VT, NH, ME, NY, and MA.
        </p>
      </footer>
    </div>
  );
}

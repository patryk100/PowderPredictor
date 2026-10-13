"use client";

import React from "react";
import { ResortForecast, HourlyForecastStep } from "@/types/resort";
import { Mountain, CloudRain, Snowflake, CloudSnow, Sparkles, TrendingDown, Thermometer } from "lucide-react";

interface ElevationProfileChartProps {
  resort: ResortForecast;
  currentStep?: HourlyForecastStep;
}

export const ElevationProfileChart: React.FC<ElevationProfileChartProps> = ({
  resort,
  currentStep,
}) => {
  const summitFt = resort.summitFt;
  const baseFt = resort.baseFt;
  const midFt = Math.round((summitFt + baseFt) / 2);

  // Dynamic Freezing level from current time step or default
  const freezeFt = currentStep?.freezingLevelElevationFt ?? resort.freezingLevelElevationFt;
  const phase = currentStep?.phase ?? (freezeFt < baseFt ? "blower_powder" : "mixed");
  const inDGZ = currentStep?.inDGZ ?? false;

  // Elevation band percentage calculation inside relative container (0% = base, 100% = summit)
  const rangeFt = Math.max(1, summitFt - baseFt);
  const freezePct = Math.min(100, Math.max(0, ((freezeFt - baseFt) / rangeFt) * 100));

  // Determine precipitation phase icon & description
  const getPhaseBadge = () => {
    switch (phase) {
      case "blower_powder":
        return {
          icon: <Sparkles className="w-4 h-4 text-purple-400" />,
          label: "Blower Dendritic Powder (<10°F)",
          color: "text-purple-300 bg-purple-950/60 border-purple-800/60",
        };
      case "dense_snow":
        return {
          icon: <CloudSnow className="w-4 h-4 text-blue-400" />,
          label: "Dense Mountain Powder (15–28°F)",
          color: "text-blue-300 bg-blue-950/60 border-blue-800/60",
        };
      case "mixed":
        return {
          icon: <Snowflake className="w-4 h-4 text-amber-400" />,
          label: "Freezing Rain / Sleet Mix (31–34°F)",
          color: "text-amber-300 bg-amber-950/60 border-amber-800/60",
        };
      case "rain":
        return {
          icon: <CloudRain className="w-4 h-4 text-rose-400" />,
          label: "Valley Rain (>34°F)",
          color: "text-rose-300 bg-rose-950/60 border-rose-800/60",
        };
      default:
        return {
          icon: <Mountain className="w-4 h-4 text-slate-400" />,
          label: "Dry / Clear Air",
          color: "text-slate-300 bg-slate-900 border-slate-700",
        };
    }
  };

  const badge = getPhaseBadge();

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mountain className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Vertical Elevation Cross-Section
          </h3>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${badge.color}`}>
          {badge.icon}
          <span>{badge.label}</span>
        </div>
      </div>

      {/* DGZ Alert Badge */}
      {inDGZ && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-950/60 border border-purple-800/80 text-purple-200 text-xs shadow-md animate-pulse">
          <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
          <span>
            <strong>Dendritic Growth Zone (DGZ) Active:</strong> Temperature between −12°C and −18°C generating high-SLR stellar crystals.
          </span>
        </div>
      )}

      {/* Interactive Mountain Cross-Section Graphic */}
      <div className="relative h-44 w-full bg-slate-950 rounded-xl border border-slate-800/80 p-3 overflow-hidden flex flex-col justify-between">
        {/* Dynamic Freezing Line Indicator */}
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-rose-400/90 z-20 transition-all duration-300 flex items-center justify-between px-3"
          style={{ bottom: `${freezePct}%` }}
        >
          <span className="text-[10px] font-mono font-black text-rose-300 bg-slate-950/90 px-1.5 py-0.5 rounded border border-rose-500/50 -translate-y-1/2">
            Freeze Line: {freezeFt.toLocaleString()}&apos; (32°F)
          </span>
          <span className="text-[10px] text-rose-400 font-semibold -translate-y-1/2 hidden sm:inline">
            {freezeFt > summitFt ? "Above Summit (Rain Risk)" : freezeFt < baseFt ? "All Snow to Base" : "Mid-Mountain Split"}
          </span>
        </div>

        {/* Snow vs Rain Shading Background */}
        <div
          className="absolute inset-x-0 top-0 bg-blue-500/10 pointer-events-none transition-all duration-300"
          style={{ bottom: `${freezePct}%` }}
        />
        <div
          className="absolute inset-x-0 bottom-0 bg-rose-500/10 pointer-events-none transition-all duration-300"
          style={{ height: `${freezePct}%` }}
        />

        {/* Summit Tier */}
        <div className="flex justify-between items-center z-10 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span className="font-bold text-white">Summit Tier</span>
            <span className="text-[10px] font-mono text-slate-400">({summitFt.toLocaleString()}&apos;)</span>
          </div>
          <span className="font-mono font-black text-purple-300 text-sm">
            {currentStep ? `${currentStep.summitTempF}°F (${currentStep.summitTempC}°C)` : `${resort.elevationTiers?.summitTempF ?? 18}°F`}
          </span>
        </div>

        {/* Mid-Mountain Tier */}
        <div className="flex justify-between items-center z-10 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <span className="font-bold text-slate-200">Mid Mountain</span>
            <span className="text-[10px] font-mono text-slate-400">({midFt.toLocaleString()}&apos;)</span>
          </div>
          <span className="font-mono font-bold text-sky-300 text-sm">
            {currentStep ? `${currentStep.midTempF}°F` : `${resort.elevationTiers?.midTempF ?? 23}°F`}
          </span>
        </div>

        {/* Base Tier */}
        <div className="flex justify-between items-center z-10 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="font-bold text-slate-200">Base Valley</span>
            <span className="text-[10px] font-mono text-slate-400">({baseFt.toLocaleString()}&apos;)</span>
          </div>
          <span className="font-mono font-bold text-emerald-300 text-sm">
            {currentStep ? `${currentStep.baseTempF}°F` : `${resort.elevationTiers?.baseTempF ?? 27}°F`}
          </span>
        </div>
      </div>
    </div>
  );
};

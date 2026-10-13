"use client";

import React from "react";
import { ResortForecast, HourlyForecastStep } from "@/types/resort";
import { Mountain, CloudRain, Snowflake, CloudSnow, Sparkles } from "lucide-react";

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

  const getPhaseBadge = () => {
    switch (phase) {
      case "blower_powder":
        return {
          icon: <Sparkles className="w-3.5 h-3.5 text-indigo-300" />,
          label: "Blower Dendritic Powder (<10°F)",
          color: "text-indigo-200 bg-indigo-500/10 border-indigo-500/20",
        };
      case "dense_snow":
        return {
          icon: <CloudSnow className="w-3.5 h-3.5 text-blue-300" />,
          label: "Dense Mountain Powder (15–28°F)",
          color: "text-blue-200 bg-blue-500/10 border-blue-500/20",
        };
      case "mixed":
        return {
          icon: <Snowflake className="w-3.5 h-3.5 text-amber-300" />,
          label: "Mixed Precipitation / Sleet (31–34°F)",
          color: "text-amber-200 bg-amber-500/10 border-amber-500/20",
        };
      case "rain":
        return {
          icon: <CloudRain className="w-3.5 h-3.5 text-stone-400" />,
          label: "Valley Rain (>34°F)",
          color: "text-stone-300 bg-white/[0.04] border-white/[0.08]",
        };
      default:
        return {
          icon: <Mountain className="w-3.5 h-3.5 text-stone-400" />,
          label: "Dry Air / Settled",
          color: "text-stone-300 bg-white/[0.04] border-white/[0.08]",
        };
    }
  };

  const badge = getPhaseBadge();

  return (
    <div className="w-full bg-white/[0.02] border border-white/[0.07] rounded-2xl p-4 space-y-3.5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mountain className="w-3.5 h-3.5 text-stone-400" />
          <h3 className="text-[11px] font-medium text-stone-300 uppercase tracking-wider">
            Atmospheric Cross-Section
          </h3>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${badge.color}`}>
          {badge.icon}
          <span>{badge.label}</span>
        </div>
      </div>

      {/* DGZ Alert Badge */}
      {inDGZ && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
          <span>
            <strong>Dendritic Growth Zone (DGZ) Active:</strong> Cloud temperature between −12°C and −18°C supporting high-SLR crystal formation.
          </span>
        </div>
      )}

      {/* Interactive Mountain Cross-Section Graphic */}
      <div className="relative h-40 w-full bg-[#08090b] rounded-xl border border-white/[0.06] p-3 overflow-hidden flex flex-col justify-between">
        {/* Dynamic Freezing Line Indicator */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-rose-400/80 z-20 transition-all duration-300 flex items-center justify-between px-3"
          style={{ bottom: `${freezePct}%` }}
        >
          <span className="text-[10px] font-mono text-rose-300 bg-[#0c0d10] px-1.5 py-0.5 rounded border border-rose-500/40 -translate-y-1/2">
            Freeze Level: {freezeFt.toLocaleString()}&apos; MSL
          </span>
          <span className="text-[10px] font-mono text-rose-300/80 bg-[#0c0d10] px-1.5 py-0.5 rounded border border-rose-500/40 -translate-y-1/2">
            32°F Boundary
          </span>
        </div>

        {/* Mountain Slope Graphic Fill */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <polygon points="0,100 35,45 65,30 100,5 100,100" fill="currentColor" className="text-stone-700" />
        </svg>

        {/* Summit Tier */}
        <div className="relative z-10 flex justify-between items-center text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-stone-300"></span>
            <span className="font-medium text-stone-200">Summit</span>
            <span className="text-stone-500 font-mono text-[11px]">{summitFt.toLocaleString()}&apos;</span>
          </div>
          <span className="font-mono text-stone-300 font-medium text-xs">
            {currentStep ? `${currentStep.summitTempF}°F` : "36°F"}
          </span>
        </div>

        {/* Mid-Mountain Tier */}
        <div className="relative z-10 flex justify-between items-center text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-stone-400"></span>
            <span className="font-medium text-stone-300">Mid-Mtn</span>
            <span className="text-stone-500 font-mono text-[11px]">{midFt.toLocaleString()}&apos;</span>
          </div>
          <span className="font-mono text-stone-400 text-xs">
            {currentStep ? `${currentStep.midTempF}°F` : "42°F"}
          </span>
        </div>

        {/* Base Tier */}
        <div className="relative z-10 flex justify-between items-center text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-stone-500"></span>
            <span className="font-medium text-stone-400">Base</span>
            <span className="text-stone-500 font-mono text-[11px]">{baseFt.toLocaleString()}&apos;</span>
          </div>
          <span className="font-mono text-stone-400 text-xs">
            {currentStep ? `${currentStep.baseTempF}°F` : "48°F"}
          </span>
        </div>
      </div>
    </div>
  );
};

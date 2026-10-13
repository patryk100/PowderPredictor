"use client";

import React, { useState } from "react";
import { ResortForecast } from "@/types/resort";
import { getPowderScoreBadge, getSnowfallColor } from "@/lib/geo";
import { ElevationProfileChart } from "@/components/resorts/ElevationProfileChart";
import {
  X,
  Mountain,
  Wind,
  AlertTriangle,
  Compass,
  Thermometer,
  Clock,
  Sparkles,
  TrendingUp,
} from "lucide-react";

interface ResortDetailDrawerProps {
  resort: ResortForecast | null;
  onClose: () => void;
  hourOffset?: number;
}

export const ResortDetailDrawer: React.FC<ResortDetailDrawerProps> = ({
  resort,
  onClose,
  hourOffset = 0,
}) => {
  if (!resort) return null;

  // Find step in hourly series corresponding to scrubber offset
  const currentStep = resort.hourlySeries?.find((s) => s.hourOffset === hourOffset) ?? resort.hourlySeries?.[0];

  const snowfall = currentStep?.cumulativeSnowInches ?? resort.snowfall48hInches ?? resort.predictedSnowfallInches;
  const colorInfo = getSnowfallColor(snowfall);
  const scoreBadge = getPowderScoreBadge(resort.powderScore);
  const tiers = resort.elevationTiers;
  const wind = resort.windAnalysis;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-slate-950/95 backdrop-blur-2xl border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-5 border-b border-slate-800/80 flex justify-between items-start bg-slate-900/60">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-white tracking-tight">{resort.name}</h2>
            <span className="text-[10px] bg-cyan-950/80 border border-cyan-800/60 text-cyan-400 font-mono font-bold px-2 py-0.5 rounded-full uppercase">
              {resort.region}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {resort.passType} Pass Alliance • {resort.skiableAcres} Skiable Acres
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
        {/* Powder Score & Primary Forecast Stat */}
        <div className="grid grid-cols-2 gap-3">
          {/* Powder Score Card */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">
              Powder Score
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-black font-mono text-cyan-400">
                {resort.powderScore}
              </span>
              <span className="text-xs text-slate-500 font-mono">/ 100</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${scoreBadge.bg}`}>
                {scoreBadge.label}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {resort.confidenceInterval}% conf
              </span>
            </div>
          </div>

          {/* Cumulative Snow Card */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">
              Modeled Accumulation (+{hourOffset}h)
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-black font-mono text-purple-400">
                {snowfall}&quot;
              </span>
              <span className="text-xs text-slate-400 font-mono">
                SLR {resort.snowToLiquidRatio.toFixed(1)}:1
              </span>
            </div>
            <div className="mt-2 text-[10px] text-slate-400">
              Storm Peak: <span className="font-bold text-slate-200">{resort.predictedSnowfallInches}&quot;</span>
            </div>
          </div>
        </div>

        {/* Story 5.3: Elevation Cross Section Profile & DGZ */}
        <ElevationProfileChart resort={resort} currentStep={currentStep} />

        {/* Travel & SNOTEL Live Sensors */}
        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-2.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Drive Time Estimate:</span>
            </span>
            <span className="font-mono font-bold text-slate-100">
              {resort.driveTimeEstimate ?? "-"} ({resort.distanceMiles ?? 0} mi)
            </span>
          </div>

          <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800/80">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Mountain className="w-4 h-4 text-emerald-400" />
              <span>Settled Base Depth:</span>
            </span>
            <span className="font-mono font-bold text-slate-100">
              {resort.baseDepthInches}&quot; (SNOTEL Calibrated)
            </span>
          </div>

          <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800/80">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Thermometer className="w-4 h-4 text-sky-400" />
              <span>Freezing Level Altitude:</span>
            </span>
            <span className="font-mono font-bold text-slate-100">
              {(currentStep?.freezingLevelElevationFt ?? resort.freezingLevelElevationFt).toLocaleString()}&apos; MSL
            </span>
          </div>
        </div>

        {/* Ridgeline Wind Scour & Wind Slab Modeling */}
        {wind && (
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5 text-amber-400" />
                <span>Summit Ridgeline Wind Model</span>
              </span>
              <span className="text-[10px] font-mono text-amber-400 font-semibold">
                Hold Index: {wind.windHoldRiskIndex}/100
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Vector &amp; Speed</span>
                <span className="font-mono font-bold text-slate-100 mt-0.5 block">
                  {wind.cardinal} @ {currentStep?.windSpeedMph ?? wind.speedMph} mph (Gust {currentStep?.windGustMph ?? wind.gustMph})
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Loaded Leeward Aspect</span>
                <span className="font-mono font-bold text-emerald-400 mt-0.5 block">
                  {wind.loadedAspects.join(", ")} Bowls (+20% stashes)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Surface Recommendations */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Surface Quality &amp; Advisory Tags
          </span>
          {resort.gladesRecommended && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs">
              <Compass className="w-4 h-4 shrink-0" />
              <span><strong>Protected Glades Recommended:</strong> Leeward stashes holding untracked dry powder.</span>
            </div>
          )}
          {resort.windHoldWarning && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-950/50 border border-amber-800/60 text-amber-300 text-xs">
              <Wind className="w-4 h-4 shrink-0" />
              <span><strong>Wind Hold Warning:</strong> Exposed summit quads &amp; tram facing hold risk &gt;35 mph.</span>
            </div>
          )}
          {resort.crustRisk && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span><strong>Rain / Refreeze Crust Warning:</strong> Low elevation base affected by thermal inversion.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

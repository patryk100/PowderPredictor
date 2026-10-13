"use client";

import React from "react";
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

  const currentStep = resort.hourlySeries?.find((s) => s.hourOffset === hourOffset) ?? resort.hourlySeries?.[0];
  const snowfall = currentStep?.cumulativeSnowInches ?? resort.snowfall48hInches ?? resort.predictedSnowfallInches;
  const scoreBadge = getPowderScoreBadge(resort.powderScore);
  const wind = resort.windAnalysis;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-[#0c0d11]/95 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl flex flex-col animate-in slide-in-from-right duration-250">
      {/* Header */}
      <div className="p-5 border-b hairline-border flex justify-between items-start bg-white/[0.02]">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-medium text-[#f4f3ef] tracking-tight">{resort.name}</h2>
            <span className="text-[10px] bg-white/[0.06] border border-white/[0.1] text-stone-300 font-mono px-2 py-0.5 rounded-full uppercase">
              {resort.region}
            </span>
          </div>
          <p className="text-xs text-stone-400 mt-1">
            {resort.passType} Pass • {resort.skiableAcres} Skiable Acres
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-stone-400 hover:text-white transition-colors cursor-pointer border border-white/[0.06]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
        {/* Powder Score & Primary Forecast Stat */}
        <div className="grid grid-cols-2 gap-3">
          {/* Powder Score Card */}
          <div className="p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.07]">
            <span className="text-[10px] text-stone-400 uppercase tracking-wider block font-medium">
              Powder Score
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-3xl font-semibold font-mono text-white">
                {resort.powderScore}
              </span>
              <span className="text-[11px] text-stone-500 font-mono">/ 100</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${scoreBadge.bg}`}>
                {scoreBadge.label}
              </span>
              <span className="text-[10px] text-stone-500 font-mono">
                {resort.confidenceInterval}% conf
              </span>
            </div>
          </div>

          {/* Cumulative Snow Card */}
          <div className="p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.07]">
            <span className="text-[10px] text-stone-400 uppercase tracking-wider block font-medium">
              Accumulation (+{hourOffset}h)
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-3xl font-semibold font-mono text-white">
                {snowfall}&quot;
              </span>
              <span className="text-[11px] text-stone-400 font-mono">
                SLR {resort.snowToLiquidRatio.toFixed(1)}:1
              </span>
            </div>
            <div className="mt-2 text-[10px] text-stone-400 font-mono">
              Storm total: <span className="text-stone-200">{resort.predictedSnowfallInches}&quot;</span>
            </div>
          </div>
        </div>

        {/* Elevation Cross Section Profile & DGZ */}
        <ElevationProfileChart resort={resort} currentStep={currentStep} />

        {/* Travel & Sensor Telemetry */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-stone-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-500" />
              <span>Drive Time:</span>
            </span>
            <span className="font-mono text-stone-200 font-medium">
              {resort.driveTimeEstimate ?? "-"} ({resort.distanceMiles ?? 0} mi)
            </span>
          </div>

          <div className="flex justify-between items-center text-xs pt-2 border-t hairline-border">
            <span className="text-stone-400 flex items-center gap-1.5">
              <Mountain className="w-3.5 h-3.5 text-stone-500" />
              <span>Settled Base Depth:</span>
            </span>
            <span className="font-mono text-stone-200">
              {resort.baseDepthInches}&quot; (SNOTEL)
            </span>
          </div>

          <div className="flex justify-between items-center text-xs pt-2 border-t hairline-border">
            <span className="text-stone-400 flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-stone-500" />
              <span>Freezing Level:</span>
            </span>
            <span className="font-mono text-stone-200">
              {(currentStep?.freezingLevelElevationFt ?? resort.freezingLevelElevationFt).toLocaleString()}&apos; MSL
            </span>
          </div>
        </div>

        {/* Ridgeline Wind Scour & Wind Slab Modeling */}
        {wind && (
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-medium text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5 text-stone-400" />
                <span>Summit Ridgeline Wind</span>
              </span>
              <span className="text-[10px] font-mono text-stone-400">
                Hold Index: {wind.windHoldRiskIndex}/100
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <span className="text-[10px] text-stone-500 block uppercase tracking-wider">Vector</span>
                <span className="font-mono text-stone-200 mt-0.5 block">
                  {wind.cardinal} @ {currentStep?.windSpeedMph ?? wind.speedMph} mph
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <span className="text-[10px] text-stone-500 block uppercase tracking-wider">Deposition Aspect</span>
                <span className="font-mono text-stone-300 mt-0.5 block">
                  {wind.loadedAspects.join(", ")}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Advisory Tags */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-stone-400 uppercase tracking-wider block">
            Advisories &amp; Microclimate Tags
          </span>
          {resort.gladesRecommended && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs">
              <Compass className="w-3.5 h-3.5 shrink-0" />
              <span>Protected glades holding untracked dry powder.</span>
            </div>
          )}
          {resort.windHoldWarning && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
              <Wind className="w-3.5 h-3.5 shrink-0" />
              <span>Summit lifts subject to wind standby or holds.</span>
            </div>
          )}
          {resort.crustRisk && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-stone-300 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-stone-400" />
              <span>Thaw-refreeze or liquid rain crusting detected at lower elevations.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

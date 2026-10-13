"use client";

import React, { useEffect } from "react";
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
  ExternalLink,
} from "lucide-react";

interface ResortDetailModalProps {
  resort: ResortForecast | null;
  onClose: () => void;
  hourOffset?: number;
}

export const ResortDetailModal: React.FC<ResortDetailModalProps> = ({
  resort,
  onClose,
  hourOffset = 0,
}) => {
  // ESC key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (resort) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "auto";
    };
  }, [resort, onClose]);

  if (!resort) return null;

  const currentStep = resort.hourlySeries?.find((s) => s.hourOffset === hourOffset) ?? resort.hourlySeries?.[0];
  const snowfall = currentStep?.cumulativeSnowInches ?? resort.snowfall48hInches ?? resort.predictedSnowfallInches;
  const scoreBadge = getPowderScoreBadge(resort.powderScore);
  const wind = resort.windAnalysis;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10">
      {/* Backdrop with Apple-style smooth blur */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xl transition-opacity animate-in fade-in duration-200"
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#0d0e12]/95 border border-white/[0.1] rounded-3xl shadow-2xl overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b hairline-border flex justify-between items-start bg-white/[0.02]">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-semibold text-[#f4f3ef] tracking-tight">
                {resort.name}
              </h2>
              <span className="text-[11px] bg-white/[0.06] border border-white/[0.1] text-stone-300 font-mono px-2.5 py-0.5 rounded-full uppercase">
                {resort.region}
              </span>
              <span className="text-[11px] text-stone-400 font-medium px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
                {resort.passType} Pass
              </span>
            </div>
            <p className="text-xs text-stone-400">
              Summit {resort.summitFt.toLocaleString()}&apos; • Base {resort.baseFt.toLocaleString()}&apos; • Vertical {resort.verticalFt.toLocaleString()}&apos; • {resort.skiableAcres} Skiable Acres
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-stone-400 hover:text-white transition-colors cursor-pointer border border-white/[0.08]"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Top Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.06]">
              <span className="text-[10px] text-stone-400 uppercase tracking-wider block font-medium">
                Powder Score
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-semibold font-mono text-white">
                  {resort.powderScore}
                </span>
                <span className="text-[11px] text-stone-500 font-mono">/ 100</span>
              </div>
              <span className={`inline-block mt-1.5 text-[9px] font-medium px-2 py-0.5 rounded-full ${scoreBadge.bg}`}>
                {scoreBadge.label}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.06]">
              <span className="text-[10px] text-stone-400 uppercase tracking-wider block font-medium">
                Accumulation (+{hourOffset}h)
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-semibold font-mono text-white">
                  {snowfall}&quot;
                </span>
              </div>
              <span className="text-[10px] text-stone-400 font-mono block mt-1.5">
                SLR {resort.snowToLiquidRatio.toFixed(1)}:1
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.06]">
              <span className="text-[10px] text-stone-400 uppercase tracking-wider block font-medium">
                Transit Time
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-semibold font-mono text-stone-200">
                  {resort.driveTimeEstimate ?? "-"}
                </span>
              </div>
              <span className="text-[10px] text-stone-400 font-mono block mt-1.5">
                {resort.distanceMiles ?? 0} mi from origin
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.06]">
              <span className="text-[10px] text-stone-400 uppercase tracking-wider block font-medium">
                Natural Base
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-semibold font-mono text-stone-200">
                  {resort.baseDepthInches}&quot;
                </span>
              </div>
              <span className="text-[10px] text-stone-500 font-mono block mt-1.5">
                SNOTEL telemetry
              </span>
            </div>
          </div>

          {/* Atmospheric Elevation Profile & DGZ */}
          <ElevationProfileChart resort={resort} currentStep={currentStep} />

          {/* Summit Wind & Aspect Loading */}
          {wind && (
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-medium text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-stone-400" />
                  <span>Summit Ridgeline Wind Vectors</span>
                </span>
                <span className="text-[10px] font-mono text-stone-400 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.06]">
                  Hold Risk Index: {wind.windHoldRiskIndex}/100
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-white/[0.025] border border-white/[0.05]">
                  <span className="text-[10px] text-stone-500 block uppercase tracking-wider">
                    Sustained &amp; Gusts
                  </span>
                  <span className="font-mono text-stone-200 font-medium text-sm mt-0.5 block">
                    {wind.cardinal} @ {currentStep?.windSpeedMph ?? wind.speedMph} mph (Gusts {currentStep?.windGustMph ?? wind.gustMph})
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.025] border border-white/[0.05]">
                  <span className="text-[10px] text-stone-500 block uppercase tracking-wider">
                    Deposition Aspects
                  </span>
                  <span className="font-mono text-stone-300 font-medium text-sm mt-0.5 block">
                    {wind.loadedAspects.join(", ")} Bowls
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Advisory & Microclimate Tags */}
          <div className="space-y-2">
            <span className="text-[11px] font-medium text-stone-400 uppercase tracking-wider block">
              Alpine Status Advisories
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2.5 text-stone-300">
                <Thermometer className="w-4 h-4 text-stone-400 shrink-0" />
                <span>
                  Freezing level currently at <strong>{(currentStep?.freezingLevelElevationFt ?? resort.freezingLevelElevationFt).toLocaleString()}&apos; MSL</strong>.
                </span>
              </div>

              {resort.crustRisk ? (
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2.5 text-stone-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400/80 shrink-0" />
                  <span>Liquid precipitation or diurnal thaw-refreeze crusting.</span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2.5 text-stone-300">
                  <Compass className="w-4 h-4 text-emerald-400/80 shrink-0" />
                  <span>Cold snowpack preservation sustained.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t hairline-border bg-white/[0.02] flex justify-between items-center text-xs text-stone-500">
          <span>Lat {resort.latitude.toFixed(4)}, Lon {resort.longitude.toFixed(4)}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-white font-medium text-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

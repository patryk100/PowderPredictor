"use client";

import React, { useEffect, useRef, useState } from "react";
import { Map, NavigationControl, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ResortForecast } from "@/types/resort";
import { getSnowfallColor, getPowderScoreBadge } from "@/lib/geo";
import { Mountain, Wind, AlertTriangle, Snowflake, Compass } from "lucide-react";

interface ResortMapProps {
  resorts: ResortForecast[];
  selectedResortId?: string | null;
  onSelectResort?: (resort: ResortForecast) => void;
}

export const ResortMap: React.FC<ResortMapProps> = ({
  resorts,
  selectedResortId,
  onSelectResort,
}) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<Map | null>(null);
  const markersRef = useRef<{ [id: string]: Marker }>({});

  const [hoveredResort, setHoveredResort] = useState<ResortForecast | null>(null);
  const [activePopupResort, setActivePopupResort] = useState<ResortForecast | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Free CARTO Dark basemap or demo vector style
    const mapInstance = new Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [-72.5, 43.8], // Northeast center
      zoom: 6.8,
      minZoom: 5.5,
      maxZoom: 14,
      maxBounds: [
        [-76.5, 40.0], // Southwest bounds (NY/PA border)
        [-66.5, 47.5], // Northeast bounds (Northern Maine / Canadian border)
      ],
    });

    mapInstance.addControl(new NavigationControl({ showCompass: true }), "top-right");

    map.current = mapInstance;

    return () => {
      mapInstance.remove();
      map.current = null;
    };
  }, []);

  // Update Markers dynamically when resorts change
  useEffect(() => {
    if (!map.current) return;

    // Clear old markers
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    resorts.forEach((resort) => {
      const snowfall = resort.snowfall48hInches ?? resort.predictedSnowfallInches;
      const colorInfo = getSnowfallColor(snowfall);
      const isSelected = selectedResortId === resort.resortId;

      // Create custom DOM element for the pin
      const el = document.createElement("div");
      el.className = "group relative cursor-pointer select-none transition-transform duration-200 hover:scale-125 z-10";
      el.style.width = "40px";
      el.style.height = "40px";

      // Pin badge container
      const badge = document.createElement("div");
      badge.className = `flex flex-col items-center justify-center rounded-full shadow-lg border-2 transition-all ${
        isSelected ? "ring-4 ring-cyan-400 scale-110" : ""
      }`;
      badge.style.backgroundColor = colorInfo.hex;
      badge.style.borderColor = "#ffffff";
      badge.style.width = "38px";
      badge.style.height = "38px";

      // Snow inches text
      const text = document.createElement("span");
      text.className = "text-xs font-black text-white leading-none";
      text.innerText = `${Math.round(snowfall)}"`;

      // Sub label
      const sub = document.createElement("span");
      sub.className = "text-[8px] font-semibold text-white/90 uppercase tracking-tighter leading-none mt-0.5";
      sub.innerText = "48h";

      badge.appendChild(text);
      badge.appendChild(sub);
      el.appendChild(badge);

      // Hover elevation tooltip preview
      el.addEventListener("mouseenter", () => {
        setHoveredResort(resort);
      });
      el.addEventListener("mouseleave", () => {
        setHoveredResort((prev) => (prev?.resortId === resort.resortId ? null : prev));
      });

      // Click opens interactive quick-look card
      el.addEventListener("click", () => {
        setActivePopupResort(resort);
        if (onSelectResort) {
          onSelectResort(resort);
        }
        map.current?.flyTo({
          center: [resort.longitude, resort.latitude],
          zoom: 9.5,
          speed: 1.2,
        });
      });

      const marker = new Marker({ element: el })
        .setLngLat([resort.longitude, resort.latitude])
        .addTo(map.current!);

      markersRef.current[resort.resortId] = marker;
    });
  }, [resorts, selectedResortId, onSelectResort]);

  return (
    <div className="relative w-full h-[520px] rounded-xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
      {/* MapLibre Canvas Container */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Legend Overlay */}
      <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-lg p-3 text-xs shadow-xl pointer-events-auto">
        <div className="font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
          <Snowflake className="w-4 h-4 text-cyan-400" />
          <span>48h Snowfall Forecast</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-[#64748b] border border-slate-400 inline-block" />
            <span className="text-slate-300">&lt; 2&quot; (Dusting / Trace)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-[#38bdf8] border border-white inline-block" />
            <span className="text-slate-300">2 – 6&quot; (Fresh Cover)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-[#2563eb] border border-white inline-block" />
            <span className="text-slate-300">6 – 12&quot; (Powder Day)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-[#7e22ce] border border-white inline-block" />
            <span className="text-slate-300">12&quot;+ (Deep Storm Dump)</span>
          </div>
        </div>
      </div>

      {/* Hover Elevation Range Tooltip */}
      {hoveredResort && (
        <div className="absolute bottom-4 left-4 z-20 bg-slate-900/95 backdrop-blur-md border border-cyan-500/50 rounded-lg px-4 py-2.5 text-xs shadow-xl transition-all animate-fadeIn">
          <div className="flex items-center gap-2 mb-1">
            <Mountain className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-slate-100 text-sm">{hoveredResort.name}</span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded uppercase font-semibold">
              {hoveredResort.region}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-slate-300 pt-1 border-t border-slate-800">
            <div>
              <span className="text-slate-400 block text-[10px]">Summit</span>
              <span className="font-mono font-semibold text-slate-100">{hoveredResort.summitFt.toLocaleString()}&apos;</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Base</span>
              <span className="font-mono font-semibold text-slate-100">{hoveredResort.baseFt.toLocaleString()}&apos;</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Vertical</span>
              <span className="font-mono font-semibold text-emerald-400">+{hoveredResort.verticalFt.toLocaleString()}&apos;</span>
            </div>
          </div>
        </div>
      )}

      {/* Quick-Look Card (Clicked Pin) */}
      {activePopupResort && (
        <div className="absolute bottom-4 right-4 z-20 w-80 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100 text-base">{activePopupResort.name}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 font-semibold text-slate-300">
                  {activePopupResort.passType}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {activePopupResort.region} • {activePopupResort.skiableAcres} Acres
              </p>
            </div>
            <button
              onClick={() => setActivePopupResort(null)}
              className="text-slate-400 hover:text-white text-lg font-bold p-1 leading-none cursor-pointer"
            >
              ×
            </button>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 my-3">
            <div className="bg-slate-800/80 rounded-lg p-2.5">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Powder Score</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-2xl font-black text-cyan-400">{activePopupResort.powderScore}</span>
                <span className="text-[10px] text-slate-400">/ 100</span>
              </div>
              <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded mt-1 font-bold ${getPowderScoreBadge(activePopupResort.powderScore).bg}`}>
                {getPowderScoreBadge(activePopupResort.powderScore).label}
              </span>
            </div>

            <div className="bg-slate-800/80 rounded-lg p-2.5">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">48h Snowfall</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-black text-purple-400">
                  {activePopupResort.snowfall48hInches ?? activePopupResort.predictedSnowfallInches}&quot;
                </span>
                <span className="text-[10px] text-slate-400 font-mono">SLR {activePopupResort.snowToLiquidRatio}:1</span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">
                Freeze: {activePopupResort.freezingLevelElevationFt.toLocaleString()}&apos;
              </span>
            </div>
          </div>

          {/* Badges / Warnings */}
          <div className="space-y-1.5 text-xs pt-1">
            {activePopupResort.windHoldWarning && (
              <div className="flex items-center gap-1.5 text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded px-2 py-1">
                <Wind className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold text-[11px]">Wind Hold Risk on Summit Lifts</span>
              </div>
            )}

            {activePopupResort.crustRisk && (
              <div className="flex items-center gap-1.5 text-rose-400 bg-rose-950/40 border border-rose-800/50 rounded px-2 py-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold text-[11px]">Rain / Refreeze Crust Warning</span>
              </div>
            )}

            {activePopupResort.gladesRecommended && (
              <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 rounded px-2 py-1">
                <Compass className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold text-[11px]">Protected Leeward Glades Primed</span>
              </div>
            )}

            {activePopupResort.distanceMiles && (
              <div className="flex justify-between items-center text-slate-400 text-[11px] pt-1">
                <span>Drive from origin:</span>
                <span className="font-mono font-semibold text-slate-200">
                  {activePopupResort.driveTimeEstimate} ({activePopupResort.distanceMiles} mi)
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

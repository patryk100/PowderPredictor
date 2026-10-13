"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Map, NavigationControl, Marker } from "maplibre-gl";
import { ResortForecast } from "@/types/resort";
import { getSnowfallColor } from "@/lib/geo";
import { Mountain, Snowflake, Maximize2 } from "lucide-react";

interface ResortMapProps {
  resorts: ResortForecast[];
  selectedResortId?: string | null;
  onSelectResort?: (resort: ResortForecast) => void;
  hourOffset?: number;
}

// 100% Free, Public Domain / No API Key Required
const MAP_STYLES: Record<string, any> = {
  dark: {
    version: 8,
    sources: {
      "esri-dark-base": {
        type: "raster",
        tiles: [
          "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Esri, DeLorme, NAVTEQ",
      },
      "esri-dark-labels": {
        type: "raster",
        tiles: [
          "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
      },
    },
    layers: [
      {
        id: "dark-base-layer",
        type: "raster",
        source: "esri-dark-base",
        minzoom: 0,
        maxzoom: 19,
      },
      {
        id: "dark-labels-layer",
        type: "raster",
        source: "esri-dark-labels",
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  },
  topo: {
    version: 8,
    sources: {
      "usgs-topo": {
        type: "raster",
        tiles: [
          "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "USGS The National Map",
      },
    },
    layers: [
      {
        id: "topo-layer",
        type: "raster",
        source: "usgs-topo",
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  },
  satellite: {
    version: 8,
    sources: {
      "esri-imagery": {
        type: "raster",
        tiles: [
          "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Esri, Maxar, Earthstar Geographics",
      },
      "esri-imagery-labels": {
        type: "raster",
        tiles: [
          "https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
      },
    },
    layers: [
      {
        id: "satellite-layer",
        type: "raster",
        source: "esri-imagery",
        minzoom: 0,
        maxzoom: 19,
      },
      {
        id: "satellite-labels-layer",
        type: "raster",
        source: "esri-imagery-labels",
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  },
};

export const ResortMap: React.FC<ResortMapProps> = ({
  resorts,
  selectedResortId,
  onSelectResort,
  hourOffset = 0,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const [mapLoaded, setMapLoaded] = useState(false);
  const [activeBaseLayer, setActiveBaseLayer] = useState<"dark" | "topo" | "satellite">("dark");
  const [hoveredResort, setHoveredResort] = useState<ResortForecast | null>(null);

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new Map({
      container: mapContainer.current,
      style: MAP_STYLES.dark,
      center: [-72.5, 43.8],
      zoom: 6.8,
      minZoom: 5.5,
      maxZoom: 14,
      maxBounds: [
        [-76.5, 40.0],
        [-66.5, 47.5],
      ],
      attributionControl: false,
    });

    map.current.addControl(new NavigationControl({ showCompass: true }), "top-right");

    map.current.on("load", () => {
      setMapLoaded(true);
      map.current?.resize();
    });

    const handleResize = () => {
      map.current?.resize();
    };
    window.addEventListener("resize", handleResize);

    const timer1 = setTimeout(() => map.current?.resize(), 200);
    const timer2 = setTimeout(() => map.current?.resize(), 800);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener("resize", handleResize);
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Handle Base Layer Switching
  const handleLayerSwitch = useCallback(
    (styleKey: "dark" | "topo" | "satellite") => {
      if (!map.current || activeBaseLayer === styleKey) return;
      setActiveBaseLayer(styleKey);
      map.current.setStyle(MAP_STYLES[styleKey]);
    },
    [activeBaseLayer]
  );

  // Fly-to animation on mountain selection
  useEffect(() => {
    if (!map.current || !selectedResortId || !mapLoaded) return;
    const target = resorts.find((r) => r.resortId === selectedResortId);
    if (target) {
      map.current.flyTo({
        center: [target.longitude, target.latitude],
        zoom: Math.max(map.current.getZoom(), 9.2),
        speed: 1.2,
        curve: 1.4,
        essential: true,
      });
    }
  }, [selectedResortId, resorts, mapLoaded]);

  // Render Custom SVG Markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    resorts.forEach((resort) => {
      let snowfall = resort.snowfall48hInches ?? resort.predictedSnowfallInches;
      if (hourOffset > 0 && resort.hourlySeries) {
        const step = resort.hourlySeries.find((s) => s.hourOffset === hourOffset);
        if (step) {
          snowfall = step.cumulativeSnowInches;
        }
      }

      const colorInfo = getSnowfallColor(snowfall);
      const isSelected = selectedResortId === resort.resortId;

      const el = document.createElement("div");
      el.className = "group relative cursor-pointer select-none transition-transform duration-200 transform -translate-x-1/2 -translate-y-1/2";
      el.style.width = isSelected ? "42px" : "34px";
      el.style.height = isSelected ? "42px" : "34px";

      el.innerHTML = `
        <div class="relative w-full h-full rounded-full flex flex-col items-center justify-center transition-all duration-200 border ${
          isSelected
            ? "border-white ring-2 ring-white/30 scale-110 shadow-lg"
            : "border-white/30 hover:scale-115 hover:border-white/80"
        }" style="background: radial-gradient(circle at 35% 35%, ${colorInfo.hex}, #0b0c0f 160%); box-shadow: 0 4px 14px rgba(0,0,0,0.5);">
          <div class="flex items-center leading-none">
            <span class="text-[11px] font-medium text-white font-mono tracking-tight">${Math.round(snowfall)}"</span>
          </div>
        </div>
      `;

      el.addEventListener("mouseenter", () => {
        setHoveredResort(resort);
      });
      el.addEventListener("mouseleave", () => {
        setHoveredResort((prev) => (prev?.resortId === resort.resortId ? null : prev));
      });

      el.addEventListener("click", () => {
        if (onSelectResort) {
          onSelectResort(resort);
        }
      });

      const marker = new Marker({ element: el })
        .setLngLat([resort.longitude, resort.latitude])
        .addTo(map.current!);

      markersRef.current[resort.resortId] = marker;
    });
  }, [resorts, selectedResortId, mapLoaded, activeBaseLayer, hourOffset, onSelectResort]);

  const resetView = useCallback(() => {
    map.current?.flyTo({
      center: [-72.5, 43.8],
      zoom: 6.8,
      speed: 1.0,
    });
  }, []);

  return (
    <div className="relative w-full h-full min-h-[480px] rounded-2xl overflow-hidden craft-card group">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Map Controls */}
      <div className="absolute top-4 right-14 z-20 flex items-center gap-2">
        <div className="craft-card p-0.5 rounded-xl flex items-center gap-0.5 text-xs">
          <button
            onClick={() => handleLayerSwitch("dark")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeBaseLayer === "dark"
                ? "bg-white text-[#0b0c0f] shadow-sm"
                : "text-stone-400 hover:text-white"
            }`}
          >
            Dark
          </button>
          <button
            onClick={() => handleLayerSwitch("topo")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeBaseLayer === "topo"
                ? "bg-white text-[#0b0c0f] shadow-sm"
                : "text-stone-400 hover:text-white"
            }`}
          >
            Topo
          </button>
          <button
            onClick={() => handleLayerSwitch("satellite")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeBaseLayer === "satellite"
                ? "bg-white text-[#0b0c0f] shadow-sm"
                : "text-stone-400 hover:text-white"
            }`}
          >
            Satellite
          </button>
        </div>

        <button
          onClick={resetView}
          title="Reset Northeast View"
          className="craft-card hover:bg-white/[0.08] text-stone-300 hover:text-white p-1.5 rounded-xl text-xs flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5 text-stone-400" />
          <span className="font-medium hidden sm:inline text-xs">Fit</span>
        </button>
      </div>

      {/* Legend Overlay */}
      <div className="absolute top-4 left-4 z-20 craft-card rounded-xl p-3 text-xs pointer-events-auto">
        <div className="font-medium text-stone-300 mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
          <Snowflake className="w-3.5 h-3.5 text-stone-400" />
          <span>{hourOffset > 0 ? `+${hourOffset}h Total` : "48h Snow Total"}</span>
        </div>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#2d3039] border border-white/20 inline-block" />
            <span className="text-stone-400">&lt; 2&quot; Dusting</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#0369a1] border border-white/20 inline-block" />
            <span className="text-stone-300">2 – 6&quot; Cover</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#1d4ed8] border border-white/20 inline-block" />
            <span className="text-stone-300">6 – 12&quot; Powder</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#4f46e5] border border-white/20 inline-block" />
            <span className="text-stone-200">12&quot;+ Storm</span>
          </div>
        </div>
      </div>

      {/* Hover Tooltip */}
      {hoveredResort && (
        <div className="absolute bottom-4 left-4 z-20 craft-card rounded-xl px-4 py-3 text-xs transition-all pointer-events-none">
          <div className="flex items-center gap-2 mb-1.5">
            <Mountain className="w-3.5 h-3.5 text-stone-400" />
            <span className="font-medium text-white text-sm">{hoveredResort.name}</span>
            <span className="text-[10px] bg-white/[0.06] text-stone-300 px-2 py-0.5 rounded-full uppercase font-mono">
              {hoveredResort.region} • {hoveredResort.passType}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-stone-300 pt-1.5 border-t hairline-border text-[11px]">
            <div>
              <span className="text-stone-500 block text-[10px] uppercase font-medium">Summit</span>
              <span className="font-mono text-stone-200">{hoveredResort.summitFt.toLocaleString()}&apos;</span>
            </div>
            <div>
              <span className="text-stone-500 block text-[10px] uppercase font-medium">Base</span>
              <span className="font-mono text-stone-200">{hoveredResort.baseFt.toLocaleString()}&apos;</span>
            </div>
            <div>
              <span className="text-stone-500 block text-[10px] uppercase font-medium">Vertical</span>
              <span className="font-mono text-white">+{hoveredResort.verticalFt.toLocaleString()}&apos;</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

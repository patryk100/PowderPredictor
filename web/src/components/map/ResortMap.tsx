"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Map, NavigationControl, Marker } from "maplibre-gl";
import { ResortForecast } from "@/types/resort";
import { getSnowfallColor } from "@/lib/geo";
import { Mountain, Snowflake, Maximize2, Layers } from "lucide-react";

interface ResortMapProps {
  resorts: ResortForecast[];
  selectedResortId?: string | null;
  onSelectResort?: (resort: ResortForecast) => void;
}

// Tile Styles (100% Free, Public Domain / No API Key Required)
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
}) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<Map | null>(null);
  const markersRef = useRef<{ [id: string]: Marker }>({});

  const [hoveredResort, setHoveredResort] = useState<ResortForecast | null>(null);
  const [activeBaseLayer, setActiveBaseLayer] = useState<"dark" | "topo" | "satellite">("dark");
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const mapInstance = new Map({
      container: mapContainer.current,
      style: MAP_STYLES.dark,
      center: [-72.5, 43.8],
      zoom: 6.8,
      minZoom: 5.2,
      maxZoom: 14,
      maxBounds: [
        [-76.8, 39.8], // Southwest bounds (PA/NY/NJ border)
        [-66.2, 47.6], // Northeast bounds (Northern Maine / Canada)
      ],
      attributionControl: false,
    });

    mapInstance.addControl(new NavigationControl({ showCompass: true }), "top-right");

    mapInstance.on("load", () => {
      setMapLoaded(true);
      mapInstance.resize();
    });

    // Ensure resizing once DOM settles
    setTimeout(() => {
      mapInstance.resize();
    }, 150);

    map.current = mapInstance;

    const resizeObserver = new ResizeObserver(() => {
      mapInstance.resize();
    });
    if (mapContainer.current) {
      resizeObserver.observe(mapContainer.current);
    }

    return () => {
      resizeObserver.disconnect();
      mapInstance.remove();
      map.current = null;
    };
  }, []);

  // Switch Base Layer
  const handleLayerSwitch = (layerKey: "dark" | "topo" | "satellite") => {
    setActiveBaseLayer(layerKey);
    if (map.current) {
      map.current.setStyle(MAP_STYLES[layerKey]);
    }
  };

  // Center/Fly to selected resort smoothly
  useEffect(() => {
    if (!map.current || !selectedResortId) return;
    const target = resorts.find((r) => r.resortId === selectedResortId);
    if (target) {
      map.current.flyTo({
        center: [target.longitude, target.latitude],
        zoom: Math.max(map.current.getZoom(), 8.8),
        speed: 1.2,
        curve: 1.4,
        essential: true,
      });
    }
  }, [selectedResortId, resorts]);

  // Render Modern SVG Markers
  useEffect(() => {
    if (!map.current) return;

    // Clear old markers
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    resorts.forEach((resort) => {
      const snowfall = resort.snowfall48hInches ?? resort.predictedSnowfallInches;
      const colorInfo = getSnowfallColor(snowfall);
      const isSelected = selectedResortId === resort.resortId;

      // Outer wrapper
      const el = document.createElement("div");
      el.className = "group relative cursor-pointer select-none transition-all duration-300 transform -translate-x-1/2 -translate-y-1/2";
      el.style.width = isSelected ? "46px" : "38px";
      el.style.height = isSelected ? "46px" : "38px";

      // Pulsing glow ring when selected or when heavy powder (>12")
      const haloClass = isSelected
        ? "absolute -inset-1 rounded-full bg-cyan-400/50 animate-ping"
        : snowfall >= 12
        ? "absolute -inset-1 rounded-full bg-purple-500/40 animate-pulse"
        : "hidden";

      // SVG Badge Structure
      el.innerHTML = `
        <div class="${haloClass}"></div>
        <div class="relative w-full h-full rounded-2xl flex flex-col items-center justify-center shadow-2xl transition-all duration-200 border-2 ${
          isSelected
            ? "border-cyan-300 ring-4 ring-cyan-500/50 scale-110 shadow-cyan-500/50"
            : "border-white/90 hover:scale-125 hover:border-cyan-300"
        }" style="background: radial-gradient(circle at 30% 30%, ${colorInfo.hex}, #090d16 140%);">
          <div class="flex items-center gap-0.5 leading-none">
            <span class="text-xs font-black text-white font-mono tracking-tight drop-shadow">${Math.round(snowfall)}"</span>
          </div>
          <span class="text-[8px] font-bold text-white/90 uppercase tracking-tighter leading-none mt-0.5">48h</span>
        </div>
      `;

      // Hover elevation preview
      el.addEventListener("mouseenter", () => {
        setHoveredResort(resort);
      });
      el.addEventListener("mouseleave", () => {
        setHoveredResort((prev) => (prev?.resortId === resort.resortId ? null : prev));
      });

      // Click selection
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
  }, [resorts, selectedResortId, mapLoaded, activeBaseLayer, onSelectResort]);

  const resetView = useCallback(() => {
    map.current?.flyTo({
      center: [-72.5, 43.8],
      zoom: 6.8,
      speed: 1.0,
    });
  }, []);

  return (
    <div className="relative w-full h-[540px] rounded-2xl overflow-hidden border border-slate-800/80 shadow-2xl bg-[#090d16] group">
      {/* MapLibre WebGL Canvas Container */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Map Controls: Layer Switcher & Reset Zoom */}
      <div className="absolute top-4 right-14 z-20 flex items-center gap-2">
        {/* Layer Selector Chips */}
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 flex items-center gap-1 shadow-xl text-xs">
          <button
            onClick={() => handleLayerSwitch("dark")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              activeBaseLayer === "dark"
                ? "bg-cyan-500 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Dark
          </button>
          <button
            onClick={() => handleLayerSwitch("topo")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              activeBaseLayer === "topo"
                ? "bg-cyan-500 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            USGS Topo
          </button>
          <button
            onClick={() => handleLayerSwitch("satellite")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              activeBaseLayer === "satellite"
                ? "bg-cyan-500 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Satellite
          </button>
        </div>

        {/* Reset View Button */}
        <button
          onClick={resetView}
          title="Reset Northeast View"
          className="bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white p-2 rounded-xl border border-slate-700/80 backdrop-blur-md shadow-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold hidden sm:inline">Fit</span>
        </button>
      </div>

      {/* Legend Overlay */}
      <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-3 text-xs shadow-2xl pointer-events-auto">
        <div className="font-bold text-slate-200 mb-2 flex items-center gap-1.5">
          <Snowflake className="w-4 h-4 text-cyan-400" />
          <span>48h Snow Accumulation</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-md bg-[#64748b] border border-slate-400 inline-block shadow-sm" />
            <span className="text-slate-300">&lt; 2&quot; (Dusting / Flurries)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-md bg-[#38bdf8] border border-white inline-block shadow-sm" />
            <span className="text-slate-300">2 – 6&quot; (Fresh Cover)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-md bg-[#2563eb] border border-white inline-block shadow-sm" />
            <span className="text-slate-300">6 – 12&quot; (Powder Day)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-md bg-[#7e22ce] border border-white inline-block shadow-sm" />
            <span className="text-slate-300 font-semibold text-purple-300">12&quot;+ (Deep Storm Cycle)</span>
          </div>
        </div>
      </div>

      {/* Floating Hover Elevation Range Tooltip */}
      {hoveredResort && (
        <div className="absolute bottom-4 left-4 z-20 bg-slate-900/95 backdrop-blur-xl border border-cyan-500/60 rounded-xl px-4 py-3 text-xs shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-2 pointer-events-none">
          <div className="flex items-center gap-2 mb-1.5">
            <Mountain className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-white text-sm">{hoveredResort.name}</span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md uppercase font-bold tracking-wider">
              {hoveredResort.region} • {hoveredResort.passType}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-slate-300 pt-1.5 border-t border-slate-800/80">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Summit</span>
              <span className="font-mono font-bold text-slate-100">{hoveredResort.summitFt.toLocaleString()}&apos;</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Base</span>
              <span className="font-mono font-bold text-slate-100">{hoveredResort.baseFt.toLocaleString()}&apos;</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Vertical</span>
              <span className="font-mono font-black text-emerald-400">+{hoveredResort.verticalFt.toLocaleString()}&apos;</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

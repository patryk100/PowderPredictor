"use client";

import React, { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import { ResortForecast, PersonaPreset } from "@/types/resort";
import { getPowderScoreBadge, getSnowfallColor } from "@/lib/geo";
import {
  ArrowUpDown,
  LayoutGrid,
  List,
  Wind,
  AlertTriangle,
  Compass,
  Clock,
  Mountain,
  Search,
} from "lucide-react";

interface ResortMatrixProps {
  resorts: ResortForecast[];
  selectedResortId?: string | null;
  onSelectResort?: (resort: ResortForecast) => void;
  selectedPersona?: PersonaPreset;
  selectedPasses?: string[];
  hourOffset?: number;
}

export const ResortMatrix: React.FC<ResortMatrixProps> = ({
  resorts,
  selectedResortId,
  onSelectResort,
  selectedPersona = "all",
  selectedPasses = [],
  hourOffset = 0,
}) => {
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "powderScore", desc: true },
  ]);
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Filter items based on Persona Presets & Pass Multi-Select
  const filteredData = useMemo(() => {
    return resorts.filter((r) => {
      if (regionFilter !== "ALL" && r.region !== regionFilter) return false;

      // Pass Multi-Select
      if (selectedPasses.length > 0 && !selectedPasses.includes(r.passType)) {
        return false;
      }

      // Search Query
      if (
        searchQuery &&
        !r.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !r.region.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }

      // Persona Filters
      if (selectedPersona === "glade_hunter") {
        if (r.powderScore < 80 || r.snowToLiquidRatio < 14.0 || r.baseDepthInches < 24) {
          return false;
        }
      } else if (selectedPersona === "wind_avoider") {
        if (r.windHoldWarning || (r.windAnalysis?.gustMph ?? 0) > 35) {
          return false;
        }
      } else if (selectedPersona === "bluebird_cruiser") {
        if ((r.windAnalysis?.speedMph ?? 0) >= 15 || r.crustRisk) {
          return false;
        }
      }

      return true;
    });
  }, [resorts, regionFilter, selectedPasses, searchQuery, selectedPersona]);

  // Define Table Columns with NerdFont & Dev Typography
  const columns = useMemo<ColumnDef<ResortForecast>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1.5 font-mono text-stone-400 hover:text-white cursor-pointer uppercase text-[11px] tracking-wider"
          >
            <span>[λ_summit]</span>
            <span className="font-sans font-medium text-stone-300">Mountain &amp; Region</span>
            <ArrowUpDown className="w-3 h-3 text-stone-500" />
          </button>
        ),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div>
              <div className="font-medium text-[#f4f3ef] flex items-center gap-2">
                <span>{r.name}</span>
                {r.windHoldWarning && (
                  <span title="Summit Wind Hold Advisory">
                    <Wind className="w-3.5 h-3.5 text-amber-400 inline" />
                  </span>
                )}
                {r.crustRisk && (
                  <span title="Liquid Precipitation / Crust Risk">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 inline" />
                  </span>
                )}
                {r.gladesRecommended && (
                  <span title="Protected Glade Terrain Primed">
                    <Compass className="w-3.5 h-3.5 text-emerald-400 inline" />
                  </span>
                )}
              </div>
              <div className="text-[11px] text-stone-400 flex items-center gap-1.5 mt-0.5 font-mono">
                <span className="text-sky-300 font-semibold">{r.region}</span>
                <span>•</span>
                <span className="text-stone-300">{r.passType}</span>
                <span>•</span>
                <span>{r.verticalFt.toLocaleString()}&apos; vert</span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "powderScore",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1.5 font-mono text-stone-400 hover:text-white cursor-pointer uppercase text-[11px] tracking-wider"
          >
            <span>[⌥_score]</span>
            <span className="font-sans font-medium text-stone-300">Score</span>
            <ArrowUpDown className="w-3 h-3 text-stone-500" />
          </button>
        ),
        cell: ({ getValue }) => {
          const score = getValue<number>();
          const badge = getPowderScoreBadge(score);
          return (
            <div className="flex items-center gap-2">
              <span className="text-base font-bold font-mono text-white w-7 text-right">
                {score}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${badge.bg}`}>
                {badge.label}
              </span>
            </div>
          );
        },
      },
      {
        id: "snowAccum",
        accessorFn: (row) => {
          if (hourOffset > 0 && row.hourlySeries) {
            const step = row.hourlySeries.find((s) => s.hourOffset === hourOffset);
            if (step) return step.cumulativeSnowInches;
          }
          return row.snowfall48hInches ?? row.predictedSnowfallInches;
        },
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1.5 font-mono text-stone-400 hover:text-white cursor-pointer uppercase text-[11px] tracking-wider"
          >
            <span>[⌘_snow]</span>
            <span className="font-sans font-medium text-stone-300">{hourOffset > 0 ? `+${hourOffset}h` : "48h Total"}</span>
            <ArrowUpDown className="w-3 h-3 text-stone-500" />
          </button>
        ),
        cell: ({ getValue, row }) => {
          const snow = getValue<number>();
          const colorInfo = getSnowfallColor(snow);
          return (
            <div>
              <span
                className="inline-block px-2.5 py-0.5 rounded-md text-xs font-bold font-mono text-white shadow-sm"
                style={{ backgroundColor: colorInfo.hex }}
              >
                {snow}&quot;
              </span>
              <div className="text-[10px] text-stone-400 mt-0.5 font-mono">
                24h: <span className="text-stone-200">{row.original.snowfall24hInches}&quot;</span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "snowToLiquidRatio",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1.5 font-mono text-stone-400 hover:text-white cursor-pointer uppercase text-[11px] tracking-wider"
          >
            <span>[❄_slr]</span>
            <span className="font-sans font-medium text-stone-300">Density</span>
            <ArrowUpDown className="w-3 h-3 text-stone-500" />
          </button>
        ),
        cell: ({ getValue }) => {
          const slr = getValue<number>();
          const isBlower = slr >= 15.0;
          return (
            <div>
              <span className={`font-mono font-semibold text-xs ${isBlower ? "text-purple-300" : "text-sky-300"}`}>
                {slr.toFixed(1)}:1
              </span>
              <span className="block text-[10px] text-stone-400 font-mono">
                {isBlower ? "Dendritic" : slr < 8.0 ? "Wet/Rain" : "Standard"}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "distanceMiles",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1.5 font-mono text-stone-400 hover:text-white cursor-pointer uppercase text-[11px] tracking-wider"
          >
            <span>[⚡_transit]</span>
            <span className="font-sans font-medium text-stone-300">Drive Time</span>
            <ArrowUpDown className="w-3 h-3 text-stone-500" />
          </button>
        ),
        cell: ({ row }) => {
          const r = row.original;
          if (!r.distanceMiles) return <span className="text-stone-600 font-mono">-</span>;
          return (
            <div className="text-xs">
              <div className="font-mono font-semibold text-stone-100 flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-sky-400" />
                <span>{r.driveTimeEstimate}</span>
              </div>
              <span className="text-[10px] text-stone-400 font-mono">{r.distanceMiles} mi</span>
            </div>
          );
        },
      },
    ],
    [hourOffset]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="w-full space-y-3.5">
      {/* Control Bar: Filters, Region Tabs, Search, and View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 craft-card p-3 rounded-2xl">
        {/* Search & Region Tabs */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search summit or region..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-3 py-1.5 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-400/50 w-52 transition-colors font-mono"
            />
          </div>

          {/* Region Tabs */}
          <div className="flex items-center bg-white/[0.03] p-0.5 rounded-xl border border-white/[0.06] text-xs font-mono">
            {["ALL", "VT", "NH", "ME", "NY", "MA"].map((reg) => (
              <button
                key={reg}
                onClick={() => setRegionFilter(reg)}
                className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 ${
                  regionFilter === reg
                    ? "bg-gradient-to-r from-sky-500/90 to-indigo-600/90 text-white font-bold shadow-md shadow-sky-500/20"
                    : "text-stone-400 hover:text-stone-200"
                }`}
              >
                {reg}
              </button>
            ))}
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-white/[0.03] p-0.5 rounded-xl border border-white/[0.06]">
          <button
            onClick={() => setViewMode("table")}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              viewMode === "table"
                ? "bg-white/[0.12] text-white"
                : "text-stone-400 hover:text-stone-200"
            }`}
            title="Table View"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              viewMode === "grid"
                ? "bg-white/[0.12] text-white"
                : "text-stone-400 hover:text-stone-200"
            }`}
            title="Card Grid View"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Table View */}
      {viewMode === "table" ? (
        <div className="overflow-x-auto rounded-2xl craft-card">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b hairline-border bg-white/[0.02]">
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-5 py-3.5 font-medium text-stone-400">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-12 text-center text-stone-500 text-xs font-mono">
                    [!] No summits match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const isSelected = selectedResortId === row.original.resortId;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => onSelectResort && onSelectResort(row.original)}
                      className={`group hover:bg-white/[0.03] transition-colors cursor-pointer ${
                        isSelected ? "bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-transparent border-l-2 border-sky-400" : ""
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-5 py-3.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Card Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredData.length === 0 ? (
            <div className="col-span-full text-center py-12 text-stone-500 text-xs font-mono">
              [!] No summits match the selected filter criteria.
            </div>
          ) : (
            filteredData.map((resort) => {
              const snowfall =
                hourOffset > 0 && resort.hourlySeries
                  ? resort.hourlySeries.find((s) => s.hourOffset === hourOffset)?.cumulativeSnowInches ?? resort.predictedSnowfallInches
                  : resort.snowfall48hInches ?? resort.predictedSnowfallInches;

              const scoreBadge = getPowderScoreBadge(resort.powderScore);
              const isSelected = selectedResortId === resort.resortId;

              return (
                <div
                  key={resort.resortId}
                  onClick={() => onSelectResort && onSelectResort(resort)}
                  className={`craft-card rounded-2xl p-4.5 transition-all duration-200 cursor-pointer ${
                    isSelected ? "border-sky-400/50 bg-sky-950/20 shadow-lg shadow-sky-500/10" : ""
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-semibold text-[#f4f3ef] text-sm tracking-tight">{resort.name}</h4>
                      <p className="text-[11px] text-stone-400 mt-0.5 font-mono">
                        <span className="text-sky-300 font-semibold">{resort.region}</span> • {resort.passType} Pass
                      </p>
                    </div>
                    <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${scoreBadge.bg}`}>
                      {scoreBadge.label}
                    </span>
                  </div>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-2 gap-2 my-3">
                    <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/[0.05]">
                      <span className="text-[10px] text-stone-400 block font-mono uppercase tracking-wider">[Score]</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-bold text-white font-mono">{resort.powderScore}</span>
                        <span className="text-[10px] text-stone-500 font-mono">/100</span>
                      </div>
                    </div>

                    <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/[0.05]">
                      <span className="text-[10px] text-stone-400 block font-mono uppercase tracking-wider">
                        {hourOffset > 0 ? `+${hourOffset}h Snow` : "48h Total"}
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-bold text-white font-mono">{snowfall}&quot;</span>
                        <span className="text-[10px] text-stone-400 font-mono">SLR {resort.snowToLiquidRatio}:1</span>
                      </div>
                    </div>
                  </div>

                  {/* Drive Time & SNOTEL Depth */}
                  <div className="text-xs text-stone-400 space-y-1.5 pt-2 border-t hairline-border">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="flex items-center gap-1.5 font-mono text-stone-400">
                        <Clock className="w-3 h-3 text-sky-400" />
                        <span>Transit:</span>
                      </span>
                      <span className="font-mono text-stone-200 font-medium">
                        {resort.driveTimeEstimate ?? "-"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="flex items-center gap-1.5 font-mono text-stone-400">
                        <Mountain className="w-3 h-3 text-indigo-400" />
                        <span>Vertical:</span>
                      </span>
                      <span className="font-mono text-stone-300">
                        +{resort.verticalFt.toLocaleString()}&apos;
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

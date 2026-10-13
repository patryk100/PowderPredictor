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
        const hasSnow = (r.snowfall48hInches ?? r.predictedSnowfallInches) >= 2.0 || r.baseDepthInches >= 12 || r.powderScore >= 40;
        if (r.windHoldWarning || (r.windAnalysis?.gustMph ?? 0) > 35 || !hasSnow) {
          return false;
        }
      } else if (selectedPersona === "bluebird_cruiser") {
        const hasBase = r.baseDepthInches >= 12 || r.powderScore >= 40 || (r.snowfall48hInches ?? r.predictedSnowfallInches) >= 1.0;
        if ((r.windAnalysis?.speedMph ?? 0) >= 15 || r.crustRisk || !hasBase) {
          return false;
        }
      }

      return true;
    });
  }, [resorts, regionFilter, selectedPasses, searchQuery, selectedPersona]);

  // Define Table Columns with Clean Headings and Enriched Typography
  const columns = useMemo<ColumnDef<ResortForecast>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1.5 font-semibold text-stone-300 hover:text-white cursor-pointer uppercase text-xs tracking-wider"
          >
            <span>Mountain &amp; Region</span>
            <ArrowUpDown className="w-3.5 h-3.5 text-stone-500" />
          </button>
        ),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="py-1">
              <div className="font-semibold text-base text-[#f4f3ef] flex items-center gap-2">
                <span>{r.name}</span>
                {r.windHoldWarning && (
                  <span title="Summit Wind Hold Advisory">
                    <Wind className="w-4 h-4 text-amber-400 inline" />
                  </span>
                )}
                {r.crustRisk && (
                  <span title="Liquid Precipitation / Crust Risk">
                    <AlertTriangle className="w-4 h-4 text-rose-400 inline" />
                  </span>
                )}
                {r.gladesRecommended && (
                  <span title="Protected Glade Terrain Primed">
                    <Compass className="w-4 h-4 text-emerald-400 inline" />
                  </span>
                )}
              </div>
              <div className="text-xs text-stone-400 flex items-center gap-2 mt-1">
                <span className="text-sky-300 font-semibold font-mono">{r.region}</span>
                <span>•</span>
                <span className="text-stone-300">{r.passType} Pass</span>
                <span>•</span>
                <span className="font-mono">+{r.verticalFt.toLocaleString()}&apos; vertical</span>
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
            className="flex items-center gap-1.5 font-semibold text-stone-300 hover:text-white cursor-pointer uppercase text-xs tracking-wider"
          >
            <span>Powder Score</span>
            <ArrowUpDown className="w-3.5 h-3.5 text-stone-500" />
          </button>
        ),
        cell: ({ getValue }) => {
          const score = getValue<number>();
          const badge = getPowderScoreBadge(score);
          return (
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-bold font-mono text-white w-8 text-right">
                {score}
              </span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${badge.bg}`}>
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
            className="flex items-center gap-1.5 font-semibold text-stone-300 hover:text-white cursor-pointer uppercase text-xs tracking-wider"
          >
            <span>{hourOffset > 0 ? `+${hourOffset}h Snow` : "48h Snowfall"}</span>
            <ArrowUpDown className="w-3.5 h-3.5 text-stone-500" />
          </button>
        ),
        cell: ({ getValue, row }) => {
          const snow = getValue<number>();
          const colorInfo = getSnowfallColor(snow);
          return (
            <div>
              <span
                className="inline-block px-3 py-1 rounded-lg text-sm font-bold font-mono text-white shadow-sm"
                style={{ backgroundColor: colorInfo.hex }}
              >
                {snow}&quot;
              </span>
              <div className="text-xs text-stone-400 mt-1 font-mono">
                24h: <span className="text-stone-200 font-semibold">{row.original.snowfall24hInches}&quot;</span>
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
            className="flex items-center gap-1.5 font-semibold text-stone-300 hover:text-white cursor-pointer uppercase text-xs tracking-wider"
          >
            <span>Density (SLR)</span>
            <ArrowUpDown className="w-3.5 h-3.5 text-stone-500" />
          </button>
        ),
        cell: ({ getValue }) => {
          const slr = getValue<number>();
          const isBlower = slr >= 15.0;
          return (
            <div>
              <span className={`font-mono font-bold text-sm ${isBlower ? "text-purple-300" : "text-sky-300"}`}>
                {slr.toFixed(1)}:1
              </span>
              <span className="block text-xs text-stone-400 font-medium">
                {isBlower ? "Dendritic / Dry" : slr < 8.0 ? "Wet / Heavy" : "Medium Fluff"}
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
            className="flex items-center gap-1.5 font-semibold text-stone-300 hover:text-white cursor-pointer uppercase text-xs tracking-wider"
          >
            <span>Drive Time</span>
            <ArrowUpDown className="w-3.5 h-3.5 text-stone-500" />
          </button>
        ),
        cell: ({ row }) => {
          const r = row.original;
          if (!r.distanceMiles) return <span className="text-stone-600 font-mono text-sm">-</span>;
          return (
            <div className="text-sm">
              <div className="font-mono font-semibold text-stone-100 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>{r.driveTimeEstimate}</span>
              </div>
              <span className="text-xs text-stone-400 font-mono">{r.distanceMiles} miles</span>
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
    <div className="w-full space-y-4">
      {/* Control Bar: Filters, Region Tabs, Search, and View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 craft-card p-4 rounded-2xl">
        {/* Search & Region Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter by mountain name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-3.5 py-2 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-400/50 w-60 transition-colors"
            />
          </div>

          {/* Region Tabs */}
          <div className="flex items-center bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] text-sm">
            {["ALL", "VT", "NH", "ME", "NY", "MA"].map((reg) => (
              <button
                key={reg}
                onClick={() => setRegionFilter(reg)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 ${
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
        <div className="flex items-center bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
          <button
            onClick={() => setViewMode("table")}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              viewMode === "table"
                ? "bg-white/[0.14] text-white"
                : "text-stone-400 hover:text-stone-200"
            }`}
            title="Table View"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              viewMode === "grid"
                ? "bg-white/[0.14] text-white"
                : "text-stone-400 hover:text-stone-200"
            }`}
            title="Card Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table View */}
      {viewMode === "table" ? (
        <div className="overflow-x-auto rounded-3xl craft-card">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b hairline-border bg-white/[0.03]">
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-6 py-4 font-semibold text-stone-300 text-xs">
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
                  <td colSpan={columns.length} className="px-6 py-14 text-center text-stone-400 text-sm">
                    No summits match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const isSelected = selectedResortId === row.original.resortId;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => onSelectResort && onSelectResort(row.original)}
                      className={`group hover:bg-white/[0.035] transition-colors cursor-pointer ${
                        isSelected ? "bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-transparent border-l-2 border-sky-400" : ""
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-6 py-4.5">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredData.length === 0 ? (
            <div className="col-span-full text-center py-14 text-stone-400 text-sm">
              No summits match the selected filter criteria.
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
                  className={`craft-card rounded-3xl p-5 transition-all duration-200 cursor-pointer ${
                    isSelected ? "border-sky-400/50 bg-sky-950/20 shadow-lg shadow-sky-500/10" : ""
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-3.5">
                    <div>
                      <h4 className="font-semibold text-[#f4f3ef] text-base tracking-tight">{resort.name}</h4>
                      <p className="text-xs text-stone-400 mt-1">
                        <span className="text-sky-300 font-semibold">{resort.region}</span> • {resort.passType} Pass
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${scoreBadge.bg}`}>
                      {scoreBadge.label}
                    </span>
                  </div>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-2 gap-2.5 my-3.5">
                    <div className="bg-white/[0.03] p-3 rounded-2xl border border-white/[0.05]">
                      <span className="text-xs text-stone-400 block font-semibold uppercase tracking-wider">Powder Score</span>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-bold text-white font-mono">{resort.powderScore}</span>
                        <span className="text-xs text-stone-500 font-mono">/ 100</span>
                      </div>
                    </div>

                    <div className="bg-white/[0.03] p-3 rounded-2xl border border-white/[0.05]">
                      <span className="text-xs text-stone-400 block font-semibold uppercase tracking-wider">
                        {hourOffset > 0 ? `+${hourOffset}h Snow` : "48h Snow Total"}
                      </span>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-bold text-white font-mono">{snowfall}&quot;</span>
                        <span className="text-xs text-stone-400 font-mono">SLR {resort.snowToLiquidRatio}:1</span>
                      </div>
                    </div>
                  </div>

                  {/* Drive Time & SNOTEL Depth */}
                  <div className="text-sm text-stone-300 space-y-2 pt-3 border-t hairline-border">
                    <div className="flex justify-between items-center text-xs">
                      <span className="flex items-center gap-1.5 text-stone-400 font-medium">
                        <Clock className="w-3.5 h-3.5 text-sky-400" />
                        <span>Transit Time:</span>
                      </span>
                      <span className="font-mono text-stone-200 font-semibold">
                        {resort.driveTimeEstimate ?? "-"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="flex items-center gap-1.5 text-stone-400 font-medium">
                        <Mountain className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Vertical Drop:</span>
                      </span>
                      <span className="font-mono text-stone-300 font-semibold">
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

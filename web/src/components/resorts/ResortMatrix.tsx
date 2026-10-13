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

  // Define Table Columns
  const columns = useMemo<ColumnDef<ResortForecast>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1.5 font-medium text-stone-400 hover:text-white cursor-pointer uppercase text-[11px] tracking-wider"
          >
            Summit &amp; Region
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
                    <Wind className="w-3 h-3 text-amber-300 inline" />
                  </span>
                )}
                {r.crustRisk && (
                  <span title="Liquid Precipitation / Crust Risk">
                    <AlertTriangle className="w-3 h-3 text-stone-400 inline" />
                  </span>
                )}
                {r.gladesRecommended && (
                  <span title="Protected Glade Terrain Primed">
                    <Compass className="w-3 h-3 text-emerald-300 inline" />
                  </span>
                )}
              </div>
              <div className="text-[11px] text-stone-400 flex items-center gap-1.5 mt-0.5">
                <span className="text-stone-300 font-mono">{r.region}</span>
                <span>•</span>
                <span>{r.passType}</span>
                <span>•</span>
                <span className="font-mono">{r.verticalFt.toLocaleString()}&apos; vert</span>
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
            className="flex items-center gap-1.5 font-medium text-stone-400 hover:text-white cursor-pointer uppercase text-[11px] tracking-wider"
          >
            Score
            <ArrowUpDown className="w-3 h-3 text-stone-500" />
          </button>
        ),
        cell: ({ getValue }) => {
          const score = getValue<number>();
          const badge = getPowderScoreBadge(score);
          return (
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold font-mono text-white w-7 text-right">
                {score}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.bg}`}>
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
            className="flex items-center gap-1.5 font-medium text-stone-400 hover:text-white cursor-pointer uppercase text-[11px] tracking-wider"
          >
            {hourOffset > 0 ? `+${hourOffset}h Snow` : "48h Snow"}
            <ArrowUpDown className="w-3 h-3 text-stone-500" />
          </button>
        ),
        cell: ({ getValue, row }) => {
          const snow = getValue<number>();
          const colorInfo = getSnowfallColor(snow);
          return (
            <div>
              <span
                className="inline-block px-2 py-0.5 rounded-md text-xs font-medium font-mono text-white"
                style={{ backgroundColor: colorInfo.hex }}
              >
                {snow}&quot;
              </span>
              <div className="text-[10px] text-stone-500 mt-0.5 font-mono">
                24h: <span className="text-stone-300">{row.original.snowfall24hInches}&quot;</span>
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
            className="flex items-center gap-1.5 font-medium text-stone-400 hover:text-white cursor-pointer uppercase text-[11px] tracking-wider"
          >
            SLR Density
            <ArrowUpDown className="w-3 h-3 text-stone-500" />
          </button>
        ),
        cell: ({ getValue }) => {
          const slr = getValue<number>();
          const isBlower = slr >= 15.0;
          return (
            <div>
              <span className={`font-mono font-medium text-xs ${isBlower ? "text-indigo-300" : "text-stone-300"}`}>
                {slr.toFixed(1)}:1
              </span>
              <span className="block text-[10px] text-stone-500">
                {isBlower ? "Dendritic" : slr < 8.0 ? "Heavy/Rain" : "Standard"}
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
            className="flex items-center gap-1.5 font-medium text-stone-400 hover:text-white cursor-pointer uppercase text-[11px] tracking-wider"
          >
            Drive Time
            <ArrowUpDown className="w-3 h-3 text-stone-500" />
          </button>
        ),
        cell: ({ row }) => {
          const r = row.original;
          if (!r.distanceMiles) return <span className="text-stone-600">-</span>;
          return (
            <div className="text-xs">
              <div className="font-mono font-medium text-stone-200 flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-stone-400" />
                <span>{r.driveTimeEstimate}</span>
              </div>
              <span className="text-[10px] text-stone-500 font-mono">{r.distanceMiles} mi</span>
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
            <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter by mountain..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/[0.03] border border-white/[0.08] rounded-xl pl-8 pr-3 py-1.5 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-white/30 w-48 transition-colors"
            />
          </div>

          {/* Region Tabs */}
          <div className="flex items-center bg-white/[0.03] p-0.5 rounded-xl border border-white/[0.06] text-xs">
            {["ALL", "VT", "NH", "ME", "NY", "MA"].map((reg) => (
              <button
                key={reg}
                onClick={() => setRegionFilter(reg)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 ${
                  regionFilter === reg
                    ? "bg-white text-[#0b0c0f] shadow-sm"
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
                ? "bg-white/[0.1] text-white"
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
                ? "bg-white/[0.1] text-white"
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
                    <th key={header.id} className="px-4 py-3 font-medium text-stone-400">
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
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-stone-500 text-xs">
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
                      className={`group hover:bg-white/[0.025] transition-colors cursor-pointer ${
                        isSelected ? "bg-white/[0.05] border-l-2 border-white/80" : ""
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredData.length === 0 ? (
            <div className="col-span-full text-center py-12 text-stone-500 text-xs">
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
                  className={`craft-card rounded-2xl p-4 transition-all duration-150 cursor-pointer ${
                    isSelected ? "border-white/30 bg-white/[0.06]" : ""
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-medium text-[#f4f3ef] text-sm tracking-tight">{resort.name}</h4>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        {resort.region} • {resort.passType} Pass
                      </p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${scoreBadge.bg}`}>
                      {scoreBadge.label}
                    </span>
                  </div>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-2 gap-2 my-3">
                    <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/[0.05]">
                      <span className="text-[10px] text-stone-400 block font-medium uppercase tracking-wider">Score</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-semibold text-white font-mono">{resort.powderScore}</span>
                        <span className="text-[10px] text-stone-500 font-mono">/ 100</span>
                      </div>
                    </div>

                    <div className="bg-white/[0.03] p-2.5 rounded-xl border border-white/[0.05]">
                      <span className="text-[10px] text-stone-400 block font-medium uppercase tracking-wider">
                        {hourOffset > 0 ? `+${hourOffset}h Snow` : "48h Total"}
                      </span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-semibold text-white font-mono">{snowfall}&quot;</span>
                        <span className="text-[10px] text-stone-500 font-mono">SLR {resort.snowToLiquidRatio}:1</span>
                      </div>
                    </div>
                  </div>

                  {/* Drive Time & SNOTEL Depth */}
                  <div className="text-xs text-stone-400 space-y-1.5 pt-2 border-t hairline-border">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-stone-500" />
                        <span>Transit Time:</span>
                      </span>
                      <span className="font-mono text-stone-200">
                        {resort.driveTimeEstimate ?? "-"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Mountain className="w-3 h-3 text-stone-500" />
                        <span>Vertical Drop:</span>
                      </span>
                      <span className="font-mono text-stone-300">
                        {resort.verticalFt.toLocaleString()}&apos;
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

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
import { ResortForecast } from "@/types/resort";
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
  ChevronRight,
  Sparkles,
} from "lucide-react";

interface ResortMatrixProps {
  resorts: ResortForecast[];
  selectedResortId?: string | null;
  onSelectResort?: (resort: ResortForecast) => void;
  activeQuickFilter?: string;
  onQuickFilterChange?: (filter: string) => void;
}

export const ResortMatrix: React.FC<ResortMatrixProps> = ({
  resorts,
  selectedResortId,
  onSelectResort,
  activeQuickFilter = "all",
  onQuickFilterChange,
}) => {
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "powderScore", desc: true },
  ]);
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [passFilter, setPassFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Filter items including Quick Filter chips
  const filteredData = useMemo(() => {
    return resorts.filter((r) => {
      if (regionFilter !== "ALL" && r.region !== regionFilter) return false;
      if (passFilter !== "ALL" && r.passType !== passFilter) return false;
      if (
        searchQuery &&
        !r.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !r.region.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }

      // Quick-filter chips
      if (activeQuickFilter === "powder" && r.powderScore < 80) return false;
      if (activeQuickFilter === "snow" && (r.snowfall48hInches ?? r.predictedSnowfallInches) < 8)
        return false;
      if (activeQuickFilter === "drive" && (r.distanceMiles ?? 999) > 160) return false; // approx <3h drive
      if (activeQuickFilter === "blower" && r.snowToLiquidRatio < 15.0) return false;

      return true;
    });
  }, [resorts, regionFilter, passFilter, searchQuery, activeQuickFilter]);

  // Define Table Columns
  const columns = useMemo<ColumnDef<ResortForecast>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            Mountain &amp; Region
            <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-slate-500" />
          </button>
        ),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div>
              <div className="font-bold text-white flex items-center gap-2">
                <span className="hover:text-cyan-400 transition-colors">{r.name}</span>
                {r.windHoldWarning && (
                  <span title="Wind Hold Risk on Summit Lifts">
                    <Wind className="w-3.5 h-3.5 text-amber-400 inline" />
                  </span>
                )}
                {r.crustRisk && (
                  <span title="Rain / Crust Warning">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 inline" />
                  </span>
                )}
                {r.gladesRecommended && (
                  <span title="Protected Glades Primed">
                    <Compass className="w-3.5 h-3.5 text-emerald-400 inline" />
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span className="font-bold text-slate-300 font-mono">{r.region}</span>
                <span>•</span>
                <span className="text-slate-300">{r.passType} Pass</span>
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
            className="flex items-center gap-1 font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            Powder Score
            <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-slate-500" />
          </button>
        ),
        cell: ({ getValue }) => {
          const score = getValue<number>();
          const badge = getPowderScoreBadge(score);
          return (
            <div className="flex items-center gap-2">
              <span className="text-xl font-black font-mono text-cyan-400 w-8 text-right">
                {score}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold ${badge.bg}`}>
                {badge.label}
              </span>
            </div>
          );
        },
      },
      {
        id: "snowfall48h",
        accessorFn: (row) => row.snowfall48hInches ?? row.predictedSnowfallInches,
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            48h Storm Snow
            <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-slate-500" />
          </button>
        ),
        cell: ({ getValue, row }) => {
          const snow = getValue<number>();
          const colorInfo = getSnowfallColor(snow);
          return (
            <div>
              <span
                className="inline-block px-2.5 py-0.5 rounded-lg text-xs font-black font-mono text-white shadow-sm"
                style={{ backgroundColor: colorInfo.hex }}
              >
                {snow}&quot;
              </span>
              <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                24h: <span className="text-slate-200 font-bold">{row.original.snowfall24hInches}&quot;</span>
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
            className="flex items-center gap-1 font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            Quality &amp; SLR
            <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-slate-500" />
          </button>
        ),
        cell: ({ getValue }) => {
          const slr = getValue<number>();
          const isBlower = slr >= 15.0;
          const isCement = slr < 10.0;
          return (
            <div>
              <span
                className={`font-mono font-bold text-sm ${
                  isBlower ? "text-purple-400" : isCement ? "text-amber-400" : "text-slate-200"
                }`}
              >
                {slr.toFixed(1)}:1
              </span>
              <span className="block text-[10px] text-slate-400">
                {isBlower ? "Dendritic / Blower" : isCement ? "Dense / Wet" : "Medium Powder"}
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
            className="flex items-center gap-1 font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            Drive Time
            <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-slate-500" />
          </button>
        ),
        cell: ({ row }) => {
          const r = row.original;
          if (!r.distanceMiles) return <span className="text-slate-500">-</span>;
          return (
            <div className="text-xs">
              <div className="font-mono font-bold text-slate-100 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>{r.driveTimeEstimate}</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">{r.distanceMiles} miles</span>
            </div>
          );
        },
      },
      {
        id: "windAndBase",
        header: "Base & Wind Risk",
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-xs">
              <div className="flex items-center gap-1.5">
                <Mountain className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-mono text-slate-200 font-bold">{r.baseDepthInches}&quot; base</span>
              </div>
              <div className="text-[10px] mt-0.5">
                {r.windHoldWarning ? (
                  <span className="text-amber-400 font-semibold flex items-center gap-1">
                    <Wind className="w-3 h-3" /> Summit Wind Hold
                  </span>
                ) : (
                  <span className="text-emerald-400">Lifts Calm</span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "action",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end text-slate-500 group-hover:text-cyan-400">
            <ChevronRight className="w-4 h-4" />
          </div>
        ),
      },
    ],
    []
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
      {/* Control Bar: Filters, Quick Chips, Search, and View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-800/80 backdrop-blur-xl shadow-xl">
        {/* Search & Region Tabs */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search mountain or state..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 w-56 transition-colors shadow-inner"
          />

          {/* Region Tabs */}
          <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
            {["ALL", "VT", "NH", "ME", "NY", "MA"].map((reg) => (
              <button
                key={reg}
                onClick={() => setRegionFilter(reg)}
                className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-all ${
                  regionFilter === reg
                    ? "bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/20"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {reg}
              </button>
            ))}
          </div>

          {/* Pass Type Filter */}
          <select
            value={passFilter}
            onChange={(e) => setPassFilter(e.target.value)}
            className="bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer shadow-inner"
          >
            <option value="ALL">All Passes</option>
            <option value="Ikon">Ikon Pass</option>
            <option value="Epic">Epic Pass</option>
            <option value="Indy">Indy Pass</option>
            <option value="Independent">Independent</option>
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewMode("table")}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              viewMode === "table"
                ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="Table View"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              viewMode === "grid"
                ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="Card Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Filter Chips */}
      {onQuickFilterChange && (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
          <span className="text-slate-400 text-[11px] font-semibold mr-1">Quick Filters:</span>
          {[
            { id: "all", label: "All Mountains" },
            { id: "powder", label: "High Powder Score (≥80)" },
            { id: "snow", label: "Most Snow (≥8\")" },
            { id: "drive", label: "Under 3 Hours Drive" },
            { id: "blower", label: "Blower Powder (SLR ≥15:1)" },
          ].map((chip) => (
            <button
              key={chip.id}
              onClick={() => onQuickFilterChange(chip.id)}
              className={`px-3 py-1.5 rounded-full font-semibold border transition-all cursor-pointer ${
                activeQuickFilter === chip.id
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-sm shadow-cyan-400/20"
                  : "bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950/70 shadow-2xl backdrop-blur-md">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-slate-800/80 bg-slate-900/90 text-xs">
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-5 py-3.5 font-bold text-slate-300">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-850/80">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-12 text-center text-slate-500 text-xs">
                    No resorts match current filter criteria.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const isSelected = selectedResortId === row.original.resortId;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => onSelectResort && onSelectResort(row.original)}
                      className={`group hover:bg-slate-900/60 transition-colors cursor-pointer ${
                        isSelected ? "bg-cyan-950/40 border-l-4 border-cyan-400" : ""
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredData.length === 0 ? (
            <div className="col-span-full text-center py-16 text-slate-500 text-sm">
              No resorts match current filter criteria.
            </div>
          ) : (
            filteredData.map((resort) => {
              const snowfall = resort.snowfall48hInches ?? resort.predictedSnowfallInches;
              const colorInfo = getSnowfallColor(snowfall);
              const scoreBadge = getPowderScoreBadge(resort.powderScore);
              const isSelected = selectedResortId === resort.resortId;

              return (
                <div
                  key={resort.resortId}
                  onClick={() => onSelectResort && onSelectResort(resort)}
                  className={`bg-slate-900/80 border rounded-2xl p-5 transition-all duration-200 cursor-pointer shadow-xl hover:border-cyan-400/80 hover:-translate-y-1 backdrop-blur-md ${
                    isSelected ? "border-cyan-400 ring-2 ring-cyan-500/40" : "border-slate-800"
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-black text-white text-base tracking-tight">{resort.name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {resort.region} • {resort.passType} Pass
                      </p>
                    </div>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-md ${scoreBadge.bg}`}>
                      {scoreBadge.label}
                    </span>
                  </div>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-2 gap-2.5 my-3.5">
                    <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">Powder Score</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-2xl font-black text-cyan-400 font-mono">{resort.powderScore}</span>
                        <span className="text-[10px] text-slate-500 font-mono">/ 100</span>
                      </div>
                    </div>

                    <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">48h Snow Total</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-2xl font-black text-purple-400 font-mono">{snowfall}&quot;</span>
                        <span className="text-[10px] text-slate-400 font-mono">SLR {resort.snowToLiquidRatio}:1</span>
                      </div>
                    </div>
                  </div>

                  {/* Drive Time & SNOTEL Depth */}
                  <div className="text-xs text-slate-400 space-y-1.5 pt-2 border-t border-slate-800/80">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Drive from Origin:</span>
                      </span>
                      <span className="font-mono font-bold text-slate-100">
                        {resort.driveTimeEstimate ?? "-"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Mountain className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Vertical / Base Depth:</span>
                      </span>
                      <span className="font-mono text-slate-200">
                        +{resort.verticalFt}&apos; / {resort.baseDepthInches}&quot;
                      </span>
                    </div>
                  </div>

                  {/* Alert Indicators */}
                  {(resort.windHoldWarning || resort.crustRisk || resort.gladesRecommended) && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap gap-1.5">
                      {resort.windHoldWarning && (
                        <span className="text-[10px] bg-amber-950/60 border border-amber-800/70 text-amber-400 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                          <Wind className="w-3 h-3" /> Wind Hold Risk
                        </span>
                      )}
                      {resort.crustRisk && (
                        <span className="text-[10px] bg-rose-950/60 border border-rose-800/70 text-rose-400 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Crust Risk
                        </span>
                      )}
                      {resort.gladesRecommended && (
                        <span className="text-[10px] bg-emerald-950/60 border border-emerald-800/70 text-emerald-400 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                          <Compass className="w-3 h-3" /> Glades Primed
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

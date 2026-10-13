"use client";

import React from "react";
import { ResortForecast } from "@/types/resort";
import { getPowderScoreBadge } from "@/lib/geo";
import { Compass, ChevronRight } from "lucide-react";

interface RegionalGuideBentoProps {
  resorts: ResortForecast[];
  onSelectResort: (resort: ResortForecast) => void;
  hourOffset?: number;
}

interface RegionGroup {
  id: string;
  name: string;
  subheading: string;
  stateCode: string;
  stateBadgeColor: string;
  resortIds: string[];
  geographyNote: string;
}

const REGION_GROUPS: RegionGroup[] = [
  {
    id: "northern-greens",
    name: "Northern Green Mountains",
    subheading: "Highest snowfall frequency & persistent Canadian cold air pools",
    stateCode: "VT",
    stateBadgeColor: "bg-emerald-950/60 border-emerald-700/60 text-emerald-300",
    resortIds: ["jay-peak", "smugglers-notch", "stowe", "bolton-valley"],
    geographyNote: "Direct exposure to Quebec northwest flow and Lake Champlain orographic enhancement.",
  },
  {
    id: "central-southern-greens",
    name: "Central & Southern Greens",
    subheading: "Extensive trail networks & premier vertical drops",
    stateCode: "VT",
    stateBadgeColor: "bg-emerald-950/60 border-emerald-700/60 text-emerald-300",
    resortIds: ["mad-river-glen", "sugarbush", "killington", "okemo", "stratton", "magic-mountain", "mount-snow"],
    geographyNote: "Diverse ridgeline aspects with steep gladed terrain and high-capacity snowmaking infrastructure.",
  },
  {
    id: "white-mountains",
    name: "White Mountains",
    subheading: "High alpine summit ridges & Presidential Range microclimates",
    stateCode: "NH",
    stateBadgeColor: "bg-sky-950/60 border-sky-700/60 text-sky-300",
    resortIds: ["wildcat", "cannon-mountain", "bretton-woods", "loon-mountain", "waterville-valley", "attitash"],
    geographyNote: "Steep ravine topography with extreme summit winds and rapid cold-front drops.",
  },
  {
    id: "maine-ranges",
    name: "Maine High Peaks",
    subheading: "Vast wilderness acreage & northern storm tracks",
    stateCode: "ME",
    stateBadgeColor: "bg-indigo-950/60 border-indigo-700/60 text-indigo-300",
    resortIds: ["sugarloaf", "saddleback", "sunday-river"],
    geographyNote: "Above-treeline alpine snowfields, deep cold pools, and high sustained snowpack retention.",
  },
  {
    id: "adirondacks-catskills",
    name: "Adirondacks & Catskills",
    subheading: "Olympic vertical & classic Hudson Valley gateways",
    stateCode: "NY",
    stateBadgeColor: "bg-purple-950/60 border-purple-700/60 text-purple-300",
    resortIds: ["whiteface", "gore-mountain", "hunter-mountain", "windham"],
    geographyNote: "Whiteface commands the largest continuous vertical drop (3,430') in the Northeast.",
  },
  {
    id: "southern-new-england",
    name: "Southern New England",
    subheading: "Quick-access summit day trips for metro riders",
    stateCode: "MA",
    stateBadgeColor: "bg-amber-950/60 border-amber-700/60 text-amber-300",
    resortIds: ["berkshire-east", "wachusett"],
    geographyNote: "Under 90 minutes transit from Greater Boston with sheltered slope orientations.",
  },
];

export const RegionalGuideBento: React.FC<RegionalGuideBentoProps> = ({
  resorts,
  onSelectResort,
  hourOffset = 0,
}) => {
  const resortMap = React.useMemo(() => {
    return new Map(resorts.map((r) => [r.resortId, r]));
  }, [resorts]);

  return (
    <div className="w-full space-y-6">
      {/* Intro Subheading */}
      <div className="px-1 flex justify-between items-end">
        <div>
          <h3 className="text-sm font-mono font-medium uppercase tracking-wider text-stone-300 flex items-center gap-2">
            <Compass className="w-4 h-4 text-sky-400" />
            <span>[λ_ranges] Regional Alpine Sounding Directory</span>
          </h3>
          <p className="text-xs text-stone-400 mt-1">
            Northeast ski terrain organized by distinct meteorological corridors and geological ranges.
          </p>
        </div>
        <span className="text-xs font-mono text-stone-500 hidden sm:inline">
          [26 active weather stations]
        </span>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {REGION_GROUPS.map((group) => {
          const groupResorts = group.resortIds
            .map((id) => resortMap.get(id))
            .filter((r): r is ResortForecast => !!r);

          if (groupResorts.length === 0) return null;

          const topGroupResort = [...groupResorts].sort((a, b) => b.powderScore - a.powderScore)[0];

          return (
            <div
              key={group.id}
              className="craft-card rounded-3xl p-6 flex flex-col justify-between space-y-5"
            >
              {/* Group Header */}
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-semibold text-white tracking-tight">
                        {group.name}
                      </h4>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase ${group.stateBadgeColor}`}>
                        {group.stateCode}
                      </span>
                    </div>
                    <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                      {group.subheading}
                    </p>
                  </div>

                  {topGroupResort && (
                    <div className="text-right">
                      <span className="text-[10px] text-sky-400 block uppercase tracking-wider font-mono">
                        [Top Pick]
                      </span>
                      <span className="font-mono text-xs font-semibold text-white">
                        {topGroupResort.name} ({topGroupResort.powderScore})
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-stone-400 font-mono mt-2.5 pt-2 border-t hairline-border">
                  {group.geographyNote}
                </p>
              </div>

              {/* Mountains List in this Region */}
              <div className="space-y-1.5">
                {groupResorts.map((resort) => {
                  const snowfall =
                    hourOffset > 0 && resort.hourlySeries
                      ? resort.hourlySeries.find((s) => s.hourOffset === hourOffset)?.cumulativeSnowInches ?? resort.predictedSnowfallInches
                      : resort.snowfall48hInches ?? resort.predictedSnowfallInches;

                  return (
                    <div
                      key={resort.resortId}
                      onClick={() => onSelectResort(resort)}
                      className="group flex items-center justify-between p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.05] hover:border-sky-500/30 transition-all cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sky-300 font-bold w-7 text-right">
                          {resort.powderScore}
                        </span>
                        <div>
                          <div className="font-medium text-stone-200 group-hover:text-white transition-colors flex items-center gap-2">
                            <span>{resort.name}</span>
                            <span className="text-[10px] text-stone-500 font-mono">
                              ({resort.passType})
                            </span>
                          </div>
                          <div className="text-[10px] text-stone-400 font-mono flex items-center gap-2 mt-0.5">
                            <span>Summit: {resort.summitFt.toLocaleString()}&apos;</span>
                            <span>•</span>
                            <span>Vert: +{resort.verticalFt.toLocaleString()}&apos;</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 font-mono">
                        <div className="text-right">
                          <span className="text-stone-200 font-semibold">{snowfall}&quot;</span>
                          <span className="text-[10px] text-stone-500 block">
                            {resort.driveTimeEstimate ?? "-"}
                          </span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-stone-500 group-hover:text-sky-400 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

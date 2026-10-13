"use client";

import React from "react";
import { PersonaPreset } from "@/types/resort";
import { Sparkles, Wind, Sun, Layers, Check } from "lucide-react";

interface FilterBarProps {
  selectedPersona: PersonaPreset;
  onSelectPersona: (preset: PersonaPreset) => void;
  selectedPasses: string[];
  onTogglePass: (pass: string) => void;
  onClearAll: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  selectedPersona,
  onSelectPersona,
  selectedPasses,
  onTogglePass,
  onClearAll,
}) => {
  const personas: {
    id: PersonaPreset;
    label: string;
    icon: React.ReactNode;
    desc: string;
    activeClass: string;
  }[] = [
    {
      id: "all",
      label: "All Summits",
      icon: <Layers className="w-3.5 h-3.5 text-stone-300" />,
      desc: "Full 26-mountain regional roster",
      activeClass: "bg-white/[0.08] border-white/30 text-white shadow-sm",
    },
    {
      id: "glade_hunter",
      label: "Powder Glades",
      icon: <Sparkles className="w-3.5 h-3.5 text-purple-300" />,
      desc: "Score ≥80 • SLR ≥14:1 • Base ≥24\"",
      activeClass: "bg-purple-950/50 border-purple-400/50 text-purple-100 shadow-md shadow-purple-500/15",
    },
    {
      id: "wind_avoider",
      label: "Wind Protected",
      icon: <Wind className="w-3.5 h-3.5 text-amber-300" />,
      desc: "Gusts ≤35 mph • No wind hold • Snow >2\" or Score ≥40",
      activeClass: "bg-amber-950/50 border-amber-400/50 text-amber-100 shadow-md shadow-amber-500/15",
    },
    {
      id: "bluebird_cruiser",
      label: "Fair Weather",
      icon: <Sun className="w-3.5 h-3.5 text-sky-300" />,
      desc: "Calm winds <15 mph • Clear / settled",
      activeClass: "bg-sky-950/50 border-sky-400/50 text-sky-100 shadow-md shadow-sky-500/15",
    },
  ];

  const passAlliances = [
    { name: "Ikon", activeColor: "bg-amber-500/20 border-amber-400/60 text-amber-200" },
    { name: "Epic", activeColor: "bg-blue-500/20 border-blue-400/60 text-blue-200" },
    { name: "Indy", activeColor: "bg-emerald-500/20 border-emerald-400/60 text-emerald-200" },
    { name: "Independent", activeColor: "bg-purple-500/20 border-purple-400/60 text-purple-200" },
  ];

  return (
    <div className="w-full craft-card rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Top Header & Presets */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-200 uppercase tracking-wider">
              Focus Presets
            </span>
            <span className="text-xs text-stone-400">
              • Filter by weather profile
            </span>
          </div>
          {(selectedPersona !== "all" || selectedPasses.length > 0) && (
            <button
              onClick={onClearAll}
              className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {personas.map((p) => {
            const isSelected = selectedPersona === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelectPersona(p.id)}
                className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? p.activeClass
                    : "bg-white/[0.02] border-white/[0.06] text-stone-400 hover:border-white/[0.12] hover:text-stone-200"
                }`}
              >
                <div className="flex items-center gap-2 font-medium text-sm text-[#f4f3ef]">
                  {p.icon}
                  <span>{p.label}</span>
                </div>
                <p className="text-xs text-stone-400 mt-1 font-mono tracking-tight leading-relaxed">{p.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Season Pass Alliance Selector */}
      <div className="pt-3 border-t hairline-border flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-stone-300 uppercase tracking-wider">Pass Network:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {passAlliances.map((pass) => {
            const active = selectedPasses.includes(pass.name);
            return (
              <button
                key={pass.name}
                onClick={() => onTogglePass(pass.name)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer flex items-center gap-1.5 border ${
                  active
                    ? `${pass.activeColor} font-semibold shadow-sm`
                    : "bg-white/[0.02] border-white/[0.07] text-stone-400 hover:text-stone-200 hover:border-white/[0.15]"
                }`}
              >
                {active && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                <span>{pass.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

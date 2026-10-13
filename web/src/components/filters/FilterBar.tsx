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
  const personas: { id: PersonaPreset; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: "all",
      label: "All Summits",
      icon: <Layers className="w-3.5 h-3.5 text-stone-400" />,
      desc: "Full 26-mountain regional roster",
    },
    {
      id: "glade_hunter",
      label: "Powder Glades",
      icon: <Sparkles className="w-3.5 h-3.5 text-indigo-300" />,
      desc: "Score ≥80 • SLR ≥14:1 • Base ≥24\"",
    },
    {
      id: "wind_avoider",
      label: "Wind Protected",
      icon: <Wind className="w-3.5 h-3.5 text-amber-300" />,
      desc: "Summit gusts ≤35 mph • No wind hold",
    },
    {
      id: "bluebird_cruiser",
      label: "Fair Weather",
      icon: <Sun className="w-3.5 h-3.5 text-sky-300" />,
      desc: "Calm winds <15 mph • Clear / settled",
    },
  ];

  const passAlliances = ["Ikon", "Epic", "Indy", "Independent"];

  return (
    <div className="w-full craft-card rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Top Header & Presets */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-[11px] font-medium tracking-wider uppercase text-stone-400">
            Target Focus Presets
          </span>
          {(selectedPersona !== "all" || selectedPasses.length > 0) && (
            <button
              onClick={onClearAll}
              className="text-[11px] text-stone-400 hover:text-white transition-colors cursor-pointer"
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
                    ? "bg-white/[0.08] border-white/25 text-white shadow-sm"
                    : "bg-white/[0.02] border-white/[0.06] text-stone-400 hover:border-white/[0.12] hover:text-stone-200"
                }`}
              >
                <div className="flex items-center gap-2 font-medium text-xs text-[#f4f3ef]">
                  {p.icon}
                  <span>{p.label}</span>
                </div>
                <p className="text-[10px] text-stone-400 mt-1 font-mono tracking-tight">{p.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Season Pass Alliance Selector */}
      <div className="pt-3 border-t hairline-border flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-stone-400 text-[11px] tracking-wide uppercase font-medium">Pass Network:</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {passAlliances.map((pass) => {
            const active = selectedPasses.includes(pass);
            return (
              <button
                key={pass}
                onClick={() => onTogglePass(pass)}
                className={`px-3 py-1 rounded-full text-xs transition-all duration-150 cursor-pointer flex items-center gap-1.5 border ${
                  active
                    ? "bg-[#f4f3ef] text-[#0b0c0f] border-white font-medium shadow-sm"
                    : "bg-white/[0.02] border-white/[0.07] text-stone-400 hover:text-stone-200 hover:border-white/[0.15]"
                }`}
              >
                {active && <Check className="w-3 h-3 stroke-[2.5]" />}
                <span>{pass}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

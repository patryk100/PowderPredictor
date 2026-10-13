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
      label: "All Mountains",
      icon: <Layers className="w-3.5 h-3.5" />,
      desc: "Full Northeast regional index",
    },
    {
      id: "glade_hunter",
      label: "Glade Powder Hunter",
      icon: <Sparkles className="w-3.5 h-3.5 text-purple-400" />,
      desc: "Score ≥80 • SLR ≥14:1 • Base ≥24\"",
    },
    {
      id: "wind_avoider",
      label: "Wind Avoider",
      icon: <Wind className="w-3.5 h-3.5 text-amber-400" />,
      desc: "Summit gusts ≤35 mph • No wind hold",
    },
    {
      id: "bluebird_cruiser",
      label: "Bluebird Cruiser",
      icon: <Sun className="w-3.5 h-3.5 text-sky-400" />,
      desc: "Calm winds <15 mph • Clear / settled",
    },
  ];

  const passAlliances = ["Ikon", "Epic", "Indy", "Independent"];

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-xl space-y-3">
      {/* Persona Presets */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Ride Style Persona Presets
          </span>
          <button
            onClick={onClearAll}
            className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
          >
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {personas.map((p) => {
            const isSelected = selectedPersona === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelectPersona(p.id)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? "bg-cyan-950/70 border-cyan-400 text-white shadow-md shadow-cyan-500/20 ring-1 ring-cyan-400"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                  {p.icon}
                  <span>{p.label}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-tight font-mono">{p.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Season Pass Multi-Select */}
      <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-400 font-semibold">Pass Alliance:</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {passAlliances.map((pass) => {
            const active = selectedPasses.includes(pass);
            return (
              <button
                key={pass}
                onClick={() => onTogglePass(pass)}
                className={`px-3 py-1 rounded-lg font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                  active
                    ? "bg-cyan-500 text-slate-950 border-cyan-400 font-black shadow-sm"
                    : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {active && <Check className="w-3 h-3 stroke-[3]" />}
                <span>{pass} Pass</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

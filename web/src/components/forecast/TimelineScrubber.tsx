"use client";

import React, { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, Clock, Sparkles } from "lucide-react";

interface TimelineScrubberProps {
  currentHourOffset: number; // 0 to 72
  onChange: (hour: number) => void;
  maxHours?: number;
  stepHours?: number;
}

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  currentHourOffset,
  onChange,
  maxHours = 72,
  stepHours = 3,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (currentHourOffset >= maxHours) {
        setIsPlaying(false);
      } else {
        onChange(Math.min(maxHours, currentHourOffset + stepHours));
      }
    }, 900);

    return () => clearInterval(interval);
  }, [isPlaying, currentHourOffset, maxHours, stepHours, onChange]);

  const togglePlay = () => {
    if (currentHourOffset >= maxHours) {
      onChange(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    onChange(0);
  };

  // Format forecast offset
  const getLabel = (hour: number) => {
    if (hour === 0) return "Now (Live)";
    if (hour <= 24) return `+${hour}h (Day 1)`;
    if (hour <= 48) return `+${hour}h (Day 2)`;
    return `+${hour}h (Day 3)`;
  };

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl backdrop-blur-xl space-y-3">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white uppercase tracking-wider">
            72-Hour Storm Progression
          </span>
          <span className="font-mono text-cyan-300 font-bold bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/60">
            {getLabel(currentHourOffset)}
          </span>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              isPlaying
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 hover:bg-cyan-400"
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Simulation</span>
              </>
            )}
          </button>

          <button
            onClick={handleReset}
            title="Reset to Live Current Hour"
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Slider Bar */}
      <div className="relative pt-1">
        <input
          type="range"
          min={0}
          max={maxHours}
          step={stepHours}
          value={currentHourOffset}
          onChange={(e) => {
            setIsPlaying(false);
            onChange(Number(e.target.value));
          }}
          className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-400 border border-slate-800"
        />

        {/* Ticks & Major Milestones */}
        <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-1">
          <span className="font-bold text-cyan-400">T0 (Now)</span>
          <span>+12h</span>
          <span className="font-bold text-purple-400">+24h (Storm Peak)</span>
          <span>+36h</span>
          <span className="font-bold text-blue-400">+48h (Powder Day)</span>
          <span>+60h</span>
          <span>+72h</span>
        </div>
      </div>
    </div>
  );
};

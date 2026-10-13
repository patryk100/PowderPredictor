"use client";

import React, { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, Clock } from "lucide-react";

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

  const getLabel = (hour: number) => {
    if (hour === 0) return "T0 (Now)";
    if (hour <= 24) return `+${hour}h Horizon`;
    if (hour <= 48) return `+${hour}h Day 2`;
    return `+${hour}h Extended`;
  };

  return (
    <div className="w-full craft-card rounded-2xl p-4 sm:p-5 space-y-3.5">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-sky-400" />
          <span className="font-semibold tracking-wider uppercase text-stone-200 text-xs sm:text-sm">
            72-Hour Atmospheric Simulation
          </span>
          <span className="font-mono text-sky-300 bg-sky-950/60 px-2.5 py-0.5 rounded-full border border-sky-800/60 text-xs">
            {getLabel(currentHourOffset)}
          </span>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className={`px-3.5 py-1.5 rounded-xl font-medium text-xs sm:text-sm flex items-center gap-1.5 transition-all duration-150 cursor-pointer shadow-md ${
              isPlaying
                ? "bg-amber-400 text-stone-950 shadow-amber-500/20"
                : "bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-sky-500/20"
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
                <span>Simulate Storm</span>
              </>
            )}
          </button>

          <button
            onClick={handleReset}
            title="Reset to current observation"
            className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-stone-400 hover:text-white border border-white/[0.07] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Slider Bar */}
      <div className="relative pt-1">
        <div className="h-2.5 w-full rounded-lg bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-purple-500/20 p-0.5 border border-white/[0.06] flex items-center">
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
            className="w-full h-2 bg-transparent appearance-none cursor-pointer accent-sky-400"
          />
        </div>

        {/* Ticks & Major Milestones */}
        <div className="flex justify-between text-xs text-stone-400 font-mono pt-2">
          <span className={currentHourOffset === 0 ? "text-sky-300 font-semibold" : ""}>T0 (Now)</span>
          <span>+12h</span>
          <span className={currentHourOffset >= 21 && currentHourOffset <= 27 ? "text-indigo-300 font-semibold" : ""}>
            +24h Storm Peak
          </span>
          <span>+36h</span>
          <span className={currentHourOffset >= 45 && currentHourOffset <= 51 ? "text-purple-300 font-semibold" : ""}>
            +48h Powder Day
          </span>
          <span>+60h</span>
          <span className={currentHourOffset >= 69 ? "text-stone-300 font-semibold" : ""}>+72h</span>
        </div>
      </div>
    </div>
  );
};

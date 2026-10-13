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
    if (hour === 0) return "Observation (Now)";
    if (hour <= 24) return `+${hour}h Horizon`;
    if (hour <= 48) return `+${hour}h Day 2`;
    return `+${hour}h Extended`;
  };

  return (
    <div className="w-full craft-card rounded-2xl p-4 sm:p-5 space-y-3.5">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <Clock className="w-3.5 h-3.5 text-stone-400" />
          <span className="font-medium tracking-wide uppercase text-stone-300 text-[11px]">
            72-Hour Atmospheric Timeline
          </span>
          <span className="font-mono text-stone-300 bg-white/[0.05] px-2.5 py-0.5 rounded-full border border-white/[0.08] text-[11px]">
            {getLabel(currentHourOffset)}
          </span>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className={`px-3 py-1.5 rounded-xl font-medium text-xs flex items-center gap-1.5 transition-all duration-150 cursor-pointer ${
              isPlaying
                ? "bg-amber-400/90 text-stone-950 shadow-sm"
                : "bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.12]"
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3 h-3 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>Simulate</span>
              </>
            )}
          </button>

          <button
            onClick={handleReset}
            title="Reset to current observation"
            className="p-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-stone-400 hover:text-white border border-white/[0.07] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
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
          className="w-full h-1.5 bg-white/[0.08] rounded-lg appearance-none cursor-pointer accent-white border-none"
        />

        {/* Ticks & Major Milestones */}
        <div className="flex justify-between text-[10px] text-stone-500 font-mono pt-2">
          <span className={currentHourOffset === 0 ? "text-white font-medium" : ""}>T0 (Now)</span>
          <span>+12h</span>
          <span className={currentHourOffset >= 21 && currentHourOffset <= 27 ? "text-white font-medium" : ""}>
            +24h
          </span>
          <span>+36h</span>
          <span className={currentHourOffset >= 45 && currentHourOffset <= 51 ? "text-white font-medium" : ""}>
            +48h
          </span>
          <span>+60h</span>
          <span className={currentHourOffset >= 69 ? "text-white font-medium" : ""}>+72h</span>
        </div>
      </div>
    </div>
  );
};

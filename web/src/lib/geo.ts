/**
 * Calculate Great-Circle distance in miles using the Haversine formula
 */
export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Format a driving time approximation assuming average mountain highway transit speed (50 mph)
 */
export function estimateDriveTime(distanceMiles: number): string {
  const totalMinutes = Math.round((distanceMiles / 50.0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) {
    return `${mins}m`;
  }
  return `${hours}h ${mins}m`;
}

/**
 * Snowfall color styling thresholds:
 * grey: < 2"
 * light blue: 2 - 6"
 * royal blue: 6 - 12"
 * deep purple: 12"+
 */
export function getSnowfallColor(inches: number): {
  bg: string;
  text: string;
  border: string;
  hex: string;
} {
  if (inches < 2) {
    return {
      bg: "bg-slate-700",
      text: "text-slate-300",
      border: "border-slate-500",
      hex: "#64748b", // slate-500
    };
  }
  if (inches < 6) {
    return {
      bg: "bg-sky-600",
      text: "text-sky-100",
      border: "border-sky-400",
      hex: "#38bdf8", // light blue (sky-400)
    };
  }
  if (inches < 12) {
    return {
      bg: "bg-blue-600",
      text: "text-blue-100",
      border: "border-blue-400",
      hex: "#2563eb", // royal blue (blue-600)
    };
  }
  return {
    bg: "bg-purple-700",
    text: "text-purple-100",
    border: "border-purple-400",
    hex: "#7e22ce", // deep purple (purple-700)
  };
}

/**
 * Powder score color scheme (0 - 100)
 */
export function getPowderScoreBadge(score: number): {
  bg: string;
  text: string;
  label: string;
} {
  if (score >= 85) {
    return { bg: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30", text: "text-emerald-400", label: "EPIC" };
  }
  if (score >= 70) {
    return { bg: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30", text: "text-cyan-400", label: "GREAT" };
  }
  if (score >= 50) {
    return { bg: "bg-amber-500/20 text-amber-400 border border-amber-500/30", text: "text-amber-400", label: "FAIR" };
  }
  return { bg: "bg-rose-500/20 text-rose-400 border border-rose-500/30", text: "text-rose-400", label: "LOW" };
}

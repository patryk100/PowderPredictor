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
 * Snowfall color styling thresholds with refined editorial palette:
 * grey/stone: < 2"
 * mist blue: 2 - 6"
 * deep alpine: 6 - 12"
 * dusk violet: 12"+
 */
export function getSnowfallColor(inches: number): {
  bg: string;
  text: string;
  border: string;
  hex: string;
} {
  if (inches < 2) {
    return {
      bg: "bg-white/[0.06]",
      text: "text-stone-300",
      border: "border-white/[0.1]",
      hex: "#2d3039",
    };
  }
  if (inches < 6) {
    return {
      bg: "bg-sky-500/15",
      text: "text-sky-200",
      border: "border-sky-500/30",
      hex: "#0369a1",
    };
  }
  if (inches < 12) {
    return {
      bg: "bg-blue-500/20",
      text: "text-blue-200",
      border: "border-blue-500/35",
      hex: "#1d4ed8",
    };
  }
  return {
    bg: "bg-indigo-500/20",
    text: "text-indigo-200",
    border: "border-indigo-500/35",
    hex: "#4f46e5",
  };
}

/**
 * Powder score color scheme (0 - 100) with subtle, refined badges
 */
export function getPowderScoreBadge(score: number): {
  bg: string;
  text: string;
  label: string;
} {
  if (score >= 85) {
    return {
      bg: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25",
      text: "text-emerald-300",
      label: "EPIC",
    };
  }
  if (score >= 70) {
    return {
      bg: "bg-sky-500/10 text-sky-300 border border-sky-500/25",
      text: "text-sky-300",
      label: "GREAT",
    };
  }
  if (score >= 50) {
    return {
      bg: "bg-amber-500/10 text-amber-300 border border-amber-500/25",
      text: "text-amber-300",
      label: "FAIR",
    };
  }
  return {
    bg: "bg-white/[0.05] text-stone-400 border border-white/[0.08]",
    text: "text-stone-400",
    label: "LOW / OFF-SEASON",
  };
}

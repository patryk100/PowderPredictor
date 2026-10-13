package terrain

import (
	"math"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
	"github.com/powderpredictor/operator/pkg/weather"
)

// SurfaceQualityTag represents terrain and snowpack surface classifications
type SurfaceQualityTag string

const (
	TagUntrackedStashesLikely SurfaceQualityTag = "Untracked Stashes Likely"
	TagChalkHardpack          SurfaceQualityTag = "Chalk / Hardpack"
	TagWindSlabRisk           SurfaceQualityTag = "Wind Slab Risk"
	TagGladesRecommended      SurfaceQualityTag = "Glades Recommended"
	TagScouredFirm            SurfaceQualityTag = "Scoured / Firm / Wind Hold Risk"
	TagWindLoadedStash        SurfaceQualityTag = "Wind-Loaded / Stash"
)

// ExposureClassification categorizes slope exposure relative to wind
type ExposureClassification string

const (
	ExposureWindward ExposureClassification = "Windward"
	ExposureLeeward  ExposureClassification = "Leeward"
	ExposureCross    ExposureClassification = "Cross-Slope"
)

// AspectAnalysis captures wind exposure, loading modifiers, and quality tags for a specific aspect
type AspectAnalysis struct {
	Aspect               weatherv1alpha1.Aspect `json:"aspect"`
	Exposure             ExposureClassification `json:"exposure"`
	AccumulationModifier float64                `json:"accumulationModifier"`
	SurfaceTags          []SurfaceQualityTag    `json:"surfaceTags"`
	WindScoured          bool                   `json:"windScoured"`
	WindLoaded           bool                   `json:"windLoaded"`
}

// WindTerrainImpact aggregates overall wind-scour and aspect loading analysis for a mountain target
type WindTerrainImpact struct {
	SustainedWindMph   float64           `json:"sustainedWindMph"`
	WindGustMph        float64           `json:"windGustMph"`
	WindDirectionDeg   int               `json:"windDirectionDeg"`
	WindHoldRiskIndex  int               `json:"windHoldRiskIndex"` // 0 - 100
	LiftWindHoldRisk   string            `json:"liftWindHoldRisk"`  // "Low", "Moderate", "High", "Severe"
	DominantQualityTag SurfaceQualityTag `json:"dominantQualityTag"`
	AspectReports      []AspectAnalysis  `json:"aspectReports"`
}

// AspectToAzimuth maps compass aspects to their normal azimuth degrees
func AspectToAzimuth(aspect weatherv1alpha1.Aspect) float64 {
	switch aspect {
	case weatherv1alpha1.AspectNorth:
		return 0.0
	case weatherv1alpha1.AspectNorthEast:
		return 45.0
	case weatherv1alpha1.AspectEast:
		return 90.0
	case weatherv1alpha1.AspectSouthEast:
		return 135.0
	case weatherv1alpha1.AspectSouth:
		return 180.0
	case weatherv1alpha1.AspectSouthWest:
		return 225.0
	case weatherv1alpha1.AspectWest:
		return 270.0
	case weatherv1alpha1.AspectNorthWest:
		return 315.0
	default:
		return 0.0
	}
}

// AngularDifference calculates the absolute angular difference between two bearings in degrees (0 - 180)
func AngularDifference(bearing1, bearing2 float64) float64 {
	diff := math.Abs(bearing1 - bearing2)
	diff = math.Mod(diff, 360.0)
	if diff > 180.0 {
		diff = 360.0 - diff
	}
	return diff
}

// CalculateWindHoldRiskIndex computes a 0-100 index for lift operations and exposed summit quads
// based on sustained wind and peak gusts.
func CalculateWindHoldRiskIndex(sustainedMph, gustMph float64) int {
	// Base risk driven primarily by gusts and high sustained wind
	// Thresholds:
	// Sustained > 25 mph or Gust > 40 mph starts moderate risk
	// Sustained > 35 mph or Gust > 50 mph severe risk
	risk := 0.0

	if gustMph > 20.0 {
		risk += (gustMph - 20.0) * 1.8
	}
	if sustainedMph > 15.0 {
		risk += (sustainedMph - 15.0) * 1.5
	}

	if gustMph >= 60.0 || sustainedMph >= 45.0 {
		risk = math.Max(risk, 85.0)
	}

	clamped := int(math.Round(math.Max(0.0, math.Min(100.0, risk))))
	return clamped
}

// ClassifyLiftWindHoldRisk maps risk index (0-100) and peak wind to categorical status
func ClassifyLiftWindHoldRisk(riskIndex int, sustainedMph, gustMph float64) string {
	if sustainedMph >= 45.0 || gustMph >= 60.0 || riskIndex >= 80 {
		return "High"
	}
	if sustainedMph >= 30.0 || gustMph >= 45.0 || riskIndex >= 50 {
		return "Moderate"
	}
	if riskIndex >= 25 {
		return "Low"
	}
	return "None"
}

// AnalyzeAspects evaluates how ridgeline wind interacts with the mountain's primary aspects
func AnalyzeAspects(
	aspects []weatherv1alpha1.Aspect,
	sustainedMph float64,
	gustMph float64,
	windDirDegrees int,
) WindTerrainImpact {
	windDir := float64(windDirDegrees % 360)
	if windDir < 0 {
		windDir += 360
	}

	riskIndex := CalculateWindHoldRiskIndex(sustainedMph, gustMph)
	liftRisk := ClassifyLiftWindHoldRisk(riskIndex, sustainedMph, gustMph)

	isHighWind := sustainedMph > 25.0 || gustMph > 40.0
	isExtremeWind := sustainedMph > 35.0 || gustMph > 50.0

	impact := WindTerrainImpact{
		SustainedWindMph:  sustainedMph,
		WindGustMph:       gustMph,
		WindDirectionDeg:  windDirDegrees,
		WindHoldRiskIndex: riskIndex,
		LiftWindHoldRisk:  liftRisk,
		AspectReports:     make([]AspectAnalysis, 0, len(aspects)),
	}

	var hasScoured bool
	var hasLoaded bool

	for _, asp := range aspects {
		aspectBearing := AspectToAzimuth(asp)

		// Wind direction is "from where the wind blows".
		// A slope facing the wind direction (e.g., NW slope facing 315° when wind is from 315°) is windward.
		diffFromWind := AngularDifference(aspectBearing, windDir)

		report := AspectAnalysis{
			Aspect: asp,
		}

		// Windward: angle diff <= 45°
		if diffFromWind <= 45.0 {
			report.Exposure = ExposureWindward
			report.AccumulationModifier = 0.8 // Snow scoured away
			if isHighWind {
				report.WindScoured = true
				hasScoured = true
				report.SurfaceTags = append(report.SurfaceTags, TagScouredFirm, TagChalkHardpack)
			}
		} else if diffFromWind >= 135.0 {
			// Leeward: angle diff >= 135° (opposite side, sheltered, cross-ridge deposition)
			report.Exposure = ExposureLeeward
			report.WindLoaded = true
			hasLoaded = true

			// Localized bonus accumulation modifier (1.1x to 1.3x)
			bonus := 1.1 + (math.Min(sustainedMph, 40.0)/40.0)*0.2
			report.AccumulationModifier = weather.Round(bonus, 2)

			report.SurfaceTags = append(report.SurfaceTags, TagWindLoadedStash, TagUntrackedStashesLikely)
			if isHighWind {
				report.SurfaceTags = append(report.SurfaceTags, TagWindSlabRisk)
			}
			report.SurfaceTags = append(report.SurfaceTags, TagGladesRecommended)
		} else {
			// Cross-slope
			report.Exposure = ExposureCross
			report.AccumulationModifier = 1.0
			if isExtremeWind {
				report.SurfaceTags = append(report.SurfaceTags, TagChalkHardpack)
			}
		}

		impact.AspectReports = append(impact.AspectReports, report)
	}

	// Dominant overall tag
	if isHighWind && hasLoaded {
		impact.DominantQualityTag = TagWindSlabRisk
	} else if hasLoaded {
		impact.DominantQualityTag = TagUntrackedStashesLikely
	} else if hasScoured {
		impact.DominantQualityTag = TagScouredFirm
	} else {
		impact.DominantQualityTag = TagGladesRecommended
	}

	return impact
}

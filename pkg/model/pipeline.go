package model

import (
	"time"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
	"github.com/powderpredictor/operator/pkg/model/elevation"
	"github.com/powderpredictor/operator/pkg/model/scoring"
	"github.com/powderpredictor/operator/pkg/model/snow"
	"github.com/powderpredictor/operator/pkg/model/terrain"
	"github.com/powderpredictor/operator/pkg/weather"
)

// EvaluatedForecast represents the full multi-stage microclimate model evaluation for a mountain target
type EvaluatedForecast struct {
	WindowStart time.Time `json:"windowStart"`
	WindowEnd   time.Time `json:"windowEnd"`

	// Cumulative modeled snowfall depths across forecast horizons
	Snowfall24hInches float64 `json:"snowfall24hInches"`
	Snowfall48hInches float64 `json:"snowfall48hInches"`
	Snowfall72hInches float64 `json:"snowfall72hInches"`

	// Representative model values for CR publication
	PredictedSnowfallInches  float64 `json:"predictedSnowfallInches"`
	SnowToLiquidRatio        float64 `json:"snowToLiquidRatio"`
	FreezingLevelElevationFt int     `json:"freezingLevelElevationFt"`

	// Quantitative scoring
	PowderScore        int     `json:"powderScore"`
	ConfidenceInterval float64 `json:"confidenceInterval"`
	QualityTier        string  `json:"qualityTier"`

	// Terrain & Wind Impact
	WindImpact terrain.WindTerrainImpact `json:"windImpact"`

	// Flags for condition alerts and status annotations
	GladesRecommended bool `json:"gladesRecommended"`
	WindHoldWarning   bool `json:"windHoldWarning"`
	CrustRisk         bool `json:"crustRisk"`
}

// EvaluateTargetForecast executes the end-to-end meteorological modeling pipeline:
// Dynamic Lapse Rate Downscaling -> Sounding & DGZ SLR -> Aspect & Wind Scour -> Composite Powder Score
func EvaluateTargetForecast(
	target *weatherv1alpha1.ResortTarget,
	snapshot *weather.UnifiedForecastSnapshot,
	currentBaseDepthInches float64,
	ensemblePredictions []float64,
) *EvaluatedForecast {
	bounds := weather.ElevationBounds{
		BaseElevationFt:   target.Spec.BaseElevationFt,
		SummitElevationFt: target.Spec.SummitElevationFt,
	}
	midElevation := bounds.MidElevationFt()

	now := time.Now()
	eval := &EvaluatedForecast{
		WindowStart: now,
		WindowEnd:   now.Add(24 * time.Hour),
	}

	if snapshot == nil || len(snapshot.HourlySnapshots) == 0 {
		// Fallback empty model output
		eval.PowderScore = 0
		eval.ConfidenceInterval = 50.0
		eval.QualityTier = "Poor"
		return eval
	}

	eval.WindowStart = snapshot.HourlySnapshots[0].Timestamp
	eval.WindowEnd = snapshot.HourlySnapshots[len(snapshot.HourlySnapshots)-1].Timestamp

	var totalSummitQPF float64
	var totalSnow24h, totalSnow48h, totalSnow72h float64
	var maxSustainedWind, maxGust float64
	var dominantWindDir int
	var maxPrecedingTempF float64 = -999.0
	var sustainedBelowFreezing = true
	var finishingRainOrThaw bool
	var recentRainHours int
	var weightedSLRSum float64
	var totalPrecipForSLR float64
	var lastFreezingLevel int

	for i, h := range snapshot.HourlySnapshots {
		// 1. Dynamic Lapse Rate Downscaling
		refTemp := h.Base.TemperatureF
		refRH := h.Base.RelativeHumidity
		if refRH <= 0 {
			refRH = 85.0
		}

		baseSnap, _, summitSnap := elevation.DownscaleTierConditions(
			bounds,
			refTemp,
			bounds.BaseElevationFt,
			refRH,
			h.Summit.WindSpeedMph,
			h.Summit.WindGustMph,
			h.Summit.WindDirectionDegrees,
			h.Summit.QPFInches,
			h.Summit.PrecipitationProbability,
		)

		lastFreezingLevel = baseSnap.FreezingLevelElevationFt

		// Check temperature preservation
		if summitSnap.TemperatureF > maxPrecedingTempF {
			maxPrecedingTempF = summitSnap.TemperatureF
		}
		if summitSnap.TemperatureF >= 32.0 {
			sustainedBelowFreezing = false
		}

		// Track rain vs snow transitions
		if summitSnap.Phase == weather.PhaseRain || summitSnap.Phase == weather.PhaseMixed {
			recentRainHours++
			if i >= len(snapshot.HourlySnapshots)-6 {
				// Storm finishes with rain or thaw
				finishingRainOrThaw = true
			}
		}

		// 2. Sounding & DGZ SLR modeling
		sounding := snow.AtmosphericSounding{
			SurfaceTempF: summitSnap.TemperatureF,
			SurfaceRH:    refRH,
			Level850hPa:  h.Isobaric850hPa,
			Level700hPa:  h.Isobaric700hPa,
		}

		hourlySLR := snow.CalculateSLR(sounding)
		hourlySnow := snow.CalculateSnowAccumulation(summitSnap.QPFInches, hourlySLR)

		totalSummitQPF += summitSnap.QPFInches
		if summitSnap.QPFInches > 0 {
			weightedSLRSum += hourlySLR * summitSnap.QPFInches
			totalPrecipForSLR += summitSnap.QPFInches
		}

		// Cumulative windows
		if i < 24 {
			totalSnow24h += hourlySnow
		}
		if i < 48 {
			totalSnow48h += hourlySnow
		}
		if i < 72 {
			totalSnow72h += hourlySnow
		}

		// Peak wind vectors
		if summitSnap.WindSpeedMph > maxSustainedWind {
			maxSustainedWind = summitSnap.WindSpeedMph
			dominantWindDir = summitSnap.WindDirectionDegrees
		}
		if summitSnap.WindGustMph > maxGust {
			maxGust = summitSnap.WindGustMph
		}
	}

	eval.Snowfall24hInches = weather.Round(totalSnow24h, 1)
	eval.Snowfall48hInches = weather.Round(totalSnow48h, 1)
	eval.Snowfall72hInches = weather.Round(totalSnow72h, 1)
	eval.PredictedSnowfallInches = eval.Snowfall24hInches
	eval.FreezingLevelElevationFt = lastFreezingLevel

	meanSLR := 11.0
	if totalPrecipForSLR > 0 {
		meanSLR = weather.Round(weightedSLRSum/totalPrecipForSLR, 1)
	}
	eval.SnowToLiquidRatio = meanSLR

	// 3. Aspect, Ridgeline Wind Scour & Wind Slab Modeling
	windImpact := terrain.AnalyzeAspects(target.Spec.PrimaryAspects, maxSustainedWind, maxGust, dominantWindDir)
	eval.WindImpact = windImpact
	eval.WindHoldWarning = windImpact.LiftWindHoldRisk == "High" || windImpact.LiftWindHoldRisk == "Severe"

	gladesRecommended := windImpact.DominantQualityTag == terrain.TagGladesRecommended || windImpact.DominantQualityTag == terrain.TagWindLoadedStash
	for _, asp := range windImpact.AspectReports {
		if asp.WindLoaded {
			gladesRecommended = true
			break
		}
	}
	eval.GladesRecommended = gladesRecommended

	// 4. Composite Powder Score Algorithm & Confidence Grading
	scoreInput := scoring.PowderScoreInput{
		Snowfall24hInches:                  eval.Snowfall24hInches,
		Snowfall48hInches:                  eval.Snowfall48hInches,
		SnowToLiquidRatio:                  eval.SnowToLiquidRatio,
		SustainedBelowFreezingPreceding36h: sustainedBelowFreezing,
		MaxPrecedingTempF:                  maxPrecedingTempF,
		FinishingRainOrThaw:                finishingRainOrThaw,
		RecentRainHours:                    recentRainHours,
		SustainedWindMph:                   maxSustainedWind,
		WindGustMph:                        maxGust,
		CurrentBaseDepthInches:             currentBaseDepthInches,
		MidMountainElevationFt:             midElevation,
		FreezingLevelFt:                    eval.FreezingLevelElevationFt,
		EnsemblePredictions:                ensemblePredictions,
	}

	scoreResult := scoring.CalculatePowderScore(scoreInput)
	eval.PowderScore = scoreResult.PowderScore
	eval.ConfidenceInterval = scoreResult.ConfidenceInterval
	eval.QualityTier = scoreResult.QualityTier
	eval.CrustRisk = finishingRainOrThaw || recentRainHours > 0

	return eval
}

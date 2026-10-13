package scoring

import (
	"math"

	"github.com/powderpredictor/operator/pkg/weather"
)

// PowderScoreInput encapsulates all modeled parameters necessary to compute the deterministic Powder Score
type PowderScoreInput struct {
	// Accumulation metrics
	Snowfall24hInches float64
	Snowfall48hInches float64

	// Snow quality
	SnowToLiquidRatio float64 // e.g. 15.0 for 15:1

	// Cold preservation & temperature profile
	SustainedBelowFreezingPreceding36h bool
	MaxPrecedingTempF                  float64
	FinishingRainOrThaw                bool
	RecentRainHours                    int

	// Wind impact
	SustainedWindMph float64
	WindGustMph      float64

	// Ground / Base coverage factor (from SNOTEL telemetry or base estimate)
	CurrentBaseDepthInches float64

	// Freezing line relative to terrain
	MidMountainElevationFt int
	FreezingLevelFt        int

	// Multi-model ensemble agreement
	EnsemblePredictions []float64 // Snowfall predictions from individual providers (e.g. NOAA, Open-Meteo)
}

// PowderScoreResult provides the composite score, confidence percentage, and breakdown
type PowderScoreResult struct {
	PowderScore        int     `json:"powderScore"`        // 0 - 100
	ConfidenceInterval float64 `json:"confidenceInterval"` // 0.0 - 100.0%
	QualityTier        string  `json:"qualityTier"`        // "Epic", "Great", "Good", "Mediocre", "Poor"

	// Sub-score components (weighted total out of 100)
	AccumulationPoints float64 `json:"accumulationPoints"` // max 40
	QualityPoints      float64 `json:"qualityPoints"`      // max 25
	PreservationPoints float64 `json:"preservationPoints"` // max 15
	WindPoints         float64 `json:"windPoints"`         // max 10
	BasePoints         float64 `json:"basePoints"`         // max 10
}

// CalculatePowderScore computes the composite powder score (0-100) and confidence interval (0-100%)
func CalculatePowderScore(input PowderScoreInput) PowderScoreResult {
	// 1. Recent Accumulation (40% weight): peaks at 12"+
	// 24hr snowfall is weighted highest; 48hr adds base freshness
	effectiveAccum := input.Snowfall24hInches + (input.Snowfall48hInches * 0.3)
	accumRatio := math.Min(1.0, effectiveAccum/12.0)
	accumScore := accumRatio * 40.0

	// 2. Snow Quality / Density (25% weight):
	// Optimum: 14:1 to 18:1 (blower powder)
	// Penalized for < 9:1 (wet/heavy cement) or > 22:1 (dust-on-crust)
	var qualityScore float64
	slr := input.SnowToLiquidRatio
	if slr <= 0 {
		slr = 11.0 // default baseline
	}

	if slr >= 14.0 && slr <= 18.0 {
		qualityScore = 25.0
	} else if slr > 18.0 && slr <= 22.0 {
		// Ultra-light fluff, slightly prone to wind compaction
		qualityScore = 23.0
	} else if slr > 22.0 {
		// Dust on crust penalty
		qualityScore = math.Max(12.0, 23.0-(slr-22.0)*2.0)
	} else if slr >= 11.0 && slr < 14.0 {
		// Good standard cold snow
		qualityScore = 20.0
	} else if slr >= 9.0 && slr < 11.0 {
		// Dense packing snow
		qualityScore = 15.0
	} else {
		// Heavy wet snow < 9:1
		qualityScore = math.Max(4.0, (slr/9.0)*12.0)
	}

	// 3. Cold Preservation (15% weight):
	// Sustained sub-freezing across preceding 36 hours; penalize heavily for recent rain or freeze-thaw crusts
	var presScore float64
	if input.SustainedBelowFreezingPreceding36h {
		presScore = 15.0
	} else if input.MaxPrecedingTempF <= 34.0 {
		presScore = 10.0
	} else {
		// Thaw occurred
		presScore = math.Max(2.0, 10.0-(input.MaxPrecedingTempF-34.0)*1.2)
	}

	// Severe crust penalty if storm finishes with above-freezing temps or rain
	if input.FinishingRainOrThaw || input.RecentRainHours > 0 {
		presScore = 0.0
		// Also slash quality score due to wet surface crust
		qualityScore = math.Min(qualityScore, 6.0)
	}

	// 4. Wind Impact (10% weight):
	// Deduct points for sustained winds > 25 mph that blow snow off upper trails
	var windScore float64
	if input.SustainedWindMph <= 15.0 {
		windScore = 10.0
	} else if input.SustainedWindMph <= 25.0 {
		windScore = 8.0
	} else if input.SustainedWindMph <= 35.0 {
		windScore = 4.0
	} else {
		// Extreme ridgeline scouring
		windScore = 1.0
	}

	// 5. Surface Base Factor (10% weight):
	// Scaled against base depth (e.g. 36"+ is full coverage, < 12" is rock / stump danger)
	var baseScore float64
	baseDepth := input.CurrentBaseDepthInches
	if baseDepth >= 36.0 {
		baseScore = 10.0
	} else if baseDepth >= 24.0 {
		baseScore = 8.5
	} else if baseDepth >= 12.0 {
		baseScore = 6.0
	} else {
		baseScore = math.Max(1.0, (baseDepth/12.0)*5.0)
	}

	rawTotal := accumScore + qualityScore + presScore + windScore + baseScore

	// If finishing with rain or thaw, overall score must not exceed 40 (crusting penalty)
	if input.FinishingRainOrThaw && rawTotal > 39.0 {
		rawTotal = 38.0
	}

	finalScore := int(math.Round(math.Max(0.0, math.Min(100.0, rawTotal))))

	// Quality Tier mapping
	tier := "Poor"
	if finalScore >= 85 {
		tier = "Epic"
	} else if finalScore >= 70 {
		tier = "Great"
	} else if finalScore >= 55 {
		tier = "Good"
	} else if finalScore >= 40 {
		tier = "Mediocre"
	}

	// Confidence Interval calculation (0.0 - 100.0%)
	confidence := calculateConfidence(input)

	return PowderScoreResult{
		PowderScore:        finalScore,
		ConfidenceInterval: confidence,
		QualityTier:        tier,
		AccumulationPoints: weather.Round(accumScore, 1),
		QualityPoints:      weather.Round(qualityScore, 1),
		PreservationPoints: weather.Round(presScore, 1),
		WindPoints:         weather.Round(windScore, 1),
		BasePoints:         weather.Round(baseScore, 1),
	}
}

// calculateConfidence evaluates multi-model ensemble spread and rain/snow line proximity
func calculateConfidence(input PowderScoreInput) float64 {
	baseConf := 95.0

	// 1. Proximity of freezing level to mid-mountain tier:
	// If the 32°F isotherm is within 200 ft of mid-mountain, high volatility for rain vs snow
	if input.MidMountainElevationFt > 0 && input.FreezingLevelFt > 0 {
		diffFt := math.Abs(float64(input.MidMountainElevationFt - input.FreezingLevelFt))
		if diffFt <= 200.0 {
			// Deduct up to 25% confidence due to elevation split volatility
			penalty := (1.0 - (diffFt / 200.0)) * 25.0
			baseConf -= penalty
		}
	}

	// 2. Multi-model ensemble agreement:
	// Variance across NOAA, GFS, and Open-Meteo snowfall amounts
	if len(input.EnsemblePredictions) >= 2 {
		var sum float64
		for _, v := range input.EnsemblePredictions {
			sum += v
		}
		mean := sum / float64(len(input.EnsemblePredictions))

		var varianceSum float64
		for _, v := range input.EnsemblePredictions {
			diff := v - mean
			varianceSum += diff * diff
		}
		stdDev := math.Sqrt(varianceSum / float64(len(input.EnsemblePredictions)))

		// If standard deviation is large relative to mean, deduct confidence
		if mean > 0 {
			cov := stdDev / mean // Coefficient of variation
			if cov > 0.3 {
				confLoss := math.Min(30.0, (cov-0.3)*40.0)
				baseConf -= confLoss
			}
		}
	}

	clampedConf := weather.Round(math.Max(20.0, math.Min(100.0, baseConf)), 1)
	return clampedConf
}

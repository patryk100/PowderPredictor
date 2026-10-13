package scoring

import (
	"testing"
)

func TestCalculatePowderScore_EpicStorm(t *testing.T) {
	// Dry, cold 14" storm, light winds (10 mph), 16:1 SLR, sustained cold preceding 36h, base depth 48"
	input := PowderScoreInput{
		Snowfall24hInches:                  14.0,
		Snowfall48hInches:                  2.0,
		SnowToLiquidRatio:                  16.0,
		SustainedBelowFreezingPreceding36h: true,
		SustainedWindMph:                   10.0,
		CurrentBaseDepthInches:             48.0,
		MidMountainElevationFt:             2800,
		FreezingLevelFt:                    1000, // Freezing level far below base
		EnsemblePredictions:                []float64{14.0, 14.5, 13.8},
	}

	result := CalculatePowderScore(input)
	if result.PowderScore < 90 {
		t.Errorf("expected Epic Powder Score >= 90 for ideal 14\" storm, got %d", result.PowderScore)
	}
	if result.QualityTier != "Epic" {
		t.Errorf("expected quality tier Epic, got %s", result.QualityTier)
	}
	if result.ConfidenceInterval < 85.0 {
		t.Errorf("expected high confidence >= 85%% for tight ensemble, got %.1f%%", result.ConfidenceInterval)
	}
}

func TestCalculatePowderScore_FinishingRainPenalty(t *testing.T) {
	// 10" storm that finishes with rain and above-freezing temperatures -> should score < 40 due to crusting penalty
	input := PowderScoreInput{
		Snowfall24hInches:                  10.0,
		SnowToLiquidRatio:                  10.0,
		FinishingRainOrThaw:                true,
		RecentRainHours:                    3,
		SustainedBelowFreezingPreceding36h: false,
		MaxPrecedingTempF:                  38.0,
		SustainedWindMph:                   15.0,
		CurrentBaseDepthInches:             36.0,
	}

	result := CalculatePowderScore(input)
	if result.PowderScore >= 40 {
		t.Errorf("expected score < 40 for storm finishing with rain/thaw, got %d", result.PowderScore)
	}
}

func TestCalculatePowderScore_Determinism(t *testing.T) {
	input := PowderScoreInput{
		Snowfall24hInches:                  8.5,
		Snowfall48hInches:                  1.0,
		SnowToLiquidRatio:                  13.5,
		SustainedBelowFreezingPreceding36h: true,
		SustainedWindMph:                   22.0,
		CurrentBaseDepthInches:             28.0,
		MidMountainElevationFt:             2500,
		FreezingLevelFt:                    2450, // within 200 ft -> should reduce confidence
		EnsemblePredictions:                []float64{8.0, 11.0},
	}

	res1 := CalculatePowderScore(input)
	res2 := CalculatePowderScore(input)

	if res1.PowderScore != res2.PowderScore {
		t.Errorf("expected deterministic score: %d vs %d", res1.PowderScore, res2.PowderScore)
	}
	if res1.ConfidenceInterval != res2.ConfidenceInterval {
		t.Errorf("expected deterministic confidence: %.1f vs %.1f", res1.ConfidenceInterval, res2.ConfidenceInterval)
	}
}

func TestCalculatePowderScore_FreezingLineConfidencePenalty(t *testing.T) {
	// Freezing line within 50 ft of mid mountain
	volatileInput := PowderScoreInput{
		Snowfall24hInches:      6.0,
		SnowToLiquidRatio:      11.0,
		MidMountainElevationFt: 2500,
		FreezingLevelFt:        2520, // 20 ft difference
	}

	clearInput := PowderScoreInput{
		Snowfall24hInches:      6.0,
		SnowToLiquidRatio:      11.0,
		MidMountainElevationFt: 2500,
		FreezingLevelFt:        500, // far below
	}

	volResult := CalculatePowderScore(volatileInput)
	clearResult := CalculatePowderScore(clearInput)

	if volResult.ConfidenceInterval >= clearResult.ConfidenceInterval {
		t.Errorf("expected volatile rain/snow line confidence (%.1f%%) to be lower than clear confidence (%.1f%%)",
			volResult.ConfidenceInterval, clearResult.ConfidenceInterval)
	}
}

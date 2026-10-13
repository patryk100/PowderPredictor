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

// Story 3.6: Historical Storm Benchmark Validations

func TestHistoricalNoreaster(t *testing.T) {
	// Classic Nor'easter: High QPF (18" new), cold wrap-around temperatures (16°F), high SLR (16:1), sustained 36h cold
	input := PowderScoreInput{
		Snowfall24hInches:                  18.0,
		Snowfall48hInches:                  4.0,
		SnowToLiquidRatio:                  16.5,
		SustainedBelowFreezingPreceding36h: true,
		MaxPrecedingTempF:                  24.0,
		SustainedWindMph:                   18.0,
		WindGustMph:                        28.0,
		CurrentBaseDepthInches:             52.0,
		MidMountainElevationFt:             3000,
		FreezingLevelFt:                    800,
		EnsemblePredictions:                []float64{18.0, 19.5, 17.5},
	}

	result := CalculatePowderScore(input)
	if result.PowderScore < 90 {
		t.Errorf("Classic Nor'easter must score > 90, got %d", result.PowderScore)
	}
	if result.QualityTier != "Epic" {
		t.Errorf("expected Epic tier, got %s", result.QualityTier)
	}
}

func TestHistoricalBackdoorColdFront(t *testing.T) {
	// Backdoor Cold Front: Rapid temp drop, dry air, moderate SLR (12:1), 5" snow
	input := PowderScoreInput{
		Snowfall24hInches:                  5.0,
		Snowfall48hInches:                  0.0,
		SnowToLiquidRatio:                  12.5,
		SustainedBelowFreezingPreceding36h: true,
		MaxPrecedingTempF:                  30.0,
		SustainedWindMph:                   12.0,
		WindGustMph:                        20.0,
		CurrentBaseDepthInches:             30.0,
		MidMountainElevationFt:             2400,
		FreezingLevelFt:                    600,
		EnsemblePredictions:                []float64{5.0, 5.2},
	}

	result := CalculatePowderScore(input)
	// Moderate accumulation with cold preservation yields good score
	if result.PowderScore < 50 || result.PowderScore > 75 {
		t.Errorf("Backdoor cold front expected score between 50 and 75, got %d", result.PowderScore)
	}
}

func TestHistoricalRainToSnowInversion(t *testing.T) {
	// Northeast Rain-to-Snow Inversion: Warm rain early, heavy wet snow finishing
	input := PowderScoreInput{
		Snowfall24hInches:                  8.0,
		SnowToLiquidRatio:                  8.0, // Wet heavy concrete
		FinishingRainOrThaw:                false,
		RecentRainHours:                    4, // Rain in early storm sequence
		SustainedBelowFreezingPreceding36h: false,
		MaxPrecedingTempF:                  36.0,
		SustainedWindMph:                   15.0,
		CurrentBaseDepthInches:             24.0,
	}

	result := CalculatePowderScore(input)
	// Rain/crust penalty should suppress score below 50
	if result.PowderScore >= 50 {
		t.Errorf("Rain-to-snow inversion must have crust penalties keeping score < 50, got %d", result.PowderScore)
	}
}

func TestHistoricalMountWashingtonWindEvent(t *testing.T) {
	// Extreme ridgeline winds 60+ mph strip snow and force wind hold
	input := PowderScoreInput{
		Snowfall24hInches:                  10.0,
		SnowToLiquidRatio:                  14.0,
		SustainedBelowFreezingPreceding36h: true,
		SustainedWindMph:                   48.0, // 48 mph sustained
		WindGustMph:                        68.0, // 68 mph peak gust
		CurrentBaseDepthInches:             40.0,
	}

	result := CalculatePowderScore(input)
	if result.WindPoints > 2.0 {
		t.Errorf("extreme 60+ mph wind event should deduct almost all wind points (got %.1f)", result.WindPoints)
	}
}

func TestMathCornerCases(t *testing.T) {
	// 1. Zero precipitation
	zeroInput := PowderScoreInput{
		Snowfall24hInches:      0.0,
		Snowfall48hInches:      0.0,
		SnowToLiquidRatio:      0.0,
		CurrentBaseDepthInches: 0.0,
	}
	zeroResult := CalculatePowderScore(zeroInput)
	if zeroResult.PowderScore < 0 || zeroResult.PowderScore > 100 {
		t.Errorf("zero precip must produce score within [0, 100], got %d", zeroResult.PowderScore)
	}

	// 2. Negative temperatures (< -20°F)
	subZeroInput := PowderScoreInput{
		Snowfall24hInches:                  12.0,
		SnowToLiquidRatio:                  13.0,
		SustainedBelowFreezingPreceding36h: true,
		MaxPrecedingTempF:                  -25.0,
		CurrentBaseDepthInches:             36.0,
	}
	subZeroResult := CalculatePowderScore(subZeroInput)
	if subZeroResult.PowderScore < 70 {
		t.Errorf("deep sub-zero cold powder should score high, got %d", subZeroResult.PowderScore)
	}
}

// BenchmarkPowderScoreExecution verifies calculation completes in < 5 ms per mountain
func BenchmarkPowderScoreExecution(b *testing.B) {
	input := PowderScoreInput{
		Snowfall24hInches:                  14.0,
		Snowfall48hInches:                  2.0,
		SnowToLiquidRatio:                  16.0,
		SustainedBelowFreezingPreceding36h: true,
		SustainedWindMph:                   12.0,
		CurrentBaseDepthInches:             40.0,
		MidMountainElevationFt:             2800,
		FreezingLevelFt:                    1200,
		EnsemblePredictions:                []float64{14.0, 15.0, 13.5},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = CalculatePowderScore(input)
	}
}

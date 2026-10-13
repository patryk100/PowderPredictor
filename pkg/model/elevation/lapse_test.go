package elevation

import (
	"testing"

	"github.com/powderpredictor/operator/pkg/weather"
)

func TestDynamicLapseRate(t *testing.T) {
	// Dry air (RH <= 50%) should yield DryAdiabaticLapseRateFPer1000Ft (5.4)
	if rate := DynamicLapseRate(30.0); rate != 5.4 {
		t.Errorf("expected 5.4 for RH 30%%, got %.2f", rate)
	}

	// Saturated air (RH >= 95%) should yield SaturatedAdiabaticLapseRateFPer1000Ft (3.0)
	if rate := DynamicLapseRate(98.0); rate != 3.0 {
		t.Errorf("expected 3.0 for RH 98%%, got %.2f", rate)
	}

	// Mid saturation (RH 72.5%) should interpolate between 5.4 and 3.0
	midRate := DynamicLapseRate(72.5)
	if midRate <= 3.0 || midRate >= 5.4 {
		t.Errorf("expected intermediate lapse rate for RH 72.5%%, got %.2f", midRate)
	}
}

func TestDownscaleTemperature(t *testing.T) {
	// Base: 1,500 ft at 34°F, Summit: 4,000 ft (Delta: 2,500 ft)
	// Under precipitation (RH 95%, rate ~3.0°F/1000ft):
	// Temp drop = 2.5 * 3.0 = 7.5°F -> Summit temp = 34 - 7.5 = 26.5°F
	summitTemp := DownscaleTemperature(34.0, 1500, 4000, 95.0)
	if summitTemp != 26.5 {
		t.Errorf("expected summit temp 26.5, got %.2f", summitTemp)
	}

	// Bounding checks: extreme altitude should not go below MinimumSanityTemperatureF
	extremeTemp := DownscaleTemperature(0.0, 1000, 50000, 40.0)
	if extremeTemp < MinimumSanityTemperatureF {
		t.Errorf("expected clamped temp >= %.1f, got %.2f", MinimumSanityTemperatureF, extremeTemp)
	}
}

func TestCalculateFreezingLevelElevation(t *testing.T) {
	// Ref: 2,000 ft at 38°F, RH 95% (rate 3.0°F/1000ft)
	// Temp diff = 38 - 32 = 6°F -> delta = (6 * 1000) / 3.0 = 2,000 ft
	// Freezing level should be 2,000 + 2,000 = 4,000 ft
	freezingLevel := CalculateFreezingLevelElevation(38.0, 2000, 95.0)
	if freezingLevel != 4000 {
		t.Errorf("expected freezing level 4000 ft, got %d ft", freezingLevel)
	}
}

func TestDeterminePrecipitationPhase(t *testing.T) {
	if phase := DeterminePrecipitationPhase(36.0); phase != weather.PhaseRain {
		t.Errorf("expected rain for 36°F, got %s", phase)
	}
	if phase := DeterminePrecipitationPhase(33.0); phase != weather.PhaseMixed {
		t.Errorf("expected mixed for 33°F, got %s", phase)
	}
	if phase := DeterminePrecipitationPhase(28.0); phase != weather.PhaseSnow {
		t.Errorf("expected snow for 28°F, got %s", phase)
	}
}

func TestElevationSplitRainSnowLine(t *testing.T) {
	// Killington bounds: Base 1,165 ft, Summit 4,241 ft (Drop: 3,076 ft)
	bounds := weather.ElevationBounds{
		BaseElevationFt:   1165,
		SummitElevationFt: 4241,
	}

	// Base temp 35°F (Rain), RH 95% (Moist adiabatic lapse rate 3.0°F/1000ft)
	// Mid elevation = 2,703 ft (Drop from base: 1,538 ft -> Temp ~ 35 - 4.61 = 30.39°F -> Snow)
	// Summit elevation = 4,241 ft (Drop from base: 3,076 ft -> Temp ~ 35 - 9.23 = 25.77°F -> Snow)
	baseSnap, midSnap, summitSnap := DownscaleTierConditions(
		bounds,
		35.0,
		1165,
		95.0,
		10.0,
		20.0,
		315,
		0.5,
		80.0,
	)

	if baseSnap.Phase != weather.PhaseRain {
		t.Errorf("expected base phase rain, got %s (temp: %.1f°F)", baseSnap.Phase, baseSnap.TemperatureF)
	}
	if midSnap.Phase != weather.PhaseSnow {
		t.Errorf("expected mid phase snow, got %s (temp: %.1f°F)", midSnap.Phase, midSnap.TemperatureF)
	}
	if summitSnap.Phase != weather.PhaseSnow {
		t.Errorf("expected summit phase snow, got %s (temp: %.1f°F)", summitSnap.Phase, summitSnap.TemperatureF)
	}
	if summitSnap.TemperatureF >= baseSnap.TemperatureF {
		t.Errorf("summit temp (%.1f) should be strictly colder than base temp (%.1f)", summitSnap.TemperatureF, baseSnap.TemperatureF)
	}
}

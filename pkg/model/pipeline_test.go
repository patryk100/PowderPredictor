package model

import (
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
	"github.com/powderpredictor/operator/pkg/weather"
)

func TestEvaluateTargetForecast_EmptySnapshot(t *testing.T) {
	target := &weatherv1alpha1.ResortTarget{
		ObjectMeta: metav1.ObjectMeta{
			Name: "stowe",
		},
		Spec: weatherv1alpha1.ResortTargetSpec{
			BaseElevationFt:   1280,
			SummitElevationFt: 4395,
		},
	}

	eval := EvaluateTargetForecast(target, nil, 30.0, nil)
	if eval.PowderScore != 0 {
		t.Errorf("expected 0 powder score for nil snapshot, got %d", eval.PowderScore)
	}
	if eval.QualityTier != "Poor" {
		t.Errorf("expected Poor tier, got %s", eval.QualityTier)
	}
}

func TestEvaluateTargetForecast_ActiveStorm(t *testing.T) {
	target := &weatherv1alpha1.ResortTarget{
		ObjectMeta: metav1.ObjectMeta{
			Name: "jay-peak",
		},
		Spec: weatherv1alpha1.ResortTargetSpec{
			BaseElevationFt:   1815,
			SummitElevationFt: 3968,
			PrimaryAspects: []weatherv1alpha1.Aspect{
				weatherv1alpha1.AspectNorthEast,
				weatherv1alpha1.AspectEast,
			},
		},
	}

	now := time.Now()
	hourly := make([]weather.HourlyAtmosphericSnapshot, 48)
	for i := 0; i < 48; i++ {
		hourly[i] = weather.HourlyAtmosphericSnapshot{
			Timestamp: now.Add(time.Duration(i) * time.Hour),
			Base: weather.AtmosphericTierSnapshot{
				Tier:             weather.ElevationTierBase,
				TemperatureF:     24.0,
				RelativeHumidity: 90.0,
			},
			Summit: weather.AtmosphericTierSnapshot{
				Tier:                 weather.ElevationTierSummit,
				TemperatureF:         17.0,
				WindSpeedMph:         18.0,
				WindGustMph:          28.0,
				WindDirectionDegrees: 315, // NW wind blowing snow into NE/E aspects
				QPFInches:            0.05,
				Phase:                weather.PhaseSnow,
			},
			Isobaric700hPa: &weather.IsobaricLevelData{
				PressureHPa:      700,
				TemperatureC:     -15.0, // Dendritic Growth Zone
				RelativeHumidity: 92.0,
			},
		}
	}

	snap := &weather.UnifiedForecastSnapshot{
		ProviderName:    "openmeteo",
		HourlySnapshots: hourly,
	}

	eval := EvaluateTargetForecast(target, snap, 45.0, []float64{24.0, 26.0})
	if eval.PredictedSnowfallInches <= 0 {
		t.Errorf("expected positive snowfall accumulation, got %.1f", eval.PredictedSnowfallInches)
	}
	if eval.PowderScore < 85 {
		t.Errorf("expected Epic Powder Score >= 85, got %d", eval.PowderScore)
	}
	if !eval.GladesRecommended {
		t.Errorf("expected GladesRecommended to be true for leeward aspect loading")
	}
}

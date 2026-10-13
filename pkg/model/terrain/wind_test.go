package terrain

import (
	"testing"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
)

func TestAspectToAzimuthAndAngle(t *testing.T) {
	if az := AspectToAzimuth(weatherv1alpha1.AspectNorthWest); az != 315.0 {
		t.Errorf("expected 315 for NW, got %.1f", az)
	}
	if az := AspectToAzimuth(weatherv1alpha1.AspectSouthEast); az != 135.0 {
		t.Errorf("expected 135 for SE, got %.1f", az)
	}

	// Angular difference between NW (315) and SE (135) is 180°
	if diff := AngularDifference(315, 135); diff != 180.0 {
		t.Errorf("expected 180 diff, got %.1f", diff)
	}

	// Angular difference across 0° north: 350° and 10° is 20°
	if diff := AngularDifference(350, 10); diff != 20.0 {
		t.Errorf("expected 20 diff, got %.1f", diff)
	}
}

func TestAnalyzeAspects_NWWind(t *testing.T) {
	// Prevailing NW winds (315°) at 30 mph with 45 mph gusts
	aspects := []weatherv1alpha1.Aspect{
		weatherv1alpha1.AspectNorthWest,
		weatherv1alpha1.AspectSouthEast,
		weatherv1alpha1.AspectEast,
	}

	impact := AnalyzeAspects(aspects, 30.0, 45.0, 315)

	if impact.LiftWindHoldRisk != "Moderate" && impact.LiftWindHoldRisk != "High" {
		t.Errorf("expected moderate or high lift risk for 45mph gusts, got %s", impact.LiftWindHoldRisk)
	}

	for _, rep := range impact.AspectReports {
		if rep.Aspect == weatherv1alpha1.AspectNorthWest {
			// Windward
			if rep.Exposure != ExposureWindward {
				t.Errorf("expected NW to be windward, got %s", rep.Exposure)
			}
			if !rep.WindScoured {
				t.Errorf("expected NW to be flagged as wind scoured")
			}
			if rep.AccumulationModifier >= 1.0 {
				t.Errorf("expected scoured modifier < 1.0, got %.2f", rep.AccumulationModifier)
			}
		}
		if rep.Aspect == weatherv1alpha1.AspectSouthEast || rep.Aspect == weatherv1alpha1.AspectEast {
			// Leeward
			if rep.Exposure != ExposureLeeward {
				t.Errorf("expected %s to be leeward, got %s", rep.Aspect, rep.Exposure)
			}
			if !rep.WindLoaded {
				t.Errorf("expected %s to be wind loaded", rep.Aspect)
			}
			// Bonus accumulation modifier (1.1x to 1.3x)
			if rep.AccumulationModifier < 1.1 || rep.AccumulationModifier > 1.3 {
				t.Errorf("expected bonus modifier 1.1-1.3 for %s, got %.2f", rep.Aspect, rep.AccumulationModifier)
			}
		}
	}
}

func TestExtremeWindTriggersHighLiftRisk(t *testing.T) {
	// Wind speed exceeding 45 mph
	impact := AnalyzeAspects([]weatherv1alpha1.Aspect{weatherv1alpha1.AspectEast}, 48.0, 65.0, 300)
	if impact.LiftWindHoldRisk != "High" {
		t.Errorf("expected High lift wind hold risk for sustained 48mph, got %s", impact.LiftWindHoldRisk)
	}
	if impact.WindHoldRiskIndex < 80 {
		t.Errorf("expected WindHoldRiskIndex >= 80, got %d", impact.WindHoldRiskIndex)
	}
}

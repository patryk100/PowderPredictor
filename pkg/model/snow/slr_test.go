package snow

import (
	"testing"

	"github.com/powderpredictor/operator/pkg/weather"
)

func TestAnalyzeDGZ(t *testing.T) {
	// Sounding with 700hPa at -15°C and RH 90%
	sounding := AtmosphericSounding{
		SurfaceTempF: 20.0,
		SurfaceRH:    85.0,
		Level850hPa: &weather.IsobaricLevelData{
			PressureHPa:      850,
			TemperatureC:     -8.0,
			RelativeHumidity: 90.0,
		},
		Level700hPa: &weather.IsobaricLevelData{
			PressureHPa:      700,
			TemperatureC:     -15.0,
			RelativeHumidity: 92.0,
		},
		Level500hPa: &weather.IsobaricLevelData{
			PressureHPa:      500,
			TemperatureC:     -28.0,
			RelativeHumidity: 70.0,
		},
	}

	dgz := AnalyzeDGZ(sounding)
	if !dgz.Present {
		t.Fatalf("expected DGZ to be present")
	}
	if !dgz.Supersaturated {
		t.Errorf("expected DGZ to be supersaturated")
	}
	if dgz.MeanTempC != -15.0 {
		t.Errorf("expected DGZ mean temp -15.0°C, got %.1f°C", dgz.MeanTempC)
	}
}

func TestCalculateSLR_Regimes(t *testing.T) {
	// 1. Deep -15°C saturated DGZ profile with QPF = 1.0 inch -> SLR >= 15 (should be ~20-22)
	deepDGZSounding := AtmosphericSounding{
		SurfaceTempF: 18.0,
		SurfaceRH:    90.0,
		Level850hPa: &weather.IsobaricLevelData{
			PressureHPa:      850,
			TemperatureC:     -13.0,
			RelativeHumidity: 88.0,
		},
		Level700hPa: &weather.IsobaricLevelData{
			PressureHPa:      700,
			TemperatureC:     -15.5,
			RelativeHumidity: 95.0,
		},
	}

	slrDGZ := CalculateSLR(deepDGZSounding)
	if slrDGZ < 15.0 {
		t.Errorf("expected DGZ SLR >= 15.0, got %.1f", slrDGZ)
	}

	snowAcc := CalculateSnowAccumulation(1.0, slrDGZ)
	if snowAcc < 15.0 {
		t.Errorf("expected snow accumulation >= 15.0 inches for 1.0 in QPF, got %.1f inches", snowAcc)
	}

	// 2. Warm / Heavy moisture regime near 33°F -> SLR between 6:1 and 9:1
	warmSounding := AtmosphericSounding{
		SurfaceTempF: 33.0,
		SurfaceRH:    95.0,
		Level850hPa: &weather.IsobaricLevelData{
			PressureHPa:      850,
			TemperatureC:     0.5,
			RelativeHumidity: 95.0,
		},
	}

	slrWarm := CalculateSLR(warmSounding)
	if slrWarm < 6.0 || slrWarm > 9.0 {
		t.Errorf("expected warm SLR between 6.0 and 9.0, got %.1f", slrWarm)
	}

	warmSnowAcc := CalculateSnowAccumulation(1.0, slrWarm)
	if warmSnowAcc > 9.0 || warmSnowAcc < 6.0 {
		t.Errorf("expected warm accumulation between 6.0 and 9.0 inches, got %.1f", warmSnowAcc)
	}

	// 3. Sub-zero cold/dry regime (< 0°F) -> SLR ~ 12:1 to 14:1
	subZeroSounding := AtmosphericSounding{
		SurfaceTempF: -5.0,
		SurfaceRH:    65.0,
	}

	slrSubZero := CalculateSLR(subZeroSounding)
	if slrSubZero < 12.0 || slrSubZero > 14.0 {
		t.Errorf("expected sub-zero SLR between 12.0 and 14.0, got %.1f", slrSubZero)
	}

	// 4. Absence of upper-level moisture saturation drops SLR
	dryUpperSounding := AtmosphericSounding{
		SurfaceTempF: 22.0,
		SurfaceRH:    70.0,
		Level700hPa: &weather.IsobaricLevelData{
			PressureHPa:      700,
			TemperatureC:     -10.0,
			RelativeHumidity: 45.0, // Low upper moisture
		},
	}

	slrDryUpper := CalculateSLR(dryUpperSounding)
	if slrDryUpper >= 15.0 {
		t.Errorf("expected lower SLR due to dry upper levels, got %.1f", slrDryUpper)
	}
}

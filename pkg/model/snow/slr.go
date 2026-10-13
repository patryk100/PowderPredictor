package snow

import (
	"math"

	"github.com/powderpredictor/operator/pkg/weather"
)

const (
	// NortheastClimatologicalBaselineSLR default: 11.0 (11:1)
	NortheastClimatologicalBaselineSLR = 11.0

	// DGZMinTempC and DGZMaxTempC represent the optimal crystal growth thermal window
	// -12°C to -18°C (10.4°F to -0.4°F)
	DGZMinTempC = -18.0
	DGZMaxTempC = -12.0

	// DGZMinRelativeHumidity represents ice supersaturation threshold (80%)
	DGZMinRelativeHumidity = 80.0
)

// AtmosphericSounding encapsulates vertical atmospheric layers for a specific observation or time step
type AtmosphericSounding struct {
	SurfaceTempF       float64
	SurfaceRH          float64
	Level850hPa        *weather.IsobaricLevelData
	Level700hPa        *weather.IsobaricLevelData
	Level500hPa        *weather.IsobaricLevelData
	RimingRiskDetected bool
}

// DGZProfile summarizes Dendritic Growth Zone attributes extracted from sounding data
type DGZProfile struct {
	Present        bool
	ThickLayer     bool    // Whether the DGZ spans multiple vertical levels or significant depth
	MeanTempC      float64 // Average temperature in the DGZ layer
	Supersaturated bool    // Whether RH >= 80% is present in the DGZ
}

// AnalyzeDGZ inspects isobaric sounding levels to detect presence, saturation, and depth of the Dendritic Growth Zone (-12°C to -18°C)
func AnalyzeDGZ(sounding AtmosphericSounding) DGZProfile {
	var inWindowLevels int
	var saturatedLevels int
	var totalTempC float64

	levels := []*weather.IsobaricLevelData{
		sounding.Level850hPa,
		sounding.Level700hPa,
		sounding.Level500hPa,
	}

	for _, lvl := range levels {
		if lvl == nil {
			continue
		}
		if lvl.TemperatureC >= DGZMinTempC && lvl.TemperatureC <= DGZMaxTempC {
			inWindowLevels++
			totalTempC += lvl.TemperatureC
			if lvl.RelativeHumidity >= DGZMinRelativeHumidity {
				saturatedLevels++
			}
		}
	}

	if inWindowLevels == 0 {
		return DGZProfile{
			Present: false,
		}
	}

	meanTemp := totalTempC / float64(inWindowLevels)
	isThick := inWindowLevels >= 2
	isSaturated := saturatedLevels > 0

	return DGZProfile{
		Present:        true,
		ThickLayer:     isThick,
		MeanTempC:      weather.Round(meanTemp, 1),
		Supersaturated: isSaturated,
	}
}

// CalculateSLR computes the dynamic Snow-to-Liquid Ratio based on atmospheric sounding, surface temperature, and DGZ characteristics.
// Transfer function regimes:
// 1. Warm / Heavy regime: Surface temps 30°F–34°F yielding dense 6:1–9:1 snow.
// 2. Deep DGZ regime: Thick DGZ layer coupled with RH >= 80% yields high-ratio powder (15:1 to 22:1+).
// 3. Cold / Dry regime: Sub-zero temps (< 0°F) yielding fine, chalky 12:1–14:1 snow due to crystal fracturing.
// 4. Climatological Northeast baseline: default 10:1–12:1.
func CalculateSLR(sounding AtmosphericSounding) float64 {
	surfaceTemp := sounding.SurfaceTempF
	dgz := AnalyzeDGZ(sounding)

	var slr float64

	// Regime 1: Warm / Heavy wet snow (near freezing 30°F to 34°F)
	if surfaceTemp >= 30.0 && surfaceTemp <= 34.0 {
		// Linear scale: 30°F -> 9:1, 34°F -> 6:1
		t := (surfaceTemp - 30.0) / (34.0 - 30.0)
		slr = 9.0 - t*(9.0-6.0)
		// If moisture/riming is severe, keep ratio low
		return weather.Round(slr, 1)
	}

	// Above 34°F: Mostly rain or heavy slush
	if surfaceTemp > 34.0 {
		return 5.0
	}

	// Regime 2: Optimal Dendritic Growth Zone regime
	if dgz.Present && dgz.Supersaturated {
		if dgz.ThickLayer {
			// Deep dendritic growth layer with saturation: 18:1 - 22:1+
			slr = 20.0
			// Maximum dendrite growth occurs near -15°C
			if math.Abs(dgz.MeanTempC-(-15.0)) <= 1.5 {
				slr = 22.0
			}
		} else {
			// Moderate DGZ presence
			slr = 16.0
		}

		// Adjust for riming or strong surface winds fracturing dendrites
		if sounding.RimingRiskDetected {
			slr = math.Max(12.0, slr-4.0)
		}

		// Adjust for surface temperature if warmer than 25°F
		if surfaceTemp > 25.0 {
			slr = math.Max(12.0, slr-(surfaceTemp-25.0)*0.8)
		}

		return weather.Round(slr, 1)
	}

	// Regime 3: Cold / Dry regime (Sub-zero surface temperatures < 0°F)
	// At extremely cold temperatures, dendrites do not form; smaller plates/columns form with reduced airspace
	if surfaceTemp < 0.0 {
		// Chalky, wind-packable snow: 12:1 to 14:1
		return 13.0
	}

	// Standard Cold Regime (0°F <= surfaceTemp < 30°F without deep saturated DGZ)
	// Base climatological curve peaking around 15°F–20°F
	if surfaceTemp >= 0.0 && surfaceTemp < 15.0 {
		slr = 14.0
	} else if surfaceTemp >= 15.0 && surfaceTemp < 25.0 {
		slr = 12.5
	} else {
		// 25°F <= surfaceTemp < 30°F
		slr = 10.5
	}

	// If upper-level moisture is lacking (RH < 80%), reduce ratio due to riming / graupel
	if sounding.Level700hPa != nil && sounding.Level700hPa.RelativeHumidity < 70.0 {
		slr = math.Max(8.0, slr-2.0)
	}

	return weather.Round(slr, 1)
}

// CalculateSnowAccumulation computes expected snow accumulation in inches from liquid QPF (inches) and SLR
func CalculateSnowAccumulation(qpfInches float64, slr float64) float64 {
	if qpfInches <= 0 || slr <= 0 {
		return 0.0
	}
	return weather.Round(qpfInches*slr, 1)
}

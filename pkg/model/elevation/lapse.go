package elevation

import (
	"math"

	"github.com/powderpredictor/operator/pkg/weather"
)

const (
	// DryAdiabaticLapseRateFPer1000Ft (DALR): ~5.4°F per 1,000 ft (9.8°C / km)
	DryAdiabaticLapseRateFPer1000Ft = 5.4

	// SaturatedAdiabaticLapseRateFPer1000Ft (MALR): ~3.0°F per 1,000 ft (~5.5°C to 6.0°C / km)
	SaturatedAdiabaticLapseRateFPer1000Ft = 3.0

	// IntermediateLapseRateFPer1000Ft: typical standard environmental rate
	StandardLapseRateFPer1000Ft = 3.5

	// MinimumSanityTemperatureF prevents runaway negative temps from extreme high-altitude extrapolation
	MinimumSanityTemperatureF = -50.0

	// MaximumSanityTemperatureF prevents runaway hot temps
	MaximumSanityTemperatureF = 110.0
)

// DynamicLapseRate calculates environmental lapse rate in °F per 1,000 ft based on Relative Humidity (0 - 100).
// When RH < 80%, uses dry/unsaturated rate (~5.4°F / 1,000 ft).
// When RH >= 80% (saturated / precipitation events), smoothly transitions down to moist adiabatic rate (~3.0°F - 3.5°F / 1,000 ft).
func DynamicLapseRate(relativeHumidity float64) float64 {
	// Clamp relative humidity between 0 and 100
	rh := math.Max(0, math.Min(100, relativeHumidity))

	if rh <= 50.0 {
		return DryAdiabaticLapseRateFPer1000Ft
	}

	if rh >= 95.0 {
		return SaturatedAdiabaticLapseRateFPer1000Ft
	}

	// Smooth linear interpolation between RH 50% (5.4°F/1000ft) and RH 95% (3.0°F/1000ft)
	t := (rh - 50.0) / (95.0 - 50.0)
	rate := DryAdiabaticLapseRateFPer1000Ft - t*(DryAdiabaticLapseRateFPer1000Ft-SaturatedAdiabaticLapseRateFPer1000Ft)
	return weather.Round(rate, 2)
}

// DownscaleTemperature calculates temperature at targetElevationFt given a reference temperature at referenceElevationFt
// and relative humidity, applying dynamic lapse rate downscaling and sanity bounds.
func DownscaleTemperature(refTempF float64, refElevationFt, targetElevationFt int, relativeHumidity float64) float64 {
	rate := DynamicLapseRate(relativeHumidity)
	elevationDeltaFt := float64(targetElevationFt - refElevationFt)
	tempDrop := (elevationDeltaFt / 1000.0) * rate
	downscaled := refTempF - tempDrop

	// Sanity bounds check
	if downscaled < MinimumSanityTemperatureF {
		downscaled = MinimumSanityTemperatureF
	} else if downscaled > MaximumSanityTemperatureF {
		downscaled = MaximumSanityTemperatureF
	}

	return weather.Round(downscaled, 2)
}

// CalculateFreezingLevelElevation calculates the altitude (in ft) of the 32°F (0°C) isotherm
// based on reference elevation and temperature with relative humidity lapse rate.
// Returns an estimated elevation in ft.
func CalculateFreezingLevelElevation(refTempF float64, refElevationFt int, relativeHumidity float64) int {
	rate := DynamicLapseRate(relativeHumidity)
	if rate <= 0 {
		rate = StandardLapseRateFPer1000Ft
	}

	// 32 = refTempF - (deltaFt / 1000) * rate
	// deltaFt = (refTempF - 32) * 1000 / rate
	tempDiff := refTempF - 32.0
	deltaFt := (tempDiff * 1000.0) / rate

	freezingElev := float64(refElevationFt) + deltaFt
	if freezingElev < 0 {
		return 0
	}
	return int(math.Round(freezingElev))
}

// DeterminePrecipitationPhase models the precipitation type at an elevation tier
// based on temperature (°F) and wet-bulb/freezing-level characteristics.
// Rules:
// - T < 32°F: Snow
// - 32°F <= T <= 34°F: Mixed / Sleet / Freezing Rain
// - T > 34°F: Rain
func DeterminePrecipitationPhase(tempF float64) weather.PrecipitationPhase {
	if tempF < 32.0 {
		return weather.PhaseSnow
	}
	if tempF <= 34.0 {
		return weather.PhaseMixed
	}
	return weather.PhaseRain
}

// DownscaleTierConditions downscales a reference atmospheric condition across the 3 mountain elevation tiers:
// Base, Mid, and Summit.
func DownscaleTierConditions(
	bounds weather.ElevationBounds,
	refTempF float64,
	refElevationFt int,
	relativeHumidity float64,
	windSpeedMph float64,
	windGustMph float64,
	windDirDegrees int,
	qpfInches float64,
	precipProb float64,
) (baseSnap, midSnap, summitSnap weather.AtmosphericTierSnapshot) {
	midElevationFt := bounds.MidElevationFt()
	freezingLevelFt := CalculateFreezingLevelElevation(refTempF, refElevationFt, relativeHumidity)

	buildTier := func(tier weather.ElevationTier, elevFt int) weather.AtmosphericTierSnapshot {
		tempF := DownscaleTemperature(refTempF, refElevationFt, elevFt, relativeHumidity)
		tempC := weather.FahrenheitToCelsius(tempF)
		phase := DeterminePrecipitationPhase(tempF)

		// Simple elevation lapse for dew point assuming similar depression
		dewPointF := weather.Round(tempF-(100.0-relativeHumidity)/5.0, 2)
		dewPointC := weather.FahrenheitToCelsius(dewPointF)

		// Wind speed typically increases with elevation (rough terrain exposure factor)
		tierWindSpeed := windSpeedMph
		tierWindGust := windGustMph
		if elevFt > bounds.BaseElevationFt && bounds.SummitElevationFt > bounds.BaseElevationFt {
			ratio := float64(elevFt-bounds.BaseElevationFt) / float64(bounds.SummitElevationFt-bounds.BaseElevationFt)
			tierWindSpeed = weather.Round(windSpeedMph*(1.0+0.5*ratio), 1)
			tierWindGust = weather.Round(windGustMph*(1.0+0.5*ratio), 1)
		}

		// Elevation precipitation enhancement (orographic lift factor up to 20% at summit)
		tierQPF := qpfInches
		if elevFt > bounds.BaseElevationFt && bounds.SummitElevationFt > bounds.BaseElevationFt {
			ratio := float64(elevFt-bounds.BaseElevationFt) / float64(bounds.SummitElevationFt-bounds.BaseElevationFt)
			tierQPF = weather.Round(qpfInches*(1.0+0.2*ratio), 3)
		}

		return weather.AtmosphericTierSnapshot{
			Tier:                     tier,
			ElevationFt:              elevFt,
			TemperatureF:             tempF,
			TemperatureC:             tempC,
			DewPointF:                dewPointF,
			DewPointC:                dewPointC,
			RelativeHumidity:         relativeHumidity,
			WindSpeedMph:             tierWindSpeed,
			WindGustMph:              tierWindGust,
			WindDirectionDegrees:     windDirDegrees,
			FreezingLevelElevationFt: freezingLevelFt,
			QPFInches:                tierQPF,
			PrecipitationProbability: precipProb,
			Phase:                    phase,
		}
	}

	baseSnap = buildTier(weather.ElevationTierBase, bounds.BaseElevationFt)
	midSnap = buildTier(weather.ElevationTierMid, midElevationFt)
	summitSnap = buildTier(weather.ElevationTierSummit, bounds.SummitElevationFt)
	return baseSnap, midSnap, summitSnap
}

package weather

import (
	"math"
)

const (
	// Standard atmospheric lapse rate in °F per 1,000 feet
	StandardLapseRateFPer1000Ft = 3.5

	// Meters to feet conversion factor
	MetersToFeetFactor = 3.28084

	// Millimeters to inches conversion factor
	MmToInchesFactor = 0.0393701

	// Meters per second to miles per hour
	MpsToMphFactor = 2.23694

	// Meters per second to knots
	MpsToKnotsFactor = 1.94384

	// Knots to miles per hour
	KnotsToMphFactor = 1.15078
)

// Round rounds float64 to precision decimal places
func Round(val float64, precision int) float64 {
	ratio := math.Pow(10, float64(precision))
	return math.Round(val*ratio) / ratio
}

// CelsiusToFahrenheit converts temperature from Celsius to Fahrenheit
func CelsiusToFahrenheit(c float64) float64 {
	return Round((c*9.0/5.0)+32.0, 2)
}

// FahrenheitToCelsius converts temperature from Fahrenheit to Celsius
func FahrenheitToCelsius(f float64) float64 {
	return Round((f-32.0)*5.0/9.0, 2)
}

// KelvinToCelsius converts Kelvin to Celsius
func KelvinToCelsius(k float64) float64 {
	return Round(k-273.15, 2)
}

// KelvinToFahrenheit converts Kelvin to Fahrenheit
func KelvinToFahrenheit(k float64) float64 {
	return CelsiusToFahrenheit(KelvinToCelsius(k))
}

// MillimetersToInches converts millimeters of precipitation to inches
func MillimetersToInches(mm float64) float64 {
	return Round(mm*MmToInchesFactor, 3)
}

// InchesToMillimeters converts inches of precipitation to millimeters
func InchesToMillimeters(in float64) float64 {
	return Round(in/MmToInchesFactor, 2)
}

// MetersToFeet converts altitude from meters to feet
func MetersToFeet(m float64) int {
	return int(math.Round(m * MetersToFeetFactor))
}

// FeetToMeters converts altitude from feet to meters
func FeetToMeters(ft int) float64 {
	return Round(float64(ft)/MetersToFeetFactor, 1)
}

// MpsToMph converts wind speed from meters per second to miles per hour
func MpsToMph(mps float64) float64 {
	return Round(mps*MpsToMphFactor, 1)
}

// KnotsToMph converts knots to miles per hour
func KnotsToMph(knots float64) float64 {
	return Round(knots*KnotsToMphFactor, 1)
}

// MpsToKnots converts meters per second to knots
func MpsToKnots(mps float64) float64 {
	return Round(mps*MpsToKnotsFactor, 1)
}

// DownscaleTemperatureByElevation applies standard atmospheric environmental lapse rate
// (3.5°F / 1000 ft or ~1.98°C / 1000 ft) between two elevations.
func DownscaleTemperatureByElevation(baseTempF float64, fromElevationFt, toElevationFt int) float64 {
	elevationDeltaFt := float64(toElevationFt - fromElevationFt)
	tempDrop := (elevationDeltaFt / 1000.0) * StandardLapseRateFPer1000Ft
	return Round(baseTempF-tempDrop, 2)
}

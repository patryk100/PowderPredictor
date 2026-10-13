package weather_test

import (
	"testing"

	"github.com/powderpredictor/operator/pkg/weather"
)

func TestConversions(t *testing.T) {
	tests := []struct {
		name string
		run  func(t *testing.T)
	}{
		{
			name: "Celsius to Fahrenheit",
			run: func(t *testing.T) {
				if got := weather.CelsiusToFahrenheit(0); got != 32.0 {
					t.Errorf("CelsiusToFahrenheit(0) = %v, want 32.0", got)
				}
				if got := weather.CelsiusToFahrenheit(100); got != 212.0 {
					t.Errorf("CelsiusToFahrenheit(100) = %v, want 212.0", got)
				}
				if got := weather.CelsiusToFahrenheit(-40); got != -40.0 {
					t.Errorf("CelsiusToFahrenheit(-40) = %v, want -40.0", got)
				}
				if got := weather.CelsiusToFahrenheit(-15); got != 5.0 {
					t.Errorf("CelsiusToFahrenheit(-15) = %v, want 5.0", got)
				}
			},
		},
		{
			name: "Fahrenheit to Celsius",
			run: func(t *testing.T) {
				if got := weather.FahrenheitToCelsius(32); got != 0.0 {
					t.Errorf("FahrenheitToCelsius(32) = %v, want 0.0", got)
				}
				if got := weather.FahrenheitToCelsius(212); got != 100.0 {
					t.Errorf("FahrenheitToCelsius(212) = %v, want 100.0", got)
				}
				if got := weather.FahrenheitToCelsius(5); got != -15.0 {
					t.Errorf("FahrenheitToCelsius(5) = %v, want -15.0", got)
				}
			},
		},
		{
			name: "Kelvin Conversions",
			run: func(t *testing.T) {
				if got := weather.KelvinToCelsius(273.15); got != 0.0 {
					t.Errorf("KelvinToCelsius(273.15) = %v, want 0.0", got)
				}
				if got := weather.KelvinToFahrenheit(273.15); got != 32.0 {
					t.Errorf("KelvinToFahrenheit(273.15) = %v, want 32.0", got)
				}
			},
		},
		{
			name: "Precipitation mm to inches",
			run: func(t *testing.T) {
				if got := weather.MillimetersToInches(25.4); got != 1.0 {
					t.Errorf("MillimetersToInches(25.4) = %v, want 1.0", got)
				}
				if got := weather.InchesToMillimeters(1.0); got != 25.4 {
					t.Errorf("InchesToMillimeters(1.0) = %v, want 25.4", got)
				}
			},
		},
		{
			name: "Meters to feet",
			run: func(t *testing.T) {
				if got := weather.MetersToFeet(1000); got != 3281 {
					t.Errorf("MetersToFeet(1000) = %v, want 3281", got)
				}
				if got := weather.FeetToMeters(3281); got < 999.0 || got > 1001.0 {
					t.Errorf("FeetToMeters(3281) = %v, want ~1000.0", got)
				}
			},
		},
		{
			name: "Wind Speed conversions",
			run: func(t *testing.T) {
				if got := weather.MpsToMph(10); got != 22.4 {
					t.Errorf("MpsToMph(10) = %v, want 22.4", got)
				}
				if got := weather.KnotsToMph(10); got != 11.5 {
					t.Errorf("KnotsToMph(10) = %v, want 11.5", got)
				}
				if got := weather.MpsToKnots(10); got != 19.4 {
					t.Errorf("MpsToKnots(10) = %v, want 19.4", got)
				}
			},
		},
		{
			name: "Temperature Downscaling By Elevation",
			run: func(t *testing.T) {
				// Base elevation 1000 ft, Summit 4000 ft -> 3000 ft delta -> 3 * 3.5 = 10.5°F drop
				baseTemp := 34.0
				summitTemp := weather.DownscaleTemperatureByElevation(baseTemp, 1000, 4000)
				if summitTemp != 23.5 {
					t.Errorf("DownscaleTemperatureByElevation(34.0, 1000, 4000) = %v, want 23.5", summitTemp)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, tt.run)
	}
}

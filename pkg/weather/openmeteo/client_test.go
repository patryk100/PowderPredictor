package openmeteo_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/powderpredictor/operator/pkg/weather"
	"github.com/powderpredictor/operator/pkg/weather/openmeteo"
)

func TestOpenMeteoClient(t *testing.T) {
	mux := http.NewServeMux()

	mux.HandleFunc("/v1/forecast", func(w http.ResponseWriter, r *http.Request) {
		elev := r.URL.Query().Get("elevation")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)

		temp := 2.0 // ~35.6°F for base
		snow := 0.0
		if elev == "1219.2" { // summit (~4000 ft)
			temp = -4.0 // ~24.8°F for summit
			snow = 5.0  // 5 cm snow
		}

		_, _ = w.Write([]byte(`{
			"elevation": 1000,
			"hourly": {
				"time": ["2026-10-15T00:00"],
				"temperature_2m": [` + serializeFloat(temp) + `],
				"relative_humidity_2m": [85],
				"dew_point_2m": [-1],
				"precipitation_probability": [90],
				"precipitation": [5.0],
				"snowfall": [` + serializeFloat(snow) + `],
				"freezing_level_height": [800],
				"wind_speed_10m": [25],
				"wind_gusts_10m": [40],
				"wind_direction_10m": [310],
				"temperature_850hPa": [-3.5],
				"relative_humidity_850hPa": [80],
				"wind_speed_850hPa": [35],
				"geopotential_height_850hPa": [1450],
				"temperature_700hPa": [-9.0],
				"relative_humidity_700hPa": [75],
				"wind_speed_700hPa": [45],
				"geopotential_height_700hPa": [3000]
			}
		}`))
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	client := openmeteo.NewClient(
		openmeteo.WithBaseURL(server.URL+"/v1/forecast"),
		openmeteo.WithHTTPClient(server.Client()),
	)

	coords := weather.Coordinates{Latitude: 44.5, Longitude: -72.8}
	elev := weather.ElevationBounds{BaseElevationFt: 1500, SummitElevationFt: 4000}

	snapshot, err := client.FetchForecast(context.Background(), coords, elev)
	if err != nil {
		t.Fatalf("FetchForecast failed: %v", err)
	}

	if len(snapshot.HourlySnapshots) != 1 {
		t.Fatalf("expected 1 snapshot, got %d", len(snapshot.HourlySnapshots))
	}

	h := snapshot.HourlySnapshots[0]
	// Base is ~35.6°F -> Rain
	if h.Base.TemperatureF <= 32.0 {
		t.Errorf("expected base temp > 32F, got %v", h.Base.TemperatureF)
	}

	// Summit is ~24.8°F -> Snow
	if h.Summit.TemperatureF > 32.0 {
		t.Errorf("expected summit temp <= 32F, got %v", h.Summit.TemperatureF)
	}
	if h.Summit.Phase != weather.PhaseSnow {
		t.Errorf("expected summit phase snow, got %v", h.Summit.Phase)
	}
	if h.Summit.SnowfallInches <= 0 {
		t.Errorf("expected summit snow > 0, got %v", h.Summit.SnowfallInches)
	}

	// Check isobaric pressure layers
	if h.Isobaric850hPa == nil || h.Isobaric850hPa.PressureHPa != 850 {
		t.Errorf("expected 850hPa sounding layer present")
	}
	if h.Isobaric700hPa == nil || h.Isobaric700hPa.PressureHPa != 700 {
		t.Errorf("expected 700hPa sounding layer present")
	}
}

func serializeFloat(f float64) string {
	return fmt.Sprintf("%.1f", f)
}

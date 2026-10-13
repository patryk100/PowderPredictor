package nws_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/powderpredictor/operator/pkg/weather"
	"github.com/powderpredictor/operator/pkg/weather/nws"
)

func TestNWSClient(t *testing.T) {
	mux := http.NewServeMux()

	// Mock /points/{lat},{lon}
	mux.HandleFunc("/points/44.5000,-72.8000", func(w http.ResponseWriter, r *http.Request) {
		if ua := r.Header.Get("User-Agent"); ua == "" {
			t.Errorf("Missing User-Agent header")
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{
			"properties": {
				"gridId": "BTV",
				"gridX": 95,
				"gridY": 65,
				"forecastHourly": ""
			}
		}`))
	})

	// Mock /gridpoints/BTV/95,65/forecast/hourly
	mux.HandleFunc("/gridpoints/BTV/95,65/forecast/hourly", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{
			"properties": {
				"generatedAt": "2026-10-15T00:00:00Z",
				"periods": [
					{
						"number": 1,
						"startTime": "2026-10-15T01:00:00Z",
						"endTime": "2026-10-15T02:00:00Z",
						"temperature": 34,
						"temperatureUnit": "F",
						"probabilityOfPrecipitation": { "value": 80 },
						"relativeHumidity": { "value": 90 },
						"windSpeed": "15 mph",
						"windGust": "25 mph",
						"shortForecast": "Snow Likely"
					}
				]
			}
		}`))
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	client := nws.NewClient(
		nws.WithBaseURL(server.URL),
		nws.WithHTTPClient(server.Client()),
	)

	coords := weather.Coordinates{Latitude: 44.5, Longitude: -72.8}
	elev := weather.ElevationBounds{BaseElevationFt: 1500, SummitElevationFt: 4000}

	snapshot, err := client.FetchForecast(context.Background(), coords, elev)
	if err != nil {
		t.Fatalf("FetchForecast failed: %v", err)
	}

	if len(snapshot.HourlySnapshots) != 1 {
		t.Fatalf("expected 1 hourly snapshot, got %d", len(snapshot.HourlySnapshots))
	}

	h := snapshot.HourlySnapshots[0]
	if h.Base.TemperatureF != 34.0 {
		t.Errorf("expected Base Temp 34.0, got %v", h.Base.TemperatureF)
	}

	// 2500 ft vertical drop -> 2.5 * 3.5 = 8.75 drop -> 34 - 8.75 = 25.25°F
	if h.Summit.TemperatureF != 25.25 {
		t.Errorf("expected Summit Temp 25.25, got %v", h.Summit.TemperatureF)
	}

	if h.Summit.Phase != weather.PhaseSnow {
		t.Errorf("expected Summit phase snow, got %v", h.Summit.Phase)
	}

	if h.Summit.SnowfallInches <= 0 {
		t.Errorf("expected Summit snowfall accumulation > 0, got %v", h.Summit.SnowfallInches)
	}
}

func TestNWSErrorHandling(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/points/44.0000,-72.0000", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	})
	mux.HandleFunc("/points/45.0000,-71.0000", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	client := nws.NewClient(
		nws.WithBaseURL(server.URL),
		nws.WithHTTPClient(server.Client()),
	)

	// 503 test
	_, err := client.FetchForecast(context.Background(), weather.Coordinates{Latitude: 44.0, Longitude: -72.0}, weather.ElevationBounds{})
	if err == nil {
		t.Fatal("expected error on 503, got nil")
	}

	// 429 rate limit test
	_, err = client.FetchForecast(context.Background(), weather.Coordinates{Latitude: 45.0, Longitude: -71.0}, weather.ElevationBounds{})
	if err != weather.ErrRateLimited {
		t.Fatalf("expected ErrRateLimited on 429, got %v", err)
	}
}

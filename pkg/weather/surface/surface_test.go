package surface_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/powderpredictor/operator/pkg/weather"
	"github.com/powderpredictor/operator/pkg/weather/surface/elevation"
	"github.com/powderpredictor/operator/pkg/weather/surface/mesonet"
	"github.com/powderpredictor/operator/pkg/weather/surface/snotel"
)

func TestMesonetClient(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/stations/MWO/current", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"station_id": "MWO",
			"station_name": "Mount Washington Summit",
			"latitude": 44.2705,
			"longitude": -71.3033,
			"elevation_ft": 6288,
			"timestamp": "2026-10-15T12:00:00Z",
			"temperature_f": 14.5,
			"wind_speed_mph": 65.0,
			"wind_gust_mph": 85.0,
			"wind_direction_deg": 315,
			"rime_flag": true
		}`))
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	client := mesonet.NewClient(
		mesonet.WithBaseURL(server.URL),
		mesonet.WithHTTPClient(server.Client()),
	)

	snap, err := client.FetchCurrentTelemetry(context.Background(), "MWO")
	if err != nil {
		t.Fatalf("FetchCurrentTelemetry failed: %v", err)
	}

	if snap.StationID != "MWO" {
		t.Errorf("expected station MWO, got %s", snap.StationID)
	}
	if snap.WindGustMph != 85.0 {
		t.Errorf("expected gust 85.0, got %v", snap.WindGustMph)
	}
	if !snap.RimeIndicator {
		t.Errorf("expected rime indicator true")
	}

	// Calculate distance to Wildcat Mountain (44.2639, -71.2392)
	wildcatCoords := weather.Coordinates{Latitude: 44.2639, Longitude: -71.2392}
	dist := weather.HaversineDistanceMiles(snap.Coordinates, wildcatCoords)
	if dist <= 0 || dist > 10.0 {
		t.Errorf("expected distance within 10 miles, got %v", dist)
	}
}

func TestSnotelClient(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/data/MANSFIELD_VT", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Simulate observation from 1 hour ago (fresh)
		obsTime := time.Now().Add(-1 * time.Hour).Format(time.RFC3339)
		_, _ = w.Write([]byte(`{
			"station_triplet": "MANSFIELD_VT",
			"station_name": "Mt Mansfield Snow Stake",
			"latitude": 44.5303,
			"longitude": -72.8144,
			"elevation_ft": 3950,
			"obs_date": "` + obsTime + `",
			"snow_water_equivalent_in": 4.5,
			"snow_depth_in": 28.0,
			"snow_depth_24h_delta_in": 12.0,
			"air_temp_f": 22.0
		}`))
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	client := snotel.NewClient(
		snotel.WithBaseURL(server.URL),
		snotel.WithHTTPClient(server.Client()),
	)

	snap, err := client.FetchCurrentTelemetry(context.Background(), "MANSFIELD_VT")
	if err != nil {
		t.Fatalf("FetchCurrentTelemetry failed: %v", err)
	}

	if snap.SnowDepthInches != 28.0 {
		t.Errorf("expected depth 28.0, got %v", snap.SnowDepthInches)
	}
	if snap.SnowDepthChange24hInches != 12.0 {
		t.Errorf("expected delta 12.0, got %v", snap.SnowDepthChange24hInches)
	}
	if snap.TelemetryStale {
		t.Errorf("expected telemetry not stale for 1 hour old data")
	}

	// Verify staleness evaluation for old data
	snap.Timestamp = time.Now().Add(-5 * time.Hour)
	if !snap.IsStale(4 * time.Hour) {
		t.Errorf("expected IsStale true for 5 hour old data")
	}
}

func TestUSGSElevationClient(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"value": 4241.0,
			"units": "Feet"
		}`))
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	client := elevation.NewClient(
		elevation.WithBaseURL(server.URL+"/v1/json"),
		elevation.WithHTTPClient(server.Client()),
	)

	elev, err := client.LookupElevationFt(context.Background(), weather.Coordinates{Latitude: 43.6263, Longitude: -72.7969})
	if err != nil {
		t.Fatalf("LookupElevationFt failed: %v", err)
	}

	if elev != 4241 {
		t.Errorf("expected elevation 4241 ft, got %d", elev)
	}
}

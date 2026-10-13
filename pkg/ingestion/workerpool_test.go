package ingestion_test

import (
	"context"
	"testing"
	"time"

	"github.com/powderpredictor/operator/pkg/ingestion"
	"github.com/powderpredictor/operator/pkg/testutil"
	"github.com/powderpredictor/operator/pkg/weather"
	"github.com/powderpredictor/operator/pkg/weather/nws"
	"github.com/powderpredictor/operator/pkg/weather/openmeteo"
)

func TestIngestionPipelineWithMockServer(t *testing.T) {
	mockServer := testutil.NewMockWeatherServer(testutil.ScenarioNoreaster)
	defer mockServer.Close()

	noaaClient := nws.NewClient(
		nws.WithBaseURL(mockServer.URL()),
	)
	openMeteoClient := openmeteo.NewClient(
		openmeteo.WithBaseURL(mockServer.URL() + "/v1/forecast"),
	)

	pipeline := ingestion.NewIngestionPipeline(noaaClient, openMeteoClient, 4)

	coords := weather.Coordinates{Latitude: 44.53, Longitude: -72.78}
	elev := weather.ElevationBounds{BaseElevationFt: 1280, SummitElevationFt: 4395}

	res, err := pipeline.IngestTarget(context.Background(), "stowe", coords, elev)
	if err != nil {
		t.Fatalf("IngestTarget failed: %v", err)
	}

	if !res.NOAAHealthy {
		t.Errorf("expected NOAAHealthy to be true")
	}
	if !res.OpenMeteoHealthy {
		t.Errorf("expected OpenMeteoHealthy to be true")
	}
	if res.Snapshot == nil {
		t.Fatalf("expected non-nil UnifiedForecastSnapshot")
	}
	if res.Snapshot.TotalSummitSnowfallInches <= 0 {
		t.Errorf("expected Nor'easter summit snowfall > 0, got %v", res.Snapshot.TotalSummitSnowfallInches)
	}
}

func TestIngestionPipelinePartialFailure(t *testing.T) {
	mockServer := testutil.NewMockWeatherServer(testutil.ScenarioColdSnap)
	defer mockServer.Close()

	// Working Open-Meteo, failing NOAA (pointing to invalid host)
	noaaFailing := nws.NewClient(
		nws.WithBaseURL("http://127.0.0.1:54321/nonexistent"),
	)
	openMeteoWorking := openmeteo.NewClient(
		openmeteo.WithBaseURL(mockServer.URL() + "/v1/forecast"),
	)

	pipeline := ingestion.NewIngestionPipeline(noaaFailing, openMeteoWorking, 2)

	coords := weather.Coordinates{Latitude: 44.53, Longitude: -72.78}
	elev := weather.ElevationBounds{BaseElevationFt: 1280, SummitElevationFt: 4395}

	res, err := pipeline.IngestTarget(context.Background(), "stowe", coords, elev)
	if err != nil {
		t.Fatalf("expected successful fallback, got err: %v", err)
	}

	if res.NOAAHealthy {
		t.Errorf("expected NOAAHealthy to be false")
	}
	if !res.OpenMeteoHealthy {
		t.Errorf("expected OpenMeteoHealthy to be true")
	}
	if res.Snapshot == nil {
		t.Fatalf("expected fallback snapshot to be present")
	}
}

func TestConcurrentIngestionBurst(t *testing.T) {
	mockServer := testutil.NewMockWeatherServer(testutil.ScenarioNoreaster)
	defer mockServer.Close()

	openMeteoClient := openmeteo.NewClient(
		openmeteo.WithBaseURL(mockServer.URL() + "/v1/forecast"),
	)
	pipeline := ingestion.NewIngestionPipeline(nil, openMeteoClient, 8)

	start := time.Now()
	numTargets := 20
	errChan := make(chan error, numTargets)

	for i := 0; i < numTargets; i++ {
		go func(idx int) {
			coords := weather.Coordinates{Latitude: 44.0 + float64(idx)*0.01, Longitude: -72.0}
			elev := weather.ElevationBounds{BaseElevationFt: 1000, SummitElevationFt: 3500}
			_, err := pipeline.IngestTarget(context.Background(), "resort", coords, elev)
			errChan <- err
		}(i)
	}

	for i := 0; i < numTargets; i++ {
		if err := <-errChan; err != nil {
			t.Fatalf("concurrent target %d failed: %v", i, err)
		}
	}

	elapsed := time.Since(start)
	if elapsed > 10*time.Second {
		t.Errorf("expected 20 targets to complete within 10s under warm mock conditions, took %v", elapsed)
	}
}

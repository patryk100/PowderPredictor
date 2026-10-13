package ingestion

import (
	"context"
	"fmt"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/powderpredictor/operator/pkg/weather"
)

// PipelineResult encapsulates aggregated multi-provider meteorological results for a target
type PipelineResult struct {
	ResortName       string
	Coordinates      weather.Coordinates
	Elevations       weather.ElevationBounds
	FetchedAt        time.Time
	NOAAHealthy      bool
	OpenMeteoHealthy bool
	Snapshot         *weather.UnifiedForecastSnapshot
	Errors           []error
}

// IngestionPipeline manages concurrency-bounded multi-source weather ingestion
type IngestionPipeline struct {
	noaaProvider      weather.WeatherProvider
	openMeteoProvider weather.WeatherProvider
	sem               chan struct{} // Concurrency semaphore
}

// NewIngestionPipeline constructs an ingestion pipeline with bounded worker concurrency
func NewIngestionPipeline(noaa, openmeteo weather.WeatherProvider, maxConcurrency int) *IngestionPipeline {
	if maxConcurrency <= 0 {
		maxConcurrency = 8 // Default max 8 parallel network fetches
	}
	return &IngestionPipeline{
		noaaProvider:      noaa,
		openMeteoProvider: openmeteo,
		sem:               make(chan struct{}, maxConcurrency),
	}
}

// IngestTarget runs parallel queries against available weather providers for a mountain target
func (p *IngestionPipeline) IngestTarget(ctx context.Context, resortName string, coords weather.Coordinates, elev weather.ElevationBounds) (*PipelineResult, error) {
	// Acquire concurrency slot
	select {
	case p.sem <- struct{}{}:
		defer func() { <-p.sem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	result := &PipelineResult{
		ResortName:  resortName,
		Coordinates: coords,
		Elevations:  elev,
		FetchedAt:   time.Now(),
	}

	var mu sync.Mutex
	var noaaSnap *weather.UnifiedForecastSnapshot
	var openMeteoSnap *weather.UnifiedForecastSnapshot

	g, gCtx := errgroup.WithContext(ctx)

	// Fetch from NOAA NWS if configured
	if p.noaaProvider != nil {
		g.Go(func() error {
			snap, err := p.noaaProvider.FetchForecast(gCtx, coords, elev)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				result.Errors = append(result.Errors, fmt.Errorf("noaa error: %w", err))
				result.NOAAHealthy = false
			} else {
				noaaSnap = snap
				result.NOAAHealthy = true
			}
			return nil // do not abort other providers on single failure
		})
	}

	// Fetch from Open-Meteo if configured
	if p.openMeteoProvider != nil {
		g.Go(func() error {
			snap, err := p.openMeteoProvider.FetchForecast(gCtx, coords, elev)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				result.Errors = append(result.Errors, fmt.Errorf("open-meteo error: %w", err))
				result.OpenMeteoHealthy = false
			} else {
				openMeteoSnap = snap
				result.OpenMeteoHealthy = true
			}
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	// Multi-source synthesis: prefer Open-Meteo for physical mountain elevation sounding,
	// fall back to NOAA or blend accumulations
	if openMeteoSnap != nil {
		result.Snapshot = openMeteoSnap
		if noaaSnap != nil {
			// Blend predictions: average total summit snowfall
			result.Snapshot.TotalSummitSnowfallInches = weather.Round(
				(openMeteoSnap.TotalSummitSnowfallInches+noaaSnap.TotalSummitSnowfallInches)/2.0, 1)
		}
	} else if noaaSnap != nil {
		result.Snapshot = noaaSnap
	} else {
		// All providers failed
		return result, fmt.Errorf("%w: all meteorological providers failed", weather.ErrProviderUnavailable)
	}

	return result, nil
}

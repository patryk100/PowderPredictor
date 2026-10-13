package snotel

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/powderpredictor/operator/pkg/weather"
)

const (
	defaultTimeout = 10 * time.Second
)

// Client queries USDA NRCS SNOTEL stations and snow telemetry networks
type Client struct {
	httpClient *http.Client
	baseURL    string
}

// Option configures the snotel client
type Option func(*Client)

func WithHTTPClient(c *http.Client) Option {
	return func(client *Client) {
		client.httpClient = c
	}
}

func WithBaseURL(url string) Option {
	return func(client *Client) {
		client.baseURL = url
	}
}

// NewClient creates a SNOTEL surface telemetry client
func NewClient(opts ...Option) *Client {
	c := &Client{
		httpClient: &http.Client{Timeout: defaultTimeout},
		baseURL:    "https://api.powderpredictor.io/snotel/v1",
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

func (c *Client) Name() string {
	return "SNOTEL-NRCS"
}

// SnotelReport matches SNOTEL station daily/hourly snowpack observations
type SnotelReport struct {
	StationTriplet   string    `json:"station_triplet"`
	StationName      string    `json:"station_name"`
	Latitude         float64   `json:"latitude"`
	Longitude        float64   `json:"longitude"`
	ElevationFt      int       `json:"elevation_ft"`
	ObsDate          time.Time `json:"obs_date"`
	SnowWaterEquivIn float64   `json:"snow_water_equivalent_in"`
	SnowDepthIn      float64   `json:"snow_depth_in"`
	SnowDepthDelta24 float64   `json:"snow_depth_24h_delta_in"`
	AirTempF         float64   `json:"air_temp_f"`
}

// FetchCurrentTelemetry retrieves real-time snowpack observation from a SNOTEL station
func (c *Client) FetchCurrentTelemetry(ctx context.Context, stationID string) (*weather.SurfaceObservationSnapshot, error) {
	reqURL := fmt.Sprintf("%s/data/%s", c.baseURL, stationID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: snotel request failed: %v", weather.ErrProviderUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, weather.ErrRateLimited
	}
	if resp.StatusCode >= 500 {
		return nil, fmt.Errorf("%w: snotel server returned HTTP %d", weather.ErrProviderUnavailable, resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("%w: snotel returned HTTP %d: %s", weather.ErrInvalidResponse, resp.StatusCode, string(b))
	}

	var report SnotelReport
	if err := json.NewDecoder(resp.Body).Decode(&report); err != nil {
		return nil, fmt.Errorf("%w: failed to decode snotel report: %v", weather.ErrInvalidResponse, err)
	}

	if report.ObsDate.IsZero() {
		report.ObsDate = time.Now()
	}

	return &weather.SurfaceObservationSnapshot{
		StationID:                report.StationTriplet,
		StationName:              report.StationName,
		Timestamp:                report.ObsDate,
		ElevationFt:              report.ElevationFt,
		Coordinates:              weather.Coordinates{Latitude: report.Latitude, Longitude: report.Longitude},
		TemperatureF:             report.AirTempF,
		SnowDepthInches:          report.SnowDepthIn,
		SnowDepthChange24hInches: report.SnowDepthDelta24,
		SWEInches:                report.SnowWaterEquivIn,
		TelemetryStale:           time.Since(report.ObsDate) > 4*time.Hour,
	}, nil
}

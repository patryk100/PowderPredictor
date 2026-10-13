package mesonet

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

// Client ingests high-elevation and regional mesonet surface stations (e.g. MWOBS, NYSM)
type Client struct {
	httpClient *http.Client
	baseURL    string
}

// Option configures the mesonet client
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

// NewClient creates a new regional mesonet observation client
func NewClient(opts ...Option) *Client {
	c := &Client{
		httpClient: &http.Client{Timeout: defaultTimeout},
		baseURL:    "https://api.mountwashington.org/v1",
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

func (c *Client) Name() string {
	return "Regional-Mesonet"
}

// StationPayload represents standard mesonet observation JSON
type StationPayload struct {
	StationID        string    `json:"station_id"`
	StationName      string    `json:"station_name"`
	Latitude         float64   `json:"latitude"`
	Longitude        float64   `json:"longitude"`
	ElevationFt      int       `json:"elevation_ft"`
	Timestamp        time.Time `json:"timestamp"`
	TemperatureF     float64   `json:"temperature_f"`
	WindSpeedMph     float64   `json:"wind_speed_mph"`
	WindGustMph      float64   `json:"wind_gust_mph"`
	WindDirectionDeg int       `json:"wind_direction_deg"`
	RimeFlag         bool      `json:"rime_flag"`
}

// FetchCurrentTelemetry retrieves real-time observation from mesonet station
func (c *Client) FetchCurrentTelemetry(ctx context.Context, stationID string) (*weather.SurfaceObservationSnapshot, error) {
	reqURL := fmt.Sprintf("%s/stations/%s/current", c.baseURL, stationID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: mesonet request failed: %v", weather.ErrProviderUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, weather.ErrRateLimited
	}
	if resp.StatusCode >= 500 {
		return nil, fmt.Errorf("%w: mesonet station returned HTTP %d", weather.ErrProviderUnavailable, resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("%w: mesonet station returned HTTP %d: %s", weather.ErrInvalidResponse, resp.StatusCode, string(b))
	}

	var data StationPayload
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("%w: failed to decode mesonet payload: %v", weather.ErrInvalidResponse, err)
	}

	now := time.Now()
	if data.Timestamp.IsZero() {
		data.Timestamp = now
	}

	snap := &weather.SurfaceObservationSnapshot{
		StationID:   data.StationID,
		StationName: data.StationName,
		Timestamp:   data.Timestamp,
		ElevationFt: data.ElevationFt,
		Coordinates: weather.Coordinates{
			Latitude:  data.Latitude,
			Longitude: data.Longitude,
		},
		TemperatureF:     data.TemperatureF,
		WindSpeedMph:     data.WindSpeedMph,
		WindGustMph:      data.WindGustMph,
		WindDirectionDeg: data.WindDirectionDeg,
		RimeIndicator:    data.RimeFlag,
		TelemetryStale:   time.Since(data.Timestamp) > 4*time.Hour,
	}

	return snap, nil
}

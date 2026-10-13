package elevation

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/powderpredictor/operator/pkg/weather"
)

const (
	defaultTimeout = 10 * time.Second
	usgsEPQSBase   = "https://epqs.nationalmap.gov/v1/json"
)

// Client queries the USGS 3D Elevation Program (3DEP) / Elevation Point Query Service
type Client struct {
	httpClient *http.Client
	baseURL    string
}

// Option configures the USGS client
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

// NewClient creates a new USGS 3DEP elevation query client
func NewClient(opts ...Option) *Client {
	c := &Client{
		httpClient: &http.Client{Timeout: defaultTimeout},
		baseURL:    usgsEPQSBase,
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// USGSResponse matches the USGS EPQS JSON payload
type USGSResponse struct {
	Value float64 `json:"value"` // Elevation value
	Units string  `json:"units"` // "Feet" or "Meters"
}

// LookupElevationFt retrieves ground benchmark altitude in feet for given coordinates
func (c *Client) LookupElevationFt(ctx context.Context, coords weather.Coordinates) (int, error) {
	u, err := url.Parse(c.baseURL)
	if err != nil {
		return 0, err
	}

	q := u.Query()
	q.Set("x", fmt.Sprintf("%.6f", coords.Longitude))
	q.Set("y", fmt.Sprintf("%.6f", coords.Latitude))
	q.Set("units", "Feet")
	q.Set("output", "json")
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return 0, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("%w: USGS 3DEP lookup failed: %v", weather.ErrProviderUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return 0, weather.ErrRateLimited
	}
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("%w: USGS returned HTTP %d: %s", weather.ErrInvalidResponse, resp.StatusCode, string(b))
	}

	var data USGSResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, fmt.Errorf("%w: failed to decode USGS payload: %v", weather.ErrInvalidResponse, err)
	}

	if data.Units == "Meters" {
		return weather.MetersToFeet(data.Value), nil
	}
	return int(data.Value), nil
}

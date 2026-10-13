package nws

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
	defaultUserAgent = "(powderpredictor.io, contact@powderpredictor.io)"
	defaultTimeout   = 10 * time.Second
	nwsAPIBase       = "https://api.weather.gov"
)

// Client handles querying the NOAA National Weather Service API
type Client struct {
	httpClient *http.Client
	baseURL    string
	userAgent  string
}

// Option configures the NWS client
type Option func(*Client)

// WithHTTPClient configures a custom http.Client
func WithHTTPClient(client *http.Client) Option {
	return func(c *Client) {
		c.httpClient = client
	}
}

// WithBaseURL configures a custom base URL (useful for mocking/testing)
func WithBaseURL(url string) Option {
	return func(c *Client) {
		c.baseURL = url
	}
}

// WithUserAgent configures a custom User-Agent string
func WithUserAgent(ua string) Option {
	return func(c *Client) {
		c.userAgent = ua
	}
}

// NewClient creates a new NOAA NWS API client conforming to weather.WeatherProvider
func NewClient(opts ...Option) *Client {
	c := &Client{
		httpClient: &http.Client{Timeout: defaultTimeout},
		baseURL:    nwsAPIBase,
		userAgent:  defaultUserAgent,
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// Name returns the provider identifier
func (c *Client) Name() string {
	return "NOAA-NWS"
}

// PointsResponse matches the NOAA /points/{lat},{lon} JSON payload
type PointsResponse struct {
	Properties struct {
		GridId           string `json:"gridId"`
		GridX            int    `json:"gridX"`
		GridY            int    `json:"gridY"`
		ForecastHourly   string `json:"forecastHourly"`
		ForecastGridData string `json:"forecastGridData"`
	} `json:"properties"`
}

// HourlyForecastResponse matches the NOAA /gridpoints/{wfo}/{x},{y}/forecast/hourly JSON payload
type HourlyForecastResponse struct {
	Properties struct {
		GeneratedAt time.Time `json:"generatedAt"`
		Periods     []struct {
			Number              int       `json:"number"`
			StartTime           time.Time `json:"startTime"`
			EndTime             time.Time `json:"endTime"`
			Temperature         float64   `json:"temperature"`
			TemperatureUnit     string    `json:"temperatureUnit"`
			ProbabilityOfPrecip struct {
				Value *float64 `json:"value"`
			} `json:"probabilityOfPrecipitation"`
			Dewpoint struct {
				Value *float64 `json:"value"`
			} `json:"dewpoint"`
			RelativeHumidity struct {
				Value *float64 `json:"value"`
			} `json:"relativeHumidity"`
			WindSpeed     string `json:"windSpeed"`
			WindGust      string `json:"windGust"`
			WindDirection string `json:"windDirection"`
			ShortForecast string `json:"shortForecast"`
		} `json:"periods"`
	} `json:"properties"`
}

// FetchForecast queries the two-step NOAA NWS API:
// 1. /points/{lat},{lon} to resolve WFO office and grid coordinates
// 2. /gridpoints/{wfo}/{x},{y}/forecast/hourly to retrieve hourly model periods
func (c *Client) FetchForecast(ctx context.Context, coords weather.Coordinates, elevation weather.ElevationBounds) (*weather.UnifiedForecastSnapshot, error) {
	pointsURL := fmt.Sprintf("%s/points/%.4f,%.4f", c.baseURL, coords.Latitude, coords.Longitude)

	pointsReq, err := http.NewRequestWithContext(ctx, http.MethodGet, pointsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create points request failed: %w", err)
	}
	pointsReq.Header.Set("User-Agent", c.userAgent)
	pointsReq.Header.Set("Accept", "application/geo+json")

	resp, err := c.httpClient.Do(pointsReq)
	if err != nil {
		return nil, fmt.Errorf("%w: points call failed: %v", weather.ErrProviderUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, weather.ErrRateLimited
	}
	if resp.StatusCode >= 500 {
		return nil, fmt.Errorf("%w: points call returned status %d", weather.ErrProviderUnavailable, resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("%w: points call returned HTTP %d: %s", weather.ErrInvalidResponse, resp.StatusCode, string(body))
	}

	var points PointsResponse
	if err := json.NewDecoder(resp.Body).Decode(&points); err != nil {
		return nil, fmt.Errorf("%w: failed to decode points response: %v", weather.ErrInvalidResponse, err)
	}

	forecastHourlyURL := points.Properties.ForecastHourly
	if forecastHourlyURL == "" {
		forecastHourlyURL = fmt.Sprintf("%s/gridpoints/%s/%d,%d/forecast/hourly", c.baseURL, points.Properties.GridId, points.Properties.GridX, points.Properties.GridY)
	}

	hourlyReq, err := http.NewRequestWithContext(ctx, http.MethodGet, forecastHourlyURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create hourly forecast request failed: %w", err)
	}
	hourlyReq.Header.Set("User-Agent", c.userAgent)
	hourlyReq.Header.Set("Accept", "application/geo+json")

	hourlyResp, err := c.httpClient.Do(hourlyReq)
	if err != nil {
		return nil, fmt.Errorf("%w: hourly forecast call failed: %v", weather.ErrProviderUnavailable, err)
	}
	defer hourlyResp.Body.Close()

	if hourlyResp.StatusCode == http.StatusTooManyRequests {
		return nil, weather.ErrRateLimited
	}
	if hourlyResp.StatusCode >= 500 {
		return nil, fmt.Errorf("%w: hourly forecast call returned status %d", weather.ErrProviderUnavailable, hourlyResp.StatusCode)
	}
	if hourlyResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(hourlyResp.Body)
		return nil, fmt.Errorf("%w: hourly forecast call returned HTTP %d: %s", weather.ErrInvalidResponse, hourlyResp.StatusCode, string(body))
	}

	var hourly HourlyForecastResponse
	if err := json.NewDecoder(hourlyResp.Body).Decode(&hourly); err != nil {
		return nil, fmt.Errorf("%w: failed to decode hourly forecast response: %v", weather.ErrInvalidResponse, err)
	}

	snapshot := &weather.UnifiedForecastSnapshot{
		ProviderName: c.Name(),
		GeneratedAt:  hourly.Properties.GeneratedAt,
		Coordinates:  coords,
		Elevations:   elevation,
	}
	if snapshot.GeneratedAt.IsZero() {
		snapshot.GeneratedAt = time.Now()
	}

	midElevation := elevation.MidElevationFt()

	for _, period := range hourly.Properties.Periods {
		baseTempF := period.Temperature
		if period.TemperatureUnit == "C" {
			baseTempF = weather.CelsiusToFahrenheit(period.Temperature)
		}

		// Downscale temperatures by standard lapse rate to Mid and Summit tiers
		midTempF := weather.DownscaleTemperatureByElevation(baseTempF, elevation.BaseElevationFt, midElevation)
		summitTempF := weather.DownscaleTemperatureByElevation(baseTempF, elevation.BaseElevationFt, elevation.SummitElevationFt)

		precipProb := 0.0
		if period.ProbabilityOfPrecip.Value != nil {
			precipProb = *period.ProbabilityOfPrecip.Value
		}

		humidity := 50.0
		if period.RelativeHumidity.Value != nil {
			humidity = *period.RelativeHumidity.Value
		}

		dewpointF := baseTempF - ((100.0 - humidity) / 5.0)
		if period.Dewpoint.Value != nil {
			dewpointF = weather.CelsiusToFahrenheit(*period.Dewpoint.Value)
		}

		// Estimate liquid equivalent and snowfall based on probability
		qpfInches := 0.0
		if precipProb > 30.0 {
			qpfInches = weather.Round((precipProb/100.0)*0.10, 3) // Hourly QPF proxy
		}

		// Determine precipitation phase based on elevation tier temperatures
		basePhase := weather.PhaseNone
		if qpfInches > 0 {
			if baseTempF <= 32.0 {
				basePhase = weather.PhaseSnow
			} else if baseTempF <= 35.0 {
				basePhase = weather.PhaseMixed
			} else {
				basePhase = weather.PhaseRain
			}
		}

		summitPhase := weather.PhaseNone
		summitSnowfall := 0.0
		if qpfInches > 0 {
			if summitTempF <= 32.0 {
				summitPhase = weather.PhaseSnow
				summitSnowfall = weather.Round(qpfInches*15.0, 2) // 15:1 baseline SLR
			} else {
				summitPhase = weather.PhaseRain
			}
		}

		baseSnowfall := 0.0
		if basePhase == weather.PhaseSnow {
			baseSnowfall = weather.Round(qpfInches*10.0, 2)
		}

		windSpeedMph := parseSpeed(period.WindSpeed)
		windGustMph := parseSpeed(period.WindGust)
		if windGustMph < windSpeedMph {
			windGustMph = windSpeedMph * 1.3
		}

		hSnapshot := weather.HourlyAtmosphericSnapshot{
			Timestamp: period.StartTime,
			Base: weather.AtmosphericTierSnapshot{
				Tier:                     weather.ElevationTierBase,
				ElevationFt:              elevation.BaseElevationFt,
				TemperatureF:             baseTempF,
				TemperatureC:             weather.FahrenheitToCelsius(baseTempF),
				DewPointF:                dewpointF,
				DewPointC:                weather.FahrenheitToCelsius(dewpointF),
				RelativeHumidity:         humidity,
				WindSpeedMph:             windSpeedMph,
				WindGustMph:              windGustMph,
				PrecipitationProbability: precipProb,
				QPFInches:                qpfInches,
				SnowfallInches:           baseSnowfall,
				Phase:                    basePhase,
				SnowToLiquidRatio:        10.0,
			},
			Mid: weather.AtmosphericTierSnapshot{
				Tier:                     weather.ElevationTierMid,
				ElevationFt:              midElevation,
				TemperatureF:             midTempF,
				TemperatureC:             weather.FahrenheitToCelsius(midTempF),
				DewPointF:                dewpointF - 3.0,
				DewPointC:                weather.FahrenheitToCelsius(dewpointF - 3.0),
				RelativeHumidity:         humidity,
				WindSpeedMph:             windSpeedMph * 1.15,
				WindGustMph:              windGustMph * 1.2,
				PrecipitationProbability: precipProb,
				QPFInches:                qpfInches,
				SnowfallInches:           summitSnowfall * 0.7,
				Phase:                    summitPhase,
				SnowToLiquidRatio:        12.0,
			},
			Summit: weather.AtmosphericTierSnapshot{
				Tier:                     weather.ElevationTierSummit,
				ElevationFt:              elevation.SummitElevationFt,
				TemperatureF:             summitTempF,
				TemperatureC:             weather.FahrenheitToCelsius(summitTempF),
				DewPointF:                dewpointF - 6.0,
				DewPointC:                weather.FahrenheitToCelsius(dewpointF - 6.0),
				RelativeHumidity:         humidity,
				WindSpeedMph:             windSpeedMph * 1.35,
				WindGustMph:              windGustMph * 1.45,
				PrecipitationProbability: precipProb,
				QPFInches:                qpfInches,
				SnowfallInches:           summitSnowfall,
				Phase:                    summitPhase,
				SnowToLiquidRatio:        15.0,
			},
		}

		snapshot.HourlySnapshots = append(snapshot.HourlySnapshots, hSnapshot)
		snapshot.TotalSummitSnowfallInches += summitSnowfall
		snapshot.TotalBaseSnowfallInches += baseSnowfall
		snapshot.TotalSummitQPFInches += qpfInches
		snapshot.TotalBaseQPFInches += qpfInches
	}

	snapshot.TotalSummitSnowfallInches = weather.Round(snapshot.TotalSummitSnowfallInches, 1)
	snapshot.TotalBaseSnowfallInches = weather.Round(snapshot.TotalBaseSnowfallInches, 1)
	snapshot.TotalSummitQPFInches = weather.Round(snapshot.TotalSummitQPFInches, 2)
	snapshot.TotalBaseQPFInches = weather.Round(snapshot.TotalBaseQPFInches, 2)

	return snapshot, nil
}

func parseSpeed(raw string) float64 {
	var speed float64
	_, _ = fmt.Sscanf(raw, "%f", &speed)
	return speed
}

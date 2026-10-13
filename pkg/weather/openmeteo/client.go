package openmeteo

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/powderpredictor/operator/pkg/weather"
)

const (
	defaultTimeout       = 10 * time.Second
	defaultOpenMeteoBase = "https://api.open-meteo.com/v1/forecast"
)

// Client handles querying the Open-Meteo Mountain/Elevation weather API
type Client struct {
	httpClient *http.Client
	baseURL    string
}

// Option configures the OpenMeteo client
type Option func(*Client)

// WithHTTPClient configures a custom http.Client
func WithHTTPClient(client *http.Client) Option {
	return func(c *Client) {
		c.httpClient = client
	}
}

// WithBaseURL configures a custom base URL
func WithBaseURL(url string) Option {
	return func(c *Client) {
		c.baseURL = url
	}
}

// NewClient creates a new Open-Meteo API client conforming to weather.WeatherProvider
func NewClient(opts ...Option) *Client {
	c := &Client{
		httpClient: &http.Client{Timeout: defaultTimeout},
		baseURL:    defaultOpenMeteoBase,
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// Name returns the provider identifier
func (c *Client) Name() string {
	return "Open-Meteo"
}

// OpenMeteoResponse represents the Open-Meteo JSON payload with surface and pressure levels
type OpenMeteoResponse struct {
	Elevation float64 `json:"elevation"` // Elevation in meters
	Hourly    struct {
		Time                     []string  `json:"time"`
		Temperature2m            []float64 `json:"temperature_2m"`
		RelativeHumidity2m       []float64 `json:"relative_humidity_2m"`
		DewPoint2m               []float64 `json:"dew_point_2m"`
		PrecipitationProbability []float64 `json:"precipitation_probability"`
		Precipitation            []float64 `json:"precipitation"`         // mm
		Snowfall                 []float64 `json:"snowfall"`              // cm
		FreezingLevelHeight      []float64 `json:"freezing_level_height"` // meters
		WindSpeed10m             []float64 `json:"wind_speed_10m"`        // km/h
		WindGusts10m             []float64 `json:"wind_gusts_10m"`        // km/h
		WindDirection10m         []float64 `json:"wind_direction_10m"`
		// Isobaric pressure levels
		Temperature850hPa        []float64 `json:"temperature_850hPa"`
		RelativeHumidity850hPa   []float64 `json:"relative_humidity_850hPa"`
		WindSpeed850hPa          []float64 `json:"wind_speed_850hPa"`
		GeopotentialHeight850hPa []float64 `json:"geopotential_height_850hPa"`
		Temperature700hPa        []float64 `json:"temperature_700hPa"`
		RelativeHumidity700hPa   []float64 `json:"relative_humidity_700hPa"`
		WindSpeed700hPa          []float64 `json:"wind_speed_700hPa"`
		GeopotentialHeight700hPa []float64 `json:"geopotential_height_700hPa"`
	} `json:"hourly"`
}

// FetchForecast queries Open-Meteo for summit and base atmospheric conditions
func (c *Client) FetchForecast(ctx context.Context, coords weather.Coordinates, elevation weather.ElevationBounds) (*weather.UnifiedForecastSnapshot, error) {
	// Query for base elevation
	baseMeters := weather.FeetToMeters(elevation.BaseElevationFt)
	baseResp, err := c.queryElevation(ctx, coords, baseMeters)
	if err != nil {
		return nil, fmt.Errorf("open-meteo base query failed: %w", err)
	}

	// Query for summit elevation
	summitMeters := weather.FeetToMeters(elevation.SummitElevationFt)
	summitResp, err := c.queryElevation(ctx, coords, summitMeters)
	if err != nil {
		return nil, fmt.Errorf("open-meteo summit query failed: %w", err)
	}

	snapshot := &weather.UnifiedForecastSnapshot{
		ProviderName: c.Name(),
		GeneratedAt:  time.Now(),
		Coordinates:  coords,
		Elevations:   elevation,
	}

	numHours := len(baseResp.Hourly.Time)
	if len(summitResp.Hourly.Time) < numHours {
		numHours = len(summitResp.Hourly.Time)
	}

	midElevation := elevation.MidElevationFt()

	for i := 0; i < numHours; i++ {
		t, err := time.Parse("2006-01-02T15:04", baseResp.Hourly.Time[i])
		if err != nil {
			t = time.Now().Add(time.Duration(i) * time.Hour)
		}

		baseTempC := baseResp.Hourly.Temperature2m[i]
		baseTempF := weather.CelsiusToFahrenheit(baseTempC)
		summitTempC := summitResp.Hourly.Temperature2m[i]
		summitTempF := weather.CelsiusToFahrenheit(summitTempC)
		midTempF := weather.DownscaleTemperatureByElevation(baseTempF, elevation.BaseElevationFt, midElevation)

		baseDewC := baseResp.Hourly.DewPoint2m[i]
		summitDewC := summitResp.Hourly.DewPoint2m[i]

		baseQpfInches := weather.MillimetersToInches(baseResp.Hourly.Precipitation[i])
		summitQpfInches := weather.MillimetersToInches(summitResp.Hourly.Precipitation[i])

		// Open-Meteo snowfall is in cm -> convert cm to inches (cm * 0.393701)
		baseSnowInches := weather.Round(baseResp.Hourly.Snowfall[i]*0.393701, 2)
		summitSnowInches := weather.Round(summitResp.Hourly.Snowfall[i]*0.393701, 2)

		// Freezing level from meters to feet
		freezingLevelFt := weather.MetersToFeet(baseResp.Hourly.FreezingLevelHeight[i])

		// Wind speed in km/h -> mph (km/h * 0.621371)
		baseWindMph := weather.Round(baseResp.Hourly.WindSpeed10m[i]*0.621371, 1)
		baseGustMph := weather.Round(baseResp.Hourly.WindGusts10m[i]*0.621371, 1)
		summitWindMph := weather.Round(summitResp.Hourly.WindSpeed10m[i]*0.621371, 1)
		summitGustMph := weather.Round(summitResp.Hourly.WindGusts10m[i]*0.621371, 1)

		basePhase := determinePhase(baseTempF, baseQpfInches, baseSnowInches)
		summitPhase := determinePhase(summitTempF, summitQpfInches, summitSnowInches)

		// Compute SLR if snow is falling
		summitSLR := 0.0
		if summitQpfInches > 0 && summitSnowInches > 0 {
			summitSLR = weather.Round(summitSnowInches/summitQpfInches, 1)
		}

		hSnapshot := weather.HourlyAtmosphericSnapshot{
			Timestamp: t,
			Base: weather.AtmosphericTierSnapshot{
				Tier:                     weather.ElevationTierBase,
				ElevationFt:              elevation.BaseElevationFt,
				TemperatureF:             baseTempF,
				TemperatureC:             baseTempC,
				DewPointF:                weather.CelsiusToFahrenheit(baseDewC),
				DewPointC:                baseDewC,
				RelativeHumidity:         baseResp.Hourly.RelativeHumidity2m[i],
				WindSpeedMph:             baseWindMph,
				WindGustMph:              baseGustMph,
				WindDirectionDegrees:     int(baseResp.Hourly.WindDirection10m[i]),
				FreezingLevelElevationFt: freezingLevelFt,
				QPFInches:                baseQpfInches,
				SnowfallInches:           baseSnowInches,
				PrecipitationProbability: baseResp.Hourly.PrecipitationProbability[i],
				Phase:                    basePhase,
			},
			Mid: weather.AtmosphericTierSnapshot{
				Tier:                     weather.ElevationTierMid,
				ElevationFt:              midElevation,
				TemperatureF:             midTempF,
				TemperatureC:             weather.FahrenheitToCelsius(midTempF),
				DewPointF:                weather.CelsiusToFahrenheit(baseDewC) - 3.0,
				DewPointC:                baseDewC - 1.6,
				RelativeHumidity:         baseResp.Hourly.RelativeHumidity2m[i],
				WindSpeedMph:             weather.Round((baseWindMph+summitWindMph)/2.0, 1),
				WindGustMph:              weather.Round((baseGustMph+summitGustMph)/2.0, 1),
				WindDirectionDegrees:     int(baseResp.Hourly.WindDirection10m[i]),
				FreezingLevelElevationFt: freezingLevelFt,
				QPFInches:                (baseQpfInches + summitQpfInches) / 2.0,
				SnowfallInches:           (baseSnowInches + summitSnowInches) / 2.0,
				PrecipitationProbability: baseResp.Hourly.PrecipitationProbability[i],
				Phase:                    summitPhase,
			},
			Summit: weather.AtmosphericTierSnapshot{
				Tier:                     weather.ElevationTierSummit,
				ElevationFt:              elevation.SummitElevationFt,
				TemperatureF:             summitTempF,
				TemperatureC:             summitTempC,
				DewPointF:                weather.CelsiusToFahrenheit(summitDewC),
				DewPointC:                summitDewC,
				RelativeHumidity:         summitResp.Hourly.RelativeHumidity2m[i],
				WindSpeedMph:             summitWindMph,
				WindGustMph:              summitGustMph,
				WindDirectionDegrees:     int(summitResp.Hourly.WindDirection10m[i]),
				FreezingLevelElevationFt: freezingLevelFt,
				QPFInches:                summitQpfInches,
				SnowfallInches:           summitSnowInches,
				PrecipitationProbability: summitResp.Hourly.PrecipitationProbability[i],
				Phase:                    summitPhase,
				SnowToLiquidRatio:        summitSLR,
			},
		}

		// Attach isobaric sounding data if available
		if len(baseResp.Hourly.Temperature850hPa) > i {
			hSnapshot.Isobaric850hPa = &weather.IsobaricLevelData{
				PressureHPa:         850,
				TemperatureC:        baseResp.Hourly.Temperature850hPa[i],
				RelativeHumidity:    baseResp.Hourly.RelativeHumidity850hPa[i],
				WindSpeedMph:        weather.Round(baseResp.Hourly.WindSpeed850hPa[i]*0.621371, 1),
				GeopotentialHeightM: baseResp.Hourly.GeopotentialHeight850hPa[i],
			}
		}
		if len(baseResp.Hourly.Temperature700hPa) > i {
			hSnapshot.Isobaric700hPa = &weather.IsobaricLevelData{
				PressureHPa:         700,
				TemperatureC:        baseResp.Hourly.Temperature700hPa[i],
				RelativeHumidity:    baseResp.Hourly.RelativeHumidity700hPa[i],
				WindSpeedMph:        weather.Round(baseResp.Hourly.WindSpeed700hPa[i]*0.621371, 1),
				GeopotentialHeightM: baseResp.Hourly.GeopotentialHeight700hPa[i],
			}
		}

		snapshot.HourlySnapshots = append(snapshot.HourlySnapshots, hSnapshot)
		snapshot.TotalSummitSnowfallInches += summitSnowInches
		snapshot.TotalBaseSnowfallInches += baseSnowInches
		snapshot.TotalSummitQPFInches += summitQpfInches
		snapshot.TotalBaseQPFInches += baseQpfInches
	}

	snapshot.TotalSummitSnowfallInches = weather.Round(snapshot.TotalSummitSnowfallInches, 1)
	snapshot.TotalBaseSnowfallInches = weather.Round(snapshot.TotalBaseSnowfallInches, 1)
	snapshot.TotalSummitQPFInches = weather.Round(snapshot.TotalSummitQPFInches, 2)
	snapshot.TotalBaseQPFInches = weather.Round(snapshot.TotalBaseQPFInches, 2)

	return snapshot, nil
}

func (c *Client) queryElevation(ctx context.Context, coords weather.Coordinates, elevationMeters float64) (*OpenMeteoResponse, error) {
	u, err := url.Parse(c.baseURL)
	if err != nil {
		return nil, err
	}

	q := u.Query()
	q.Set("latitude", fmt.Sprintf("%.4f", coords.Latitude))
	q.Set("longitude", fmt.Sprintf("%.4f", coords.Longitude))
	q.Set("elevation", strconv.FormatFloat(elevationMeters, 'f', 1, 64))
	q.Set("hourly", "temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,snowfall,freezing_level_height,wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_850hPa,relative_humidity_850hPa,wind_speed_850hPa,geopotential_height_850hPa,temperature_700hPa,relative_humidity_700hPa,wind_speed_700hPa,geopotential_height_700hPa")
	q.Set("timezone", "UTC")
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: open-meteo request failed: %v", weather.ErrProviderUnavailable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, weather.ErrRateLimited
	}
	if resp.StatusCode >= 500 {
		return nil, fmt.Errorf("%w: open-meteo returned HTTP %d", weather.ErrProviderUnavailable, resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("%w: open-meteo returned HTTP %d: %s", weather.ErrInvalidResponse, resp.StatusCode, string(b))
	}

	var data OpenMeteoResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("%w: failed to decode open-meteo JSON: %v", weather.ErrInvalidResponse, err)
	}
	return &data, nil
}

func determinePhase(tempF, qpfInches, snowInches float64) weather.PrecipitationPhase {
	if qpfInches <= 0 && snowInches <= 0 {
		return weather.PhaseNone
	}
	if snowInches > 0 && tempF <= 32.0 {
		return weather.PhaseSnow
	}
	if tempF <= 34.0 {
		return weather.PhaseMixed
	}
	return weather.PhaseRain
}

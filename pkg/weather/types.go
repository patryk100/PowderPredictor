package weather

import (
	"context"
	"errors"
	"time"
)

var (
	// ErrProviderUnavailable indicates upstream API 5xx or connection failures
	ErrProviderUnavailable = errors.New("weather provider unavailable")

	// ErrRateLimited indicates an HTTP 429 or provider rate limit threshold exceeded
	ErrRateLimited = errors.New("weather provider rate limit exceeded")

	// ErrInvalidResponse indicates upstream JSON could not be parsed or required fields are missing
	ErrInvalidResponse = errors.New("invalid or malformed weather provider response")
)

// Coordinates represents latitude and longitude
type Coordinates struct {
	Latitude  float64
	Longitude float64
}

// ElevationBounds represents the physical mountain topography bounds in feet
type ElevationBounds struct {
	BaseElevationFt   int
	SummitElevationFt int
}

// MidElevationFt calculates the mathematical midpoint elevation between base and summit
func (e ElevationBounds) MidElevationFt() int {
	return e.BaseElevationFt + (e.SummitElevationFt-e.BaseElevationFt)/2
}

// ElevationTier identifies vertical mountain sections
type ElevationTier string

const (
	ElevationTierBase   ElevationTier = "base"
	ElevationTierMid    ElevationTier = "mid"
	ElevationTierSummit ElevationTier = "summit"
)

// PrecipitationPhase represents the physical form of falling precipitation
type PrecipitationPhase string

const (
	PhaseNone         PrecipitationPhase = "none"
	PhaseRain         PrecipitationPhase = "rain"
	PhaseFreezingRain PrecipitationPhase = "freezing_rain"
	PhaseSleet        PrecipitationPhase = "sleet"
	PhaseSnow         PrecipitationPhase = "snow"
	PhaseMixed        PrecipitationPhase = "mixed"
)

// AtmosphericTierSnapshot captures meteorology at a specific elevation tier (base, mid, summit)
type AtmosphericTierSnapshot struct {
	Tier ElevationTier `json:"tier"`

	ElevationFt int `json:"elevationFt"`

	// Temperature in Fahrenheit
	TemperatureF float64 `json:"temperatureF"`

	// Temperature in Celsius
	TemperatureC float64 `json:"temperatureC"`

	// DewPoint in Fahrenheit
	DewPointF float64 `json:"dewPointF"`

	// DewPoint in Celsius
	DewPointC float64 `json:"dewPointC"`

	// RelativeHumidity percentage (0 - 100)
	RelativeHumidity float64 `json:"relativeHumidity"`

	// WindSpeedMph in miles per hour
	WindSpeedMph float64 `json:"windSpeedMph"`

	// WindGustMph in miles per hour
	WindGustMph float64 `json:"windGustMph"`

	// WindDirectionDegrees (0 - 360)
	WindDirectionDegrees int `json:"windDirectionDegrees"`

	// FreezingLevelElevationFt is the forecasted altitude of the 0°C isotherm
	FreezingLevelElevationFt int `json:"freezingLevelElevationFt"`

	// Quantitative Precipitation Forecast (liquid equivalent) in inches
	QPFInches float64 `json:"qpfInches"`

	// Estimated Snowfall in inches for this tier
	SnowfallInches float64 `json:"snowfallInches"`

	// Precipitation probability percentage (0 - 100)
	PrecipitationProbability float64 `json:"precipitationProbability"`

	// PrecipitationPhase (rain, snow, etc.)
	Phase PrecipitationPhase `json:"phase"`

	// Modeled snow-to-liquid ratio (e.g. 15.0 for 15:1)
	SnowToLiquidRatio float64 `json:"snowToLiquidRatio"`
}

// IsobaricLevelData captures vertical atmospheric profile properties (e.g., 850hPa, 700hPa)
type IsobaricLevelData struct {
	PressureHPa         int     `json:"pressureHPa"`
	TemperatureC        float64 `json:"temperatureC"`
	RelativeHumidity    float64 `json:"relativeHumidity"`
	WindSpeedMph        float64 `json:"windSpeedMph"`
	GeopotentialHeightM float64 `json:"geopotentialHeightM"`
}

// HourlyAtmosphericSnapshot represents conditions across tiers for a discrete 1-hour window
type HourlyAtmosphericSnapshot struct {
	Timestamp time.Time `json:"timestamp"`

	Base   AtmosphericTierSnapshot `json:"base"`
	Mid    AtmosphericTierSnapshot `json:"mid"`
	Summit AtmosphericTierSnapshot `json:"summit"`

	// Vertical isobaric sounding data
	Isobaric700hPa *IsobaricLevelData `json:"isobaric700hPa,omitempty"`
	Isobaric850hPa *IsobaricLevelData `json:"isobaric850hPa,omitempty"`
}

// UnifiedForecastSnapshot aggregates a full forecast horizon across all vertical tiers
type UnifiedForecastSnapshot struct {
	ProviderName string    `json:"providerName"`
	GeneratedAt  time.Time `json:"generatedAt"`

	Coordinates Coordinates     `json:"coordinates"`
	Elevations  ElevationBounds `json:"elevations"`

	// Hourly time series across the forecast horizon (e.g. 72 hours)
	HourlySnapshots []HourlyAtmosphericSnapshot `json:"hourlySnapshots"`

	// Aggregated total predicted accumulation across tiers
	TotalSummitSnowfallInches float64 `json:"totalSummitSnowfallInches"`
	TotalBaseSnowfallInches   float64 `json:"totalBaseSnowfallInches"`
	TotalSummitQPFInches      float64 `json:"totalSummitQpfInches"`
	TotalBaseQPFInches        float64 `json:"totalBaseQpfInches"`
}

// SurfaceObservationSnapshot captures point-in-time ground telemetry (SNOTEL, mesonet, MWOBS)
type SurfaceObservationSnapshot struct {
	StationID   string    `json:"stationID"`
	StationName string    `json:"stationName"`
	Timestamp   time.Time `json:"timestamp"`

	ElevationFt int         `json:"elevationFt"`
	Coordinates Coordinates `json:"coordinates"`

	TemperatureF     float64 `json:"temperatureF"`
	SnowDepthInches  float64 `json:"snowDepthInches"`
	SWEInches        float64 `json:"sweInches"` // Snow Water Equivalent
	WindSpeedMph     float64 `json:"windSpeedMph"`
	WindGustMph      float64 `json:"windGustMph"`
	WindDirectionDeg int     `json:"windDirectionDeg"`
}

// WeatherProvider defines the contract for gridded atmospheric forecast connectors
type WeatherProvider interface {
	FetchForecast(ctx context.Context, coords Coordinates, elevation ElevationBounds) (*UnifiedForecastSnapshot, error)
	Name() string
}

// SurfaceObserver defines the contract for real-time mesonet/ground telemetry stations
type SurfaceObserver interface {
	FetchCurrentTelemetry(ctx context.Context, stationID string) (*SurfaceObservationSnapshot, error)
	Name() string
}

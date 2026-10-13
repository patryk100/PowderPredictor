package gateway

import (
	"math"
	"time"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
)

// AggregatedForecastResponse represents the unified model combining ResortTarget and SnowForecastReport
type AggregatedForecastResponse struct {
	ResortID    string  `json:"resortId"`
	Name        string  `json:"name"`
	Region      string  `json:"region"`
	PassType    string  `json:"passType"` // "Ikon", "Epic", "Indy", "Independent"
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	SummitFt    int     `json:"summitFt"`
	BaseFt      int     `json:"baseFt"`
	VerticalFt  int     `json:"verticalFt"`
	SkiableAcre int     `json:"skiableAcres"`

	// Derived SnowForecastReport modeling data
	PowderScore        int       `json:"powderScore"`
	ConfidenceInterval float64   `json:"confidenceInterval"`
	PredictedSnowfall  float64   `json:"predictedSnowfallInches"`
	SnowToLiquidRatio  float64   `json:"snowToLiquidRatio"`
	FreezingLevelFt    int       `json:"freezingLevelElevationFt"`
	WindowStart        time.Time `json:"windowStart"`
	WindowEnd          time.Time `json:"windowEnd"`

	// Status flags
	GladesRecommended bool `json:"gladesRecommended"`
	WindHoldWarning   bool `json:"windHoldWarning"`
	CrustRisk         bool `json:"crustRisk"`

	// Client proximity (if user coordinates provided)
	DistanceMiles *float64 `json:"distanceMiles,omitempty"`
	DriveTimeEst  *string  `json:"driveTimeEstimate,omitempty"`
}

// ResortDetailResponse provides deeper multi-elevation breakdown for GET /api/v1/forecasts/:resortId
type ResortDetailResponse struct {
	AggregatedForecastResponse
	PrimaryAspects []weatherv1alpha1.Aspect `json:"primaryAspects"`
	MidMountainFt  int                      `json:"midMountainFt"`
	LapseRateF     float64                  `json:"lapseRateFPer1000Ft"`
	ForecastHours  []ForecastHourItem       `json:"forecastHours,omitempty"`
}

// ForecastHourItem represents an hourly elevation tier slice
type ForecastHourItem struct {
	Timestamp   time.Time `json:"timestamp"`
	BaseTempF   float64   `json:"baseTempF"`
	SummitTempF float64   `json:"summitTempF"`
	BasePhase   string    `json:"basePhase"`
	SummitPhase string    `json:"summitPhase"`
	SnowfallIn  float64   `json:"snowfallInches"`
}

// HaversineDistanceMiles calculates great-circle distance between two GPS coordinates in statute miles
func HaversineDistanceMiles(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusMiles = 3958.8

	dLat := (lat2 - lat1) * (math.Pi / 180.0)
	dLon := (lon2 - lon1) * (math.Pi / 180.0)

	rLat1 := lat1 * (math.Pi / 180.0)
	rLat2 := lat2 * (math.Pi / 180.0)

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(rLat1)*math.Cos(rLat2)*
			math.Sin(dLon/2)*math.Sin(dLon/2)

	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	miles := earthRadiusMiles * c
	return math.Round(miles*10) / 10
}

// EstimateDriveTime estimates highway/mountain access travel time given straight line distance
func EstimateDriveTime(miles float64) string {
	// Average ~50 mph accounting for mountain access roads and winter weather
	hours := miles / 50.0
	h := int(hours)
	m := int((hours - float64(h)) * 60)
	if h == 0 {
		return formatMins(m)
	}
	return formatHoursMins(h, m)
}

func formatMins(m int) string {
	if m < 15 {
		m = 15
	}
	return (time.Duration(m) * time.Minute).String()
}

func formatHoursMins(h, m int) string {
	return (time.Duration(h)*time.Hour + time.Duration(m)*time.Minute).String()
}

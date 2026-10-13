package testutil

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"time"
)

// WeatherScenario defines the meteorological condition simulated by the mock server
type WeatherScenario string

const (
	ScenarioNoreaster      WeatherScenario = "noreaster"
	ScenarioColdSnap       WeatherScenario = "cold_snap"
	ScenarioThawFreeze     WeatherScenario = "thaw_freeze"
	ScenarioMalformed      WeatherScenario = "malformed"
	ScenarioProviderOutage WeatherScenario = "provider_outage"
	ScenarioRainSnowSplit  WeatherScenario = "rain_snow_split"
)

// MockWeatherServer simulates NOAA NWS and Open-Meteo APIs for offline testing and local Kind/Tilt loops
type MockWeatherServer struct {
	server   *httptest.Server
	scenario WeatherScenario
}

// NewMockWeatherServer constructs an offline mock HTTP server
func NewMockWeatherServer(scenario WeatherScenario) *MockWeatherServer {
	m := &MockWeatherServer{scenario: scenario}
	mux := http.NewServeMux()

	// 1. NOAA NWS /points/{lat},{lon}
	mux.HandleFunc("/points/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if m.scenario == ScenarioProviderOutage {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"status": 503, "error": "upstream outage"}`))
			return
		}
		if m.scenario == ScenarioMalformed {
			_, _ = w.Write([]byte(`{ "invalid_json": true `))
			return
		}
		// Return grid resolution
		_, _ = w.Write([]byte(`{
			"properties": {
				"gridId": "BTV",
				"gridX": 95,
				"gridY": 65,
				"forecastHourly": "` + m.server.URL + `/gridpoints/BTV/95,65/forecast/hourly"
			}
		}`))
	})

	// 2. NOAA NWS /gridpoints/{wfo}/{x},{y}/forecast/hourly
	mux.HandleFunc("/gridpoints/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if m.scenario == ScenarioMalformed {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`Internal server error`))
			return
		}
		m.writeNOAAHourly(w)
	})

	// 3. Open-Meteo /v1/forecast
	mux.HandleFunc("/v1/forecast", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if m.scenario == ScenarioProviderOutage {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error": true, "reason": "outage"}`))
			return
		}
		if m.scenario == ScenarioMalformed {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		m.writeOpenMeteoHourly(w, r)
	})

	m.server = httptest.NewServer(mux)
	return m
}

// URL returns the mock server base URL
func (m *MockWeatherServer) URL() string {
	return m.server.URL
}

// Close shuts down the mock server
func (m *MockWeatherServer) Close() {
	m.server.Close()
}

// SetScenario dynamically changes the active meteorological scenario
func (m *MockWeatherServer) SetScenario(s WeatherScenario) {
	m.scenario = s
}

func (m *MockWeatherServer) writeNOAAHourly(w http.ResponseWriter) {
	now := time.Now().Truncate(time.Hour)
	type Period struct {
		Number          int                 `json:"number"`
		StartTime       time.Time           `json:"startTime"`
		EndTime         time.Time           `json:"endTime"`
		Temperature     float64             `json:"temperature"`
		TemperatureUnit string              `json:"temperatureUnit"`
		Probability     map[string]*float64 `json:"probabilityOfPrecipitation"`
		Dewpoint        map[string]*float64 `json:"dewpoint"`
		Humidity        map[string]*float64 `json:"relativeHumidity"`
		WindSpeed       string              `json:"windSpeed"`
		WindGust        string              `json:"windGust"`
		ShortForecast   string              `json:"shortForecast"`
	}

	var periods []Period
	numHours := 24

	for i := 0; i < numHours; i++ {
		startTime := now.Add(time.Duration(i) * time.Hour)
		endTime := startTime.Add(time.Hour)

		var tempF float64
		var precipProb float64
		var windSpeed string
		var windGust string
		var shortForecast string

		switch m.scenario {
		case ScenarioNoreaster:
			// Major storm: 28F base, 95% precip, 35-50mph winds
			tempF = 28.0 + float64(i%3)
			precipProb = 95.0
			windSpeed = "35 mph"
			windGust = "55 mph"
			shortForecast = "Heavy Snow"
		case ScenarioColdSnap:
			// Cold snap: -5F base, 0% precip, 20mph winds
			tempF = -5.0 + float64(i%4)
			precipProb = 0.0
			windSpeed = "20 mph"
			windGust = "35 mph"
			shortForecast = "Mostly Sunny"
		case ScenarioThawFreeze:
			// Rain to freeze transition
			if i < 8 {
				tempF = 42.0 // Rain event
				precipProb = 85.0
				shortForecast = "Rain"
			} else {
				tempF = 18.0 // Freeze
				precipProb = 20.0
				shortForecast = "Scattered Snow Showers"
			}
			windSpeed = "25 mph"
			windGust = "40 mph"
		default:
			tempF = 30.0
			precipProb = 50.0
			windSpeed = "10 mph"
			windGust = "15 mph"
			shortForecast = "Partly Cloudy"
		}

		dewVal := tempF - 4.0
		humidityVal := 85.0
		periods = append(periods, Period{
			Number:          i + 1,
			StartTime:       startTime,
			EndTime:         endTime,
			Temperature:     tempF,
			TemperatureUnit: "F",
			Probability:     map[string]*float64{"value": &precipProb},
			Dewpoint:        map[string]*float64{"value": &dewVal},
			Humidity:        map[string]*float64{"value": &humidityVal},
			WindSpeed:       windSpeed,
			WindGust:        windGust,
			ShortForecast:   shortForecast,
		})
	}

	payload := map[string]any{
		"properties": map[string]any{
			"generatedAt": now,
			"periods":     periods,
		},
	}
	_ = json.NewEncoder(w).Encode(payload)
}

func (m *MockWeatherServer) writeOpenMeteoHourly(w http.ResponseWriter, r *http.Request) {
	now := time.Now().Truncate(time.Hour)
	elevParam := r.URL.Query().Get("elevation")
	isSummit := strings.Contains(elevParam, "12") || strings.Contains(elevParam, "13") // summit meters proxy

	numHours := 24
	times := make([]string, numHours)
	temps := make([]float64, numHours)
	humidity := make([]float64, numHours)
	dews := make([]float64, numHours)
	precipProb := make([]float64, numHours)
	precip := make([]float64, numHours)
	snowfall := make([]float64, numHours)
	freezingLevel := make([]float64, numHours)
	windSpeed := make([]float64, numHours)
	windGust := make([]float64, numHours)
	windDir := make([]float64, numHours)
	temp850 := make([]float64, numHours)
	temp700 := make([]float64, numHours)

	for i := 0; i < numHours; i++ {
		times[i] = now.Add(time.Duration(i) * time.Hour).Format("2006-01-02T15:04")
		humidity[i] = 85.0
		dews[i] = -5.0
		windDir[i] = 315.0
		temp850[i] = -8.0
		temp700[i] = -14.0

		switch m.scenario {
		case ScenarioNoreaster:
			if isSummit {
				temps[i] = -8.0   // -8C (~17.6F)
				precip[i] = 6.5   // 6.5 mm
				snowfall[i] = 9.5 // 9.5 cm
			} else {
				temps[i] = -2.0 // -2C (~28.4F)
				precip[i] = 6.0
				snowfall[i] = 6.0
			}
			precipProb[i] = 95.0
			freezingLevel[i] = 400.0 // 400 meters
			windSpeed[i] = 55.0      // km/h
			windGust[i] = 85.0       // km/h
		case ScenarioColdSnap:
			temps[i] = -18.0 // sub-zero
			precip[i] = 0.0
			snowfall[i] = 0.0
			precipProb[i] = 5.0
			freezingLevel[i] = 0.0
			windSpeed[i] = 40.0
			windGust[i] = 60.0
		case ScenarioThawFreeze:
			if i < 8 {
				temps[i] = 5.0 // +5C rain
				precip[i] = 4.0
				snowfall[i] = 0.0
				freezingLevel[i] = 2000.0
			} else {
				temps[i] = -8.0 // freeze
				precip[i] = 0.5
				snowfall[i] = 1.0
				freezingLevel[i] = 300.0
			}
			precipProb[i] = 75.0
			windSpeed[i] = 45.0
			windGust[i] = 70.0
		default:
			temps[i] = -1.0
			precip[i] = 1.0
			snowfall[i] = 1.0
			precipProb[i] = 50.0
			freezingLevel[i] = 800.0
			windSpeed[i] = 20.0
			windGust[i] = 30.0
		}
	}

	payload := map[string]any{
		"elevation": 1000.0,
		"hourly": map[string]any{
			"time":                      times,
			"temperature_2m":            temps,
			"relative_humidity_2m":      humidity,
			"dew_point_2m":              dews,
			"precipitation_probability": precipProb,
			"precipitation":             precip,
			"snowfall":                  snowfall,
			"freezing_level_height":     freezingLevel,
			"wind_speed_10m":            windSpeed,
			"wind_gusts_10m":            windGust,
			"wind_direction_10m":        windDir,
			"temperature_850hPa":        temp850,
			"temperature_700hPa":        temp700,
		},
	}
	_ = json.NewEncoder(w).Encode(payload)
}

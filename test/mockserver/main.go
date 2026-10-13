package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"time"
)

// Scenario types for offline weather simulation
type Scenario string

const (
	ScenarioClassicNoreaster Scenario = "ScenarioClassicNoreaster"
	ScenarioRainSnowSplit    Scenario = "ScenarioRainSnowSplit"
	ScenarioWindHold         Scenario = "ScenarioWindHold"
	ScenarioProviderOutage   Scenario = "ScenarioProviderOutage"
)

var (
	port            = flag.Int("port", 8080, "HTTP listen port")
	defaultScenario = flag.String("scenario", string(ScenarioClassicNoreaster), "Default weather scenario")
)

func main() {
	flag.Parse()

	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// Open-Meteo endpoint: /v1/forecast
	mux.HandleFunc("/v1/forecast", handleOpenMeteo)

	// NOAA NWS endpoints: /points/* and /gridpoints/*
	mux.HandleFunc("/points/", handleNOAAPoints)
	mux.HandleFunc("/gridpoints/", handleNOAAGridpoints)

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("Starting Mock Meteorological Weather Server on %s (default scenario: %s)", addr, *defaultScenario)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Mock server failed: %v", err)
	}
}

func getActiveScenario(r *http.Request) Scenario {
	if s := r.Header.Get("X-Mock-Scenario"); s != "" {
		return Scenario(s)
	}
	if s := r.URL.Query().Get("scenario"); s != "" {
		return Scenario(s)
	}
	return Scenario(*defaultScenario)
}

func handleNOAAPoints(w http.ResponseWriter, r *http.Request) {
	scenario := getActiveScenario(r)
	if scenario == ScenarioProviderOutage {
		w.Header().Set("Retry-After", "60")
		http.Error(w, `{"status": 503, "detail": "NOAA upstream outage"}`, http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/geo+json")
	resp := map[string]interface{}{
		"properties": map[string]interface{}{
			"cwa":            "BTV",
			"gridX":          64,
			"gridY":          82,
			"forecast":       fmt.Sprintf("http://%s/gridpoints/BTV/64,82/forecast", r.Host),
			"forecastHourly": fmt.Sprintf("http://%s/gridpoints/BTV/64,82/forecast/hourly", r.Host),
			"forecastGridData": fmt.Sprintf("http://%s/gridpoints/BTV/64,82", r.Host),
		},
	}
	_ = json.NewEncoder(w).Encode(resp)
}

func handleNOAAGridpoints(w http.ResponseWriter, r *http.Request) {
	scenario := getActiveScenario(r)
	if scenario == ScenarioProviderOutage {
		w.Header().Set("Retry-After", "60")
		http.Error(w, `{"status": 503, "detail": "NOAA upstream outage"}`, http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/geo+json")

	// Determine precipitation amounts and wind based on scenario
	qpfVal := 45.7 // ~1.8 inches
	windVal := 32.0 // km/h
	snowVal := 45.7 // cm
	freezingLevelM := 600.0 // meters (~2,000 ft)

	switch scenario {
	case ScenarioRainSnowSplit:
		freezingLevelM = 670.0 // ~2,200 ft
		qpfVal = 25.0
		snowVal = 15.0
	case ScenarioWindHold:
		windVal = 105.0 // ~65 mph
		qpfVal = 2.5
		snowVal = 2.0
		freezingLevelM = 300.0
	}

	resp := map[string]interface{}{
		"properties": map[string]interface{}{
			"quantitativePrecipitation": map[string]interface{}{
				"uom": "wmoUnit:mm",
				"values": []map[string]interface{}{
					{"validTime": "2026-10-14T00:00:00Z/PT24H", "value": qpfVal},
				},
			},
			"snowfallAmount": map[string]interface{}{
				"uom": "wmoUnit:mm",
				"values": []map[string]interface{}{
					{"validTime": "2026-10-14T00:00:00Z/PT24H", "value": snowVal * 10},
				},
			},
			"windSpeed": map[string]interface{}{
				"uom": "wmoUnit:km_h-1",
				"values": []map[string]interface{}{
					{"validTime": "2026-10-14T00:00:00Z/PT24H", "value": windVal},
				},
			},
			"freezingLevel": map[string]interface{}{
				"uom": "wmoUnit:m",
				"values": []map[string]interface{}{
					{"validTime": "2026-10-14T00:00:00Z/PT24H", "value": freezingLevelM},
				},
			},
		},
	}
	_ = json.NewEncoder(w).Encode(resp)
}

func handleOpenMeteo(w http.ResponseWriter, r *http.Request) {
	scenario := getActiveScenario(r)
	if scenario == ScenarioProviderOutage {
		w.Header().Set("Retry-After", "60")
		http.Error(w, `{"error": true, "reason": "Open-Meteo 429 rate limit exceeded"}`, http.StatusTooManyRequests)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// 24 hours of data
	times := make([]string, 24)
	temps := make([]float64, 24)
	dew := make([]float64, 24)
	rh := make([]float64, 24)
	qpf := make([]float64, 24)
	snow := make([]float64, 24)
	wind := make([]float64, 24)
	gusts := make([]float64, 24)
	windDir := make([]float64, 24)
	freezeHeight := make([]float64, 24)

	// Pressure levels
	t850 := make([]float64, 24)
	t700 := make([]float64, 24)

	now := time.Now().UTC()
	for i := 0; i < 24; i++ {
		t := now.Add(time.Duration(i) * time.Hour)
		times[i] = t.Format("2006-01-02T15:04")
		rh[i] = 95.0
		windDir[i] = 315.0

		switch scenario {
		case ScenarioClassicNoreaster:
			temps[i] = -8.0      // -8°C (~17°F)
			dew[i] = -9.0
			qpf[i] = 2.0         // 2mm/hr -> 48mm total (~1.8")
			snow[i] = 3.6        // 3.6cm/hr -> ~34" total blower
			wind[i] = 32.0       // 20 mph
			gusts[i] = 48.0      // 30 mph
			freezeHeight[i] = 400.0 // ~1300 ft
			t850[i] = -12.0      // in DGZ
			t700[i] = -16.0      // in DGZ

		case ScenarioRainSnowSplit:
			temps[i] = 1.5       // ~35°F at base, colder at summit
			dew[i] = 0.5
			qpf[i] = 1.5
			snow[i] = 0.5        // light/slush at base
			wind[i] = 25.0
			gusts[i] = 35.0
			freezeHeight[i] = 670.0 // ~2,200 ft
			t850[i] = -4.0
			t700[i] = -10.0

		case ScenarioWindHold:
			temps[i] = -15.0     // 5°F
			dew[i] = -18.0
			qpf[i] = 0.1
			snow[i] = 0.2
			wind[i] = 80.0       // 50 mph sustained
			gusts[i] = 105.0     // 65 mph gusts
			freezeHeight[i] = 100.0
			t850[i] = -18.0
			t700[i] = -24.0

		default:
			temps[i] = -4.0
			dew[i] = -6.0
			qpf[i] = 1.0
			snow[i] = 1.5
			wind[i] = 20.0
			gusts[i] = 30.0
			freezeHeight[i] = 500.0
			t850[i] = -8.0
			t700[i] = -14.0
		}
	}

	resp := map[string]interface{}{
		"elevation": 500,
		"hourly": map[string]interface{}{
			"time":                       times,
			"temperature_2m":             temps,
			"dew_point_2m":               dew,
			"relative_humidity_2m":       rh,
			"precipitation":              qpf,
			"snowfall":                   snow,
			"wind_speed_10m":             wind,
			"wind_gusts_10m":             gusts,
			"wind_direction_10m":         windDir,
			"freezing_level_height":      freezeHeight,
			"temperature_850hPa":         t850,
			"temperature_700hPa":         t700,
			"precipitation_probability": make([]float64, 24),
			"relative_humidity_850hPa":  rh,
			"wind_speed_850hPa":          wind,
			"geopotential_height_850hPa": make([]float64, 24),
			"relative_humidity_700hPa":  rh,
			"wind_speed_700hPa":          wind,
			"geopotential_height_700hPa": make([]float64, 24),
		},
	}
	_ = json.NewEncoder(w).Encode(resp)
}

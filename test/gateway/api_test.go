package gateway_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"

	"github.com/powderpredictor/operator/pkg/gateway"
)

func TestGatewayContractAndE2E(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	scheme := runtime.NewScheme()

	// 1. Pre-populate fake dynamic client with unstructured ResortTarget and SnowForecastReport
	killingtonTarget := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "weather.powderpredictor.io/v1alpha1",
			"kind":       "ResortTarget",
			"metadata": map[string]interface{}{
				"name":      "killington",
				"namespace": "powder-system",
			},
			"spec": map[string]interface{}{
				"region":            "VT",
				"latitude":          43.6263,
				"longitude":         -72.7969,
				"baseElevationFt":   int64(1165),
				"summitElevationFt": int64(4241),
				"skiableAcres":      int64(1509),
				"primaryAspects":    []interface{}{"North", "East"},
			},
		},
	}

	jayTarget := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "weather.powderpredictor.io/v1alpha1",
			"kind":       "ResortTarget",
			"metadata": map[string]interface{}{
				"name":      "jay-peak",
				"namespace": "powder-system",
			},
			"spec": map[string]interface{}{
				"region":            "VT",
				"latitude":          44.9248,
				"longitude":         -72.5034,
				"baseElevationFt":   int64(1815),
				"summitElevationFt": int64(3968),
				"skiableAcres":      int64(385),
				"primaryAspects":    []interface{}{"NorthEast"},
			},
		},
	}

	killingtonReport := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "weather.powderpredictor.io/v1alpha1",
			"kind":       "SnowForecastReport",
			"metadata": map[string]interface{}{
				"name":      "killington-forecast",
				"namespace": "powder-system",
			},
			"spec": map[string]interface{}{
				"resortRef": map[string]interface{}{
					"name": "killington",
				},
				"powderScore":             int64(82),
				"predictedSnowfallInches": 12.5,
				"snowToLiquidRatio":       14.0,
				"confidenceInterval":      90.0,
				"windowStart":             "2026-10-15T00:00:00Z",
				"windowEnd":               "2026-10-17T00:00:00Z",
			},
			"status": map[string]interface{}{
				"conditions": []interface{}{
					map[string]interface{}{
						"type":   "GladesRecommended",
						"status": "True",
					},
				},
			},
		},
	}

	jayReport := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "weather.powderpredictor.io/v1alpha1",
			"kind":       "SnowForecastReport",
			"metadata": map[string]interface{}{
				"name":      "jay-peak-forecast",
				"namespace": "powder-system",
			},
			"spec": map[string]interface{}{
				"resortRef": map[string]interface{}{
					"name": "jay-peak",
				},
				"powderScore":             int64(95),
				"predictedSnowfallInches": 18.0,
				"snowToLiquidRatio":       18.0,
				"confidenceInterval":      94.0,
				"windowStart":             "2026-10-15T00:00:00Z",
				"windowEnd":               "2026-10-17T00:00:00Z",
			},
		},
	}

	fakeDynClient := fake.NewSimpleDynamicClient(scheme, killingtonTarget, jayTarget, killingtonReport, jayReport)

	broker := gateway.NewEventBroker()
	defer broker.Close()

	store := gateway.NewInClusterStore(broker)
	err := store.StartInformerSync(ctx, fakeDynClient, 0)
	if err != nil {
		t.Fatalf("failed starting informer sync against fake dynamic client: %v", err)
	}

	server := gateway.NewServer(store, broker)

	// 2. Test sorting by powder score descending
	t.Run("Contract: Sorting by PowderScore Descending", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/forecasts?sort_by=powder_score&order=desc", nil)
		w := httptest.NewRecorder()
		server.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", w.Code)
		}

		var resp struct {
			Count int                                  `json:"count"`
			Items []gateway.AggregatedForecastResponse `json:"items"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode JSON: %v", err)
		}

		if resp.Count != 2 {
			t.Fatalf("expected 2 items, got %d", resp.Count)
		}
		if resp.Items[0].ResortID != "jay-peak" || resp.Items[0].PowderScore != 95 {
			t.Errorf("expected top item to be jay-peak with 95, got %s (%d)", resp.Items[0].ResortID, resp.Items[0].PowderScore)
		}
		if resp.Items[1].ResortID != "killington" || resp.Items[1].PowderScore != 82 {
			t.Errorf("expected second item to be killington with 82, got %s (%d)", resp.Items[1].ResortID, resp.Items[1].PowderScore)
		}
	})

	// 3. Test filtering edge cases (e.g. non-existent region or high threshold)
	t.Run("Contract: Filtering with Zero Match", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/forecasts?region=CO", nil)
		w := httptest.NewRecorder()
		server.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", w.Code)
		}

		var resp struct {
			Count int                                  `json:"count"`
			Items []gateway.AggregatedForecastResponse `json:"items"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp.Count != 0 || len(resp.Items) != 0 {
			t.Errorf("expected empty items array for Colorado filter, got %d", resp.Count)
		}
	})

	// 4. Test Proximity Distance Deltas
	t.Run("Contract: Geographic Distance Deltas", func(t *testing.T) {
		// New York City (40.7128, -74.0060): Killington is closer than Jay Peak
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/forecasts?user_lat=40.7128&user_lon=-74.0060&sort_by=distance&order=asc", nil)
		w := httptest.NewRecorder()
		server.Handler().ServeHTTP(w, req)

		var resp struct {
			Items []gateway.AggregatedForecastResponse `json:"items"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if len(resp.Items) < 2 {
			t.Fatalf("expected at least 2 items")
		}
		if resp.Items[0].ResortID != "killington" {
			t.Errorf("expected Killington to be closer to NYC than Jay Peak, got %s", resp.Items[0].ResortID)
		}
		if resp.Items[0].DistanceMiles == nil || *resp.Items[0].DistanceMiles <= 0 {
			t.Errorf("expected valid positive mileage")
		}
	})

	// 5. Test Metrics endpoint
	t.Run("Contract: Prometheus Metrics Endpoint", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/metrics", nil)
		w := httptest.NewRecorder()
		server.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK on /metrics, got %d", w.Code)
		}
		metricsOut := w.Body.String()
		if !strings.Contains(metricsOut, "powder_api_http_requests_total") {
			t.Errorf("missing powder_api_http_requests_total in metrics output")
		}
		if !strings.Contains(metricsOut, "powder_api_informer_cache_sync_status") {
			t.Errorf("missing powder_api_informer_cache_sync_status in metrics output")
		}
	})

	// 6. Test SSE Event Broadcasting with injected update
	t.Run("Contract: Injected Informer Update Triggers SSE Stream Event", func(t *testing.T) {
		sseCtx, sseCancel := context.WithCancel(context.Background())
		defer sseCancel()

		req, _ := http.NewRequestWithContext(sseCtx, http.MethodGet, "/api/v1/events/stream", nil)
		w := httptest.NewRecorder()

		go func() {
			time.Sleep(50 * time.Millisecond)
			// Trigger an update on killington forecast with powder score 92 (crosses threshold >= 85)
			broker.BroadcastForecastUpdate("killington", 92, 14.0, map[string]interface{}{
				"powderScore": 92,
				"snowfall":    14.0,
			})
			time.Sleep(50 * time.Millisecond)
			sseCancel()
		}()

		server.Handler().ServeHTTP(w, req)
		body := w.Body.String()

		if !strings.Contains(body, "event: forecast.updated") {
			t.Errorf("expected forecast.updated in stream, got:\n%s", body)
		}
		if !strings.Contains(body, "event: powder.alert") {
			t.Errorf("expected powder.alert in stream for score 92, got:\n%s", body)
		}
	})
}

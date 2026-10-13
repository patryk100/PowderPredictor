package gateway

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
)

func setupTestServer() (*Server, *InClusterStore, *EventBroker) {
	broker := NewEventBroker()
	store := NewInClusterStore(broker)

	// Seed sample resort targets
	jay := &weatherv1alpha1.ResortTarget{
		ObjectMeta: metav1.ObjectMeta{
			Name: "jay-peak",
		},
		Spec: weatherv1alpha1.ResortTargetSpec{
			Region:            "VT",
			Latitude:          44.9248,
			Longitude:         -72.5257,
			BaseElevationFt:   1815,
			SummitElevationFt: 3968,
			SkiableAcres:      385,
			PrimaryAspects: []weatherv1alpha1.Aspect{
				weatherv1alpha1.AspectNorthEast,
				weatherv1alpha1.AspectEast,
			},
		},
	}
	killington := &weatherv1alpha1.ResortTarget{
		ObjectMeta: metav1.ObjectMeta{
			Name: "killington",
		},
		Spec: weatherv1alpha1.ResortTargetSpec{
			Region:            "VT",
			Latitude:          43.6263,
			Longitude:         -72.7969,
			BaseElevationFt:   1165,
			SummitElevationFt: 4241,
			SkiableAcres:      1509,
			PrimaryAspects: []weatherv1alpha1.Aspect{
				weatherv1alpha1.AspectNorth,
			},
		},
	}
	store.targets["jay-peak"] = jay
	store.targets["killington"] = killington

	// Seed sample forecast reports
	jayReport := &weatherv1alpha1.SnowForecastReport{
		ObjectMeta: metav1.ObjectMeta{
			Name: "jay-peak-forecast",
		},
		Spec: weatherv1alpha1.SnowForecastReportSpec{
			ResortRef: corev1.LocalObjectReference{
				Name: jay.Name,
			},
			PowderScore:             94,
			PredictedSnowfallInches: 16.5,
			SnowToLiquidRatio:       17.0,
			ConfidenceInterval:      92.0,
		},
		Status: weatherv1alpha1.SnowForecastReportStatus{
			Conditions: []metav1.Condition{
				{
					Type:   "GladesRecommended",
					Status: metav1.ConditionTrue,
				},
			},
		},
	}
	killingtonReport := &weatherv1alpha1.SnowForecastReport{
		ObjectMeta: metav1.ObjectMeta{
			Name: "killington-forecast",
		},
		Spec: weatherv1alpha1.SnowForecastReportSpec{
			ResortRef: corev1.LocalObjectReference{
				Name: killington.Name,
			},
			PowderScore:             72,
			PredictedSnowfallInches: 8.0,
			SnowToLiquidRatio:       12.0,
			ConfidenceInterval:      88.0,
		},
	}
	store.reports["jay-peak-forecast"] = jayReport
	store.reports["killington-forecast"] = killingtonReport

	server := NewServer(store, broker)
	return server, store, broker
}

func TestListForecasts_SortingAndFiltering(t *testing.T) {
	server, _, _ := setupTestServer()

	// 1. GET /api/v1/forecasts sorted by powder_score desc
	req, _ := http.NewRequest(http.MethodGet, "/api/v1/forecasts?sort_by=powder_score&order=desc", nil)
	w := httptest.NewRecorder()
	server.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}

	var res struct {
		Count int                          `json:"count"`
		Items []AggregatedForecastResponse `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed parsing response JSON: %v", err)
	}

	if res.Count != 2 {
		t.Fatalf("expected 2 items, got %d", res.Count)
	}
	if res.Items[0].ResortID != "jay-peak" {
		t.Errorf("expected highest score to be jay-peak (94), got %s", res.Items[0].ResortID)
	}
	if !res.Items[0].GladesRecommended {
		t.Errorf("expected GladesRecommended flag for jay-peak")
	}

	// 2. Proximity calculation with Boston coordinates (42.3601, -71.0589)
	req2, _ := http.NewRequest(http.MethodGet, "/api/v1/forecasts?user_lat=42.3601&user_lon=-71.0589", nil)
	w2 := httptest.NewRecorder()
	server.Handler().ServeHTTP(w2, req2)

	var res2 struct {
		Items []AggregatedForecastResponse `json:"items"`
	}
	_ = json.Unmarshal(w2.Body.Bytes(), &res2)
	if res2.Items[0].DistanceMiles == nil {
		t.Fatalf("expected distance miles to be calculated")
	}
	if *res2.Items[0].DistanceMiles <= 0 {
		t.Errorf("expected positive distance, got %.1f", *res2.Items[0].DistanceMiles)
	}
}

func TestGetResortForecast_DetailAndNotFound(t *testing.T) {
	server, _, _ := setupTestServer()

	// 1. Found: jay-peak
	req, _ := http.NewRequest(http.MethodGet, "/api/v1/forecasts/jay-peak", nil)
	w := httptest.NewRecorder()
	server.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}

	var detail ResortDetailResponse
	if err := json.Unmarshal(w.Body.Bytes(), &detail); err != nil {
		t.Fatalf("failed to decode detail JSON: %v", err)
	}
	if detail.ResortID != "jay-peak" || detail.PowderScore != 94 {
		t.Errorf("expected jay-peak with 94 score, got %+v", detail)
	}
	if detail.MidMountainFt != 2891 {
		t.Errorf("expected mid mountain 2891, got %d", detail.MidMountainFt)
	}

	// 2. Not found
	reqNF, _ := http.NewRequest(http.MethodGet, "/api/v1/forecasts/non-existent-mountain", nil)
	wNF := httptest.NewRecorder()
	server.Handler().ServeHTTP(wNF, reqNF)

	if wNF.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing resort, got %d", wNF.Code)
	}
}

func TestSSEEventStream(t *testing.T) {
	server, _, broker := setupTestServer()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "/api/v1/events/stream", nil)
	w := httptest.NewRecorder()

	go func() {
		// Wait for subscriber registration
		time.Sleep(50 * time.Millisecond)
		if broker.SubscriberCount() != 1 {
			t.Errorf("expected 1 subscriber, got %d", broker.SubscriberCount())
		}

		// Broadcast update
		broker.BroadcastForecastUpdate("jay-peak", 95, 18.0, map[string]string{"msg": "powder alert!"})

		// Give time for flush then cancel
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	server.Handler().ServeHTTP(w, req)

	body := w.Body.String()
	if !strings.Contains(body, "event: forecast.updated") {
		t.Errorf("expected forecast.updated in stream, got:\n%s", body)
	}
	if !strings.Contains(body, "event: powder.alert") {
		t.Errorf("expected powder.alert in stream, got:\n%s", body)
	}
}

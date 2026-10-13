package gateway

import (
	"context"
	"fmt"
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/tools/cache"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
)

var (
	ResortTargetGVR = schema.GroupVersionResource{
		Group:    "weather.powderpredictor.io",
		Version:  "v1alpha1",
		Resource: "resorttargets",
	}

	SnowForecastReportGVR = schema.GroupVersionResource{
		Group:    "weather.powderpredictor.io",
		Version:  "v1alpha1",
		Resource: "snowforecastreports",
	}
)

// InClusterStore maintains an in-memory synchronized view of ResortTargets and SnowForecastReports
type InClusterStore struct {
	mu        sync.RWMutex
	targets   map[string]*weatherv1alpha1.ResortTarget
	reports   map[string]*weatherv1alpha1.SnowForecastReport
	broker    *EventBroker
	hasSynced func() bool
}

// NewInClusterStore initializes an empty in-memory store
func NewInClusterStore(broker *EventBroker) *InClusterStore {
	return &InClusterStore{
		targets: make(map[string]*weatherv1alpha1.ResortTarget),
		reports: make(map[string]*weatherv1alpha1.SnowForecastReport),
		broker:  broker,
	}
}

// StartInformerSync configures dynamic informers and syncs cluster CRs into memory
func (s *InClusterStore) StartInformerSync(
	ctx context.Context,
	dynClient dynamic.Interface,
	resyncDuration time.Duration,
) error {
	factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(dynClient, resyncDuration, "", nil)

	targetInformer := factory.ForResource(ResortTargetGVR).Informer()
	reportInformer := factory.ForResource(SnowForecastReportGVR).Informer()

	scheme := runtime.NewScheme()
	if err := weatherv1alpha1.AddToScheme(scheme); err != nil {
		return fmt.Errorf("failed to add scheme: %w", err)
	}

	// 1. ResortTarget Event Handlers
	_, err := targetInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			if target, err := convertToResortTarget(scheme, obj); err == nil && target != nil {
				s.mu.Lock()
				s.targets[target.Name] = target
				s.mu.Unlock()
			}
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			if target, err := convertToResortTarget(scheme, newObj); err == nil && target != nil {
				s.mu.Lock()
				s.targets[target.Name] = target
				s.mu.Unlock()
			}
		},
		DeleteFunc: func(obj interface{}) {
			if target, err := convertToResortTarget(scheme, obj); err == nil && target != nil {
				s.mu.Lock()
				delete(s.targets, target.Name)
				s.mu.Unlock()
			}
		},
	})
	if err != nil {
		return fmt.Errorf("failed adding target event handler: %w", err)
	}

	// 2. SnowForecastReport Event Handlers
	_, err = reportInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			if report, err := convertToSnowForecastReport(scheme, obj); err == nil && report != nil {
				s.mu.Lock()
				s.reports[report.Name] = report
				resortName := report.Spec.ResortRef.Name
				s.mu.Unlock()

				if s.broker != nil && resortName != "" {
					s.broker.BroadcastForecastUpdate(resortName, report.Spec.PowderScore, report.Spec.PredictedSnowfallInches, report)
				}
			}
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			if report, err := convertToSnowForecastReport(scheme, newObj); err == nil && report != nil {
				s.mu.Lock()
				s.reports[report.Name] = report
				resortName := report.Spec.ResortRef.Name
				s.mu.Unlock()

				if s.broker != nil && resortName != "" {
					s.broker.BroadcastForecastUpdate(resortName, report.Spec.PowderScore, report.Spec.PredictedSnowfallInches, report)
				}
			}
		},
		DeleteFunc: func(obj interface{}) {
			if report, err := convertToSnowForecastReport(scheme, obj); err == nil && report != nil {
				s.mu.Lock()
				delete(s.reports, report.Name)
				s.mu.Unlock()
			}
		},
	})
	if err != nil {
		return fmt.Errorf("failed adding report event handler: %w", err)
	}

	factory.Start(ctx.Done())

	s.hasSynced = func() bool {
		return targetInformer.HasSynced() && reportInformer.HasSynced()
	}

	// Wait for cache sync
	if !cache.WaitForCacheSync(ctx.Done(), targetInformer.HasSynced, reportInformer.HasSynced) {
		return fmt.Errorf("timed out or failed waiting for dynamic informer cache sync")
	}

	return nil
}

// HasSynced checks whether informers have completed initial synchronization
func (s *InClusterStore) HasSynced() bool {
	if s.hasSynced != nil {
		return s.hasSynced()
	}
	return true
}

// GetResortTarget retrieves a ResortTarget by name
func (s *InClusterStore) GetResortTarget(name string) (*weatherv1alpha1.ResortTarget, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.targets[name]
	return t, ok
}

// GetForecastReportForResort finds the active SnowForecastReport referencing the target resort
func (s *InClusterStore) GetForecastReportForResort(resortName string) (*weatherv1alpha1.SnowForecastReport, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Direct name check: <resort>-forecast
	directKey := fmt.Sprintf("%s-forecast", resortName)
	if rep, exists := s.reports[directKey]; exists {
		return rep, true
	}

	for _, rep := range s.reports {
		if rep.Spec.ResortRef.Name == resortName {
			return rep, true
		}
	}
	return nil, false
}

// ListTargets returns all in-memory ResortTargets
func (s *InClusterStore) ListTargets() []*weatherv1alpha1.ResortTarget {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]*weatherv1alpha1.ResortTarget, 0, len(s.targets))
	for _, t := range s.targets {
		out = append(out, t)
	}
	return out
}

func convertToResortTarget(scheme *runtime.Scheme, obj interface{}) (*weatherv1alpha1.ResortTarget, error) {
	u, ok := obj.(*unstructured.Unstructured)
	if !ok {
		return nil, fmt.Errorf("object is not *unstructured.Unstructured")
	}
	target := &weatherv1alpha1.ResortTarget{}
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, target); err != nil {
		return nil, err
	}
	return target, nil
}

func convertToSnowForecastReport(scheme *runtime.Scheme, obj interface{}) (*weatherv1alpha1.SnowForecastReport, error) {
	u, ok := obj.(*unstructured.Unstructured)
	if !ok {
		return nil, fmt.Errorf("object is not *unstructured.Unstructured")
	}
	report := &weatherv1alpha1.SnowForecastReport{}
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(u.Object, report); err != nil {
		return nil, err
	}
	return report, nil
}

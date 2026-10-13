/*
Copyright 2026.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package controller

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
	"github.com/powderpredictor/operator/pkg/ingestion"
	"github.com/powderpredictor/operator/pkg/model"
	"github.com/powderpredictor/operator/pkg/weather"
)

// ResortTargetReconciler reconciles a ResortTarget object
type ResortTargetReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder record.EventRecorder
	Pipeline *ingestion.IngestionPipeline
}

const resortTargetFinalizer = "weather.powderpredictor.io/finalizer"

// +kubebuilder:rbac:groups=weather.powderpredictor.io,resources=resorttargets,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=weather.powderpredictor.io,resources=resorttargets/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=weather.powderpredictor.io,resources=resorttargets/finalizers,verbs=update
// +kubebuilder:rbac:groups=weather.powderpredictor.io,resources=snowforecastreports,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=weather.powderpredictor.io,resources=snowforecastreports/status,verbs=get;update;patch
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups=coordination.k8s.io,resources=leases,verbs=get;list;watch;create;update;patch;delete

// Reconcile reconciles a ResortTarget object, managing finalizers, status conditions, and sync scheduling.
func (r *ResortTargetReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	target := &weatherv1alpha1.ResortTarget{}
	if err := r.Get(ctx, req.NamespacedName, target); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	// Handle object deletion lifecycle gracefully
	if !target.DeletionTimestamp.IsZero() {
		if controllerutil.ContainsFinalizer(target, resortTargetFinalizer) {
			log.Info("Performing external cleanup for ResortTarget", "name", target.Name)
			// Remove finalizer to allow garbage collection
			controllerutil.RemoveFinalizer(target, resortTargetFinalizer)
			if err := r.Update(ctx, target); err != nil {
				return ctrl.Result{}, err
			}
		}
		return ctrl.Result{}, nil
	}

	// Ensure finalizer is registered on active targets
	if !controllerutil.ContainsFinalizer(target, resortTargetFinalizer) {
		controllerutil.AddFinalizer(target, resortTargetFinalizer)
		if err := r.Update(ctx, target); err != nil {
			return ctrl.Result{}, err
		}
	}

	updater := NewConditionUpdater(r.Client)

	// Determine sync interval duration (default: 1 hour)
	syncDuration := 1 * time.Hour
	if target.Spec.SyncInterval != "" {
		if d, err := time.ParseDuration(target.Spec.SyncInterval); err == nil {
			syncDuration = d
		}
	}

	// Check if this is initial sync or if sync interval has elapsed
	shouldIngest := len(target.Status.Conditions) == 0 || target.Status.LastSyncTime == nil || time.Since(target.Status.LastSyncTime.Time) >= syncDuration

	if shouldIngest && r.Pipeline != nil {
		coords := weather.Coordinates{
			Latitude:  target.Spec.Latitude,
			Longitude: target.Spec.Longitude,
		}
		elev := weather.ElevationBounds{
			BaseElevationFt:   target.Spec.BaseElevationFt,
			SummitElevationFt: target.Spec.SummitElevationFt,
		}

		log.Info("Executing meteorological ingestion pipeline", "resort", target.Name)
		ingestResult, err := r.Pipeline.IngestTarget(ctx, target.Name, coords, elev)

		now := metav1.Now()
		target.Status.LastSyncTime = &now

		if ingestResult != nil {
			target.Status.NOAAHealthy = &ingestResult.NOAAHealthy
			target.Status.OpenMeteoHealthy = &ingestResult.OpenMeteoHealthy
		}

		if err != nil {
			log.Error(err, "Ingestion pipeline encountered failures", "resort", target.Name)
			SetResortTargetDegraded(target, weatherv1alpha1.ReasonSyncFailed, fmt.Sprintf("All meteorological providers failed: %v", err))
			if r.Recorder != nil {
				r.Recorder.Event(target, "Warning", "IngestionFailed", fmt.Sprintf("Meteorological ingestion failed: %v", err))
			}
			target.Status.IngestionBackoffCount++
			if updateErr := updater.UpdateResortTargetStatus(ctx, target); updateErr != nil {
				return ctrl.Result{}, updateErr
			}
			// Retry sooner on failure (e.g. 5 minutes)
			return ctrl.Result{RequeueAfter: 5 * time.Minute}, nil
		}

		// At least one provider succeeded
		target.Status.IngestionBackoffCount = 0

		// Execute microclimate modeling pipeline and sync child SnowForecastReport
		ensemblePredictions := []float64{ingestResult.Snapshot.TotalSummitSnowfallInches}
		evaluated := model.EvaluateTargetForecast(target, ingestResult.Snapshot, 30.0, ensemblePredictions)

		if syncErr := r.syncSnowForecastReport(ctx, target, evaluated); syncErr != nil {
			log.Error(syncErr, "Failed to sync SnowForecastReport", "resort", target.Name)
			return ctrl.Result{}, syncErr
		}

		statusMsg := fmt.Sprintf("Forecast updated (PowderScore: %d/100, Summit snow: %.1fin)", evaluated.PowderScore, evaluated.PredictedSnowfallInches)
		SetResortTargetReady(target, weatherv1alpha1.ReasonSyncSuccess, statusMsg)

		if r.Recorder != nil {
			r.Recorder.Event(target, "Normal", "IngestionSuccess", fmt.Sprintf("Ingested forecast from providers (Summit snow: %.1fin)", evaluated.PredictedSnowfallInches))
			if evaluated.PowderScore >= 80 {
				r.Recorder.Event(target, "Normal", "PowderAlert", fmt.Sprintf("PowderAlert: %s scored %d/100 with %.1f\" predicted", target.Name, evaluated.PowderScore, evaluated.PredictedSnowfallInches))
			}
			if evaluated.WindHoldWarning {
				r.Recorder.Event(target, "Warning", "WindHoldWarning", fmt.Sprintf("Elevated lift wind-hold risk: peak gust %.1fmph", evaluated.WindImpact.WindGustMph))
			}
		}

		if updateErr := updater.UpdateResortTargetStatus(ctx, target); updateErr != nil {
			return ctrl.Result{}, updateErr
		}
		return ctrl.Result{RequeueAfter: syncDuration}, nil
	} else if len(target.Status.Conditions) == 0 || target.Status.LastSyncTime == nil {
		now := metav1.Now()
		target.Status.LastSyncTime = &now
		SetResortTargetReady(target, weatherv1alpha1.ReasonSyncSuccess, "Target initialized")
		if err := updater.UpdateResortTargetStatus(ctx, target); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{RequeueAfter: syncDuration}, nil
	}

	// Calculate remaining time until next sync
	remaining := syncDuration - time.Since(target.Status.LastSyncTime.Time)
	return ctrl.Result{RequeueAfter: remaining}, nil
}

// syncSnowForecastReport creates or updates the child SnowForecastReport CR with controller reference
func (r *ResortTargetReconciler) syncSnowForecastReport(
	ctx context.Context,
	target *weatherv1alpha1.ResortTarget,
	eval *model.EvaluatedForecast,
) error {
	reportName := fmt.Sprintf("%s-forecast", target.Name)
	report := &weatherv1alpha1.SnowForecastReport{
		ObjectMeta: metav1.ObjectMeta{
			Name:      reportName,
			Namespace: target.Namespace,
		},
	}

	op, err := controllerutil.CreateOrUpdate(ctx, r.Client, report, func() error {
		// Set owner reference for garbage collection
		if err := controllerutil.SetControllerReference(target, report, r.Scheme); err != nil {
			return err
		}

		report.Spec.ResortRef = corev1.LocalObjectReference{
			Name: target.Name,
		}
		report.Spec.WindowStart = metav1.NewTime(eval.WindowStart)
		report.Spec.WindowEnd = metav1.NewTime(eval.WindowEnd)
		report.Spec.PredictedSnowfallInches = eval.PredictedSnowfallInches
		report.Spec.SnowToLiquidRatio = eval.SnowToLiquidRatio
		report.Spec.FreezingLevelElevationFt = eval.FreezingLevelElevationFt
		report.Spec.PowderScore = eval.PowderScore
		report.Spec.ConfidenceInterval = eval.ConfidenceInterval

		// Populate status conditions
		now := metav1.Now()
		report.Status.ComputedAt = &now

		conditions := make([]metav1.Condition, 0)
		if eval.GladesRecommended {
			conditions = append(conditions, metav1.Condition{
				Type:               "GladesRecommended",
				Status:             metav1.ConditionTrue,
				LastTransitionTime: now,
				Reason:             "LeewardLoading",
				Message:            "Protected aspects and tree runs recommended for fresh snow stashes",
			})
		}
		if eval.WindHoldWarning {
			conditions = append(conditions, metav1.Condition{
				Type:               "WindHoldWarning",
				Status:             metav1.ConditionTrue,
				LastTransitionTime: now,
				Reason:             "HighWindGusts",
				Message:            fmt.Sprintf("Sustained winds %.1fmph or gusts %.1fmph threaten lift operations", eval.WindImpact.SustainedWindMph, eval.WindImpact.WindGustMph),
			})
		}
		if eval.CrustRisk {
			conditions = append(conditions, metav1.Condition{
				Type:               "CrustRisk",
				Status:             metav1.ConditionTrue,
				LastTransitionTime: now,
				Reason:             "RainOrThawEvent",
				Message:            "Recent temperatures or rain above freezing likely formed rain or freeze-thaw crust",
			})
		}
		report.Status.Conditions = conditions

		return nil
	})

	if err != nil {
		return fmt.Errorf("failed to sync SnowForecastReport %s: %w", reportName, err)
	}

	logf.FromContext(ctx).Info("Synced child SnowForecastReport", "name", reportName, "operation", op)
	return nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *ResortTargetReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&weatherv1alpha1.ResortTarget{}).
		Owns(&weatherv1alpha1.SnowForecastReport{}).
		Named("resorttarget").
		Complete(r)
}

package controller

import (
	"context"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
)

// ConditionUpdater provides deterministic helpers for updating status conditions conforming to KEP-1623.
type ConditionUpdater struct {
	client client.Client
}

// NewConditionUpdater creates a new helper for managing conditions on PowderPredictor CRs.
func NewConditionUpdater(c client.Client) *ConditionUpdater {
	return &ConditionUpdater{client: c}
}

// SetResortTargetReady sets the Ready condition to True and marks Stale and ProviderDegraded as False.
func SetResortTargetReady(target *weatherv1alpha1.ResortTarget, reason, message string) {
	meta.SetStatusCondition(&target.Status.Conditions, metav1.Condition{
		Type:               weatherv1alpha1.ConditionTypeReady,
		Status:             metav1.ConditionTrue,
		ObservedGeneration: target.Generation,
		LastTransitionTime: metav1.Now(),
		Reason:             reason,
		Message:            message,
	})
	meta.SetStatusCondition(&target.Status.Conditions, metav1.Condition{
		Type:               weatherv1alpha1.ConditionTypeProviderDegraded,
		Status:             metav1.ConditionFalse,
		ObservedGeneration: target.Generation,
		LastTransitionTime: metav1.Now(),
		Reason:             weatherv1alpha1.ReasonSyncSuccess,
		Message:            "Upstream providers operational",
	})
	meta.SetStatusCondition(&target.Status.Conditions, metav1.Condition{
		Type:               weatherv1alpha1.ConditionTypeStale,
		Status:             metav1.ConditionFalse,
		ObservedGeneration: target.Generation,
		LastTransitionTime: metav1.Now(),
		Reason:             weatherv1alpha1.ReasonSyncSuccess,
		Message:            "Data within sync window",
	})
}

// SetResortTargetDegraded marks ProviderDegraded condition as True while preserving existing telemetry.
func SetResortTargetDegraded(target *weatherv1alpha1.ResortTarget, reason, message string) {
	meta.SetStatusCondition(&target.Status.Conditions, metav1.Condition{
		Type:               weatherv1alpha1.ConditionTypeProviderDegraded,
		Status:             metav1.ConditionTrue,
		ObservedGeneration: target.Generation,
		LastTransitionTime: metav1.Now(),
		Reason:             reason,
		Message:            message,
	})
	meta.SetStatusCondition(&target.Status.Conditions, metav1.Condition{
		Type:               weatherv1alpha1.ConditionTypeReady,
		Status:             metav1.ConditionFalse,
		ObservedGeneration: target.Generation,
		LastTransitionTime: metav1.Now(),
		Reason:             reason,
		Message:            message,
	})
}

// SetResortTargetStale marks the Stale condition as True if data freshness is violated.
func SetResortTargetStale(target *weatherv1alpha1.ResortTarget, reason, message string) {
	meta.SetStatusCondition(&target.Status.Conditions, metav1.Condition{
		Type:               weatherv1alpha1.ConditionTypeStale,
		Status:             metav1.ConditionTrue,
		ObservedGeneration: target.Generation,
		LastTransitionTime: metav1.Now(),
		Reason:             reason,
		Message:            message,
	})
}

// UpdateResortTargetStatus deterministically updates only the status subresource of ResortTarget.
// This ensures that the resource's .metadata.generation is never incremented during status updates.
func (u *ConditionUpdater) UpdateResortTargetStatus(ctx context.Context, target *weatherv1alpha1.ResortTarget) error {
	target.Status.ObservedGeneration = target.Generation
	return u.client.Status().Update(ctx, target)
}

// IsSyncStale checks if the duration since LastSyncTime exceeds the provided duration threshold.
func IsSyncStale(target *weatherv1alpha1.ResortTarget, threshold time.Duration) bool {
	if target.Status.LastSyncTime == nil {
		return true
	}
	return time.Since(target.Status.LastSyncTime.Time) > threshold
}

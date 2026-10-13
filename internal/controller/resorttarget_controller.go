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
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
)

// ResortTargetReconciler reconciles a ResortTarget object
type ResortTargetReconciler struct {
	client.Client
	Scheme *runtime.Scheme
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

	// Check if this is the initial reconciliation or if sync threshold has elapsed
	if len(target.Status.Conditions) == 0 || target.Status.LastSyncTime == nil {
		now := metav1.Now()
		target.Status.LastSyncTime = &now
		SetResortTargetReady(target, weatherv1alpha1.ReasonSyncSuccess, "Target initialized and ready for meteorological ingestion")
		if err := updater.UpdateResortTargetStatus(ctx, target); err != nil {
			log.Error(err, "Failed to update initial ResortTarget status")
			return ctrl.Result{}, err
		}
		log.Info("Initialized ResortTarget status conditions", "resort", target.Name)
		return ctrl.Result{RequeueAfter: syncDuration}, nil
	}

	// Check elapsed time against sync window
	elapsed := time.Since(target.Status.LastSyncTime.Time)
	if elapsed >= syncDuration {
		log.Info("Sync interval reached; queuing meteorological refresh", "resort", target.Name, "elapsed", elapsed)
		now := metav1.Now()
		target.Status.LastSyncTime = &now
		SetResortTargetReady(target, weatherv1alpha1.ReasonSyncSuccess, "Meteorological conditions up to date")
		if err := updater.UpdateResortTargetStatus(ctx, target); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{RequeueAfter: syncDuration}, nil
	}

	// Calculate remaining time until next sync
	remaining := syncDuration - elapsed
	return ctrl.Result{RequeueAfter: remaining}, nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *ResortTargetReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&weatherv1alpha1.ResortTarget{}).
		Named("resorttarget").
		Complete(r)
}

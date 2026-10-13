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

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
)

// ResortTargetReconciler reconciles a ResortTarget object
type ResortTargetReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=weather.powderpredictor.io,resources=resorttargets,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=weather.powderpredictor.io,resources=resorttargets/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=weather.powderpredictor.io,resources=resorttargets/finalizers,verbs=update
// +kubebuilder:rbac:groups=weather.powderpredictor.io,resources=snowforecastreports,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=weather.powderpredictor.io,resources=snowforecastreports/status,verbs=get;update;patch

// Reconcile reconciles a ResortTarget object, updating condition states deterministically.
func (r *ResortTargetReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	target := &weatherv1alpha1.ResortTarget{}
	if err := r.Get(ctx, req.NamespacedName, target); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	updater := NewConditionUpdater(r.Client)

	// If conditions are not yet initialized or LastSyncTime is missing, initialize baseline state
	if len(target.Status.Conditions) == 0 {
		now := metav1.Now()
		target.Status.LastSyncTime = &now
		SetResortTargetReady(target, weatherv1alpha1.ReasonSyncSuccess, "Target initialized and ready for meteorological ingestion")
		if err := updater.UpdateResortTargetStatus(ctx, target); err != nil {
			log.Error(err, "Failed to update initial ResortTarget status")
			return ctrl.Result{}, err
		}
		log.Info("Initialized ResortTarget status conditions", "resort", target.Name)
	}

	return ctrl.Result{}, nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *ResortTargetReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&weatherv1alpha1.ResortTarget{}).
		Named("resorttarget").
		Complete(r)
}

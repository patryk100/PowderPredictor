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

package v1alpha1

import (
	"context"
	"fmt"
	"strings"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/validation/field"
	ctrl "sigs.k8s.io/controller-runtime"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/webhook"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
)

// nolint:unused
// log is for logging in this package.
var resorttargetlog = logf.Log.WithName("resorttarget-resource")

// SetupResortTargetWebhookWithManager registers the webhook for ResortTarget in the manager.
func SetupResortTargetWebhookWithManager(mgr ctrl.Manager) error {
	return ctrl.NewWebhookManagedBy(mgr).For(&weatherv1alpha1.ResortTarget{}).
		WithValidator(&ResortTargetCustomValidator{}).
		WithDefaulter(&ResortTargetCustomDefaulter{}).
		Complete()
}

// TODO(user): EDIT THIS FILE!  THIS IS SCAFFOLDING FOR YOU TO OWN!

// +kubebuilder:webhook:path=/mutate-weather-powderpredictor-io-v1alpha1-resorttarget,mutating=true,failurePolicy=fail,sideEffects=None,groups=weather.powderpredictor.io,resources=resorttargets,verbs=create;update,versions=v1alpha1,name=mresorttarget-v1alpha1.kb.io,admissionReviewVersions=v1

// ResortTargetCustomDefaulter struct is responsible for setting default values on the custom resource of the
// Kind ResortTarget when those are created or updated.
//
// NOTE: The +kubebuilder:object:generate=false marker prevents controller-gen from generating DeepCopy methods,
// as it is used only for temporary operations and does not need to be deeply copied.
type ResortTargetCustomDefaulter struct {
	// TODO(user): Add more fields as needed for defaulting
}

var _ webhook.CustomDefaulter = &ResortTargetCustomDefaulter{}

// Default implements webhook.CustomDefaulter so a webhook will be registered for the Kind ResortTarget.
func (d *ResortTargetCustomDefaulter) Default(_ context.Context, obj runtime.Object) error {
	resorttarget, ok := obj.(*weatherv1alpha1.ResortTarget)
	if !ok {
		return fmt.Errorf("expected a ResortTarget object but got %T", obj)
	}
	resorttargetlog.Info("Defaulting for ResortTarget", "name", resorttarget.GetName())

	// Default SyncInterval to 1h if omitted
	if resorttarget.Spec.SyncInterval == "" {
		resorttarget.Spec.SyncInterval = "1h"
	}

	// Default PrimaryAspects to North and East (dominant Northeast mountain aspects) if not provided
	if len(resorttarget.Spec.PrimaryAspects) == 0 {
		resorttarget.Spec.PrimaryAspects = []weatherv1alpha1.Aspect{
			weatherv1alpha1.AspectNorth,
			weatherv1alpha1.AspectEast,
		}
	}

	return nil
}

// +kubebuilder:webhook:path=/validate-weather-powderpredictor-io-v1alpha1-resorttarget,mutating=false,failurePolicy=fail,sideEffects=None,groups=weather.powderpredictor.io,resources=resorttargets,verbs=create;update,versions=v1alpha1,name=vresorttarget-v1alpha1.kb.io,admissionReviewVersions=v1

// ResortTargetCustomValidator struct is responsible for validating the ResortTarget resource
// when it is created, updated, or deleted.
type ResortTargetCustomValidator struct {
}

var _ webhook.CustomValidator = &ResortTargetCustomValidator{}

// ValidateCreate implements webhook.CustomValidator so a webhook will be registered for the type ResortTarget.
func (v *ResortTargetCustomValidator) ValidateCreate(_ context.Context, obj runtime.Object) (admission.Warnings, error) {
	resorttarget, ok := obj.(*weatherv1alpha1.ResortTarget)
	if !ok {
		return nil, fmt.Errorf("expected a ResortTarget object but got %T", obj)
	}
	resorttargetlog.Info("Validation for ResortTarget upon creation", "name", resorttarget.GetName())

	return nil, v.validateResortTarget(resorttarget)
}

// ValidateUpdate implements webhook.CustomValidator so a webhook will be registered for the type ResortTarget.
func (v *ResortTargetCustomValidator) ValidateUpdate(_ context.Context, oldObj, newObj runtime.Object) (admission.Warnings, error) {
	resorttarget, ok := newObj.(*weatherv1alpha1.ResortTarget)
	if !ok {
		return nil, fmt.Errorf("expected a ResortTarget object for the newObj but got %T", newObj)
	}
	resorttargetlog.Info("Validation for ResortTarget upon update", "name", resorttarget.GetName())

	return nil, v.validateResortTarget(resorttarget)
}

// ValidateDelete implements webhook.CustomValidator so a webhook will be registered for the type ResortTarget.
func (v *ResortTargetCustomValidator) ValidateDelete(_ context.Context, obj runtime.Object) (admission.Warnings, error) {
	return nil, nil
}

// validateResortTarget performs geographic bounding box, elevation sanity, and sync interval validation.
func (v *ResortTargetCustomValidator) validateResortTarget(target *weatherv1alpha1.ResortTarget) error {
	var allErrs field.ErrorList
	specPath := field.NewPath("spec")

	// 1. Validate coordinate boundaries to Northeast geographic bounding box
	// Latitude: 40.0 to 48.0, Longitude: -75.0 to -67.0
	const (
		minLat = 40.0
		maxLat = 48.0
		minLon = -75.0
		maxLon = -67.0
	)

	if target.Spec.Latitude < minLat || target.Spec.Latitude > maxLat {
		allErrs = append(allErrs, field.Invalid(
			specPath.Child("latitude"),
			target.Spec.Latitude,
			fmt.Sprintf("latitude must fall within Northeast bounding box [%.1f, %.1f]", minLat, maxLat),
		))
	}

	if target.Spec.Longitude < minLon || target.Spec.Longitude > maxLon {
		allErrs = append(allErrs, field.Invalid(
			specPath.Child("longitude"),
			target.Spec.Longitude,
			fmt.Sprintf("longitude must fall within Northeast bounding box [%.1f, %.1f]", minLon, maxLon),
		))
	}

	// 2. Enforce elevation sanity: SummitElevationFt must strictly exceed BaseElevationFt by at least 300 ft
	const minVerticalDropFt = 300
	if target.Spec.SummitElevationFt <= target.Spec.BaseElevationFt {
		allErrs = append(allErrs, field.Invalid(
			specPath.Child("summitElevationFt"),
			target.Spec.SummitElevationFt,
			fmt.Sprintf("summit elevation must strictly exceed base elevation (%d ft)", target.Spec.BaseElevationFt),
		))
	} else if (target.Spec.SummitElevationFt - target.Spec.BaseElevationFt) < minVerticalDropFt {
		allErrs = append(allErrs, field.Invalid(
			specPath.Child("summitElevationFt"),
			target.Spec.SummitElevationFt,
			fmt.Sprintf("vertical drop (summit - base) must be at least %d ft (current: %d ft)", minVerticalDropFt, target.Spec.SummitElevationFt-target.Spec.BaseElevationFt),
		))
	}

	// 3. Validate SyncInterval parses as a valid duration or cron expression
	if target.Spec.SyncInterval != "" {
		if _, err := time.ParseDuration(target.Spec.SyncInterval); err != nil {
			// If not duration, check standard 5-part cron syntax
			fields := strings.Fields(target.Spec.SyncInterval)
			if len(fields) != 5 {
				allErrs = append(allErrs, field.Invalid(
					specPath.Child("syncInterval"),
					target.Spec.SyncInterval,
					"syncInterval must be a valid Go duration string (e.g., '30m', '1h') or 5-part cron expression (e.g., '0 * * * *')",
				))
			}
		}
	}

	if len(allErrs) == 0 {
		return nil
	}
	return apierrors.NewInvalid(
		schema.GroupKind{Group: "weather.powderpredictor.io", Kind: "ResortTarget"},
		target.Name,
		allErrs,
	)
}

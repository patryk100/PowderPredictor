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
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// EDIT THIS FILE!  THIS IS SCAFFOLDING FOR YOU TO OWN!
// NOTE: json tags are required.  Any new fields you add must have json tags for the fields to be serialized.

// SnowForecastReportSpec defines the desired state of SnowForecastReport
type SnowForecastReportSpec struct {
	// ResortRef references the target ResortTarget mountain resource
	// +required
	ResortRef corev1.LocalObjectReference `json:"resortRef"`

	// WindowStart marks the beginning of the forecasted snowfall window
	// +required
	WindowStart metav1.Time `json:"windowStart"`

	// WindowEnd marks the conclusion of the forecasted snowfall window
	// +required
	WindowEnd metav1.Time `json:"windowEnd"`

	// PredictedSnowfallInches is the modeled accumulation in inches over the window
	// +kubebuilder:validation:Minimum=0
	// +required
	PredictedSnowfallInches float64 `json:"predictedSnowfallInches"`

	// SnowToLiquidRatio is the modeled ratio of snow depth to liquid water equivalent (e.g. 15.0 for 15:1)
	// +kubebuilder:validation:Minimum=1
	// +optional
	SnowToLiquidRatio float64 `json:"snowToLiquidRatio,omitempty"`

	// FreezingLevelElevationFt is the forecasted atmospheric freezing level (0°C isotherm) in feet
	// +optional
	FreezingLevelElevationFt int `json:"freezingLevelElevationFt,omitempty"`

	// PowderScore is a quantitative index (0-100) scoring powder quality based on DGZ, SLR, wind scour, and accumulation
	// +kubebuilder:validation:Minimum=0
	// +kubebuilder:validation:Maximum=100
	// +required
	PowderScore int `json:"powderScore"`

	// ConfidenceInterval is the model prediction confidence percentage (0.0 - 100.0)
	// +kubebuilder:validation:Minimum=0
	// +kubebuilder:validation:Maximum=100
	// +optional
	ConfidenceInterval float64 `json:"confidenceInterval,omitempty"`
}

// SnowForecastReportStatus defines the observed state of SnowForecastReport.
type SnowForecastReportStatus struct {
	// ComputedAt is the timestamp when the forecast model computation executed
	// +optional
	ComputedAt *metav1.Time `json:"computedAt,omitempty"`

	// Conditions represent observations of the forecast report state
	// +listType=map
	// +listMapKey=type
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Resort",type="string",JSONPath=".spec.resortRef.name",description="Target mountain resort"
// +kubebuilder:printcolumn:name="PowderScore",type="integer",JSONPath=".spec.powderScore",description="Predicted powder score (0-100)"
// +kubebuilder:printcolumn:name="SnowfallInches",type="number",JSONPath=".spec.predictedSnowfallInches",description="Modeled snow accumulation in inches"
// +kubebuilder:printcolumn:name="WindowStart",type="string",JSONPath=".spec.windowStart",description="Forecast window start"
// +kubebuilder:printcolumn:name="Age",type="date",JSONPath=".metadata.creationTimestamp"

// SnowForecastReport is the Schema for the snowforecastreports API
type SnowForecastReport struct {
	metav1.TypeMeta `json:",inline"`

	// metadata is a standard object metadata
	// +optional
	metav1.ObjectMeta `json:"metadata,omitempty,omitzero"`

	// spec defines the desired state of SnowForecastReport
	// +required
	Spec SnowForecastReportSpec `json:"spec"`

	// status defines the observed state of SnowForecastReport
	// +optional
	Status SnowForecastReportStatus `json:"status,omitempty,omitzero"`
}

// +kubebuilder:object:root=true

// SnowForecastReportList contains a list of SnowForecastReport
type SnowForecastReportList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []SnowForecastReport `json:"items"`
}

func init() {
	SchemeBuilder.Register(&SnowForecastReport{}, &SnowForecastReportList{})
}

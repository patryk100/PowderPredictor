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
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// EDIT THIS FILE!  THIS IS SCAFFOLDING FOR YOU TO OWN!
// NOTE: json tags are required.  Any new fields you add must have json tags for the fields to be serialized.

// Aspect represents a compass direction for a mountain slope
// +kubebuilder:validation:Enum=North;NorthEast;East;SouthEast;South;SouthWest;West;NorthWest
type Aspect string

const (
	AspectNorth     Aspect = "North"
	AspectNorthEast Aspect = "NorthEast"
	AspectEast      Aspect = "East"
	AspectSouthEast Aspect = "SouthEast"
	AspectSouth     Aspect = "South"
	AspectSouthWest Aspect = "SouthWest"
	AspectWest      Aspect = "West"
	AspectNorthWest Aspect = "NorthWest"
)

// ResortTargetSpec defines the desired state of ResortTarget
type ResortTargetSpec struct {
	// Latitude of the mountain target in decimal degrees (e.g. 43.6263)
	// +kubebuilder:validation:Minimum=-90
	// +kubebuilder:validation:Maximum=90
	// +required
	Latitude float64 `json:"latitude"`

	// Longitude of the mountain target in decimal degrees (e.g. -72.7969)
	// +kubebuilder:validation:Minimum=-180
	// +kubebuilder:validation:Maximum=180
	// +required
	Longitude float64 `json:"longitude"`

	// SummitElevationFt is the elevation of the mountain summit in feet
	// +kubebuilder:validation:Minimum=0
	// +required
	SummitElevationFt int `json:"summitElevationFt"`

	// BaseElevationFt is the elevation of the mountain base in feet
	// +kubebuilder:validation:Minimum=0
	// +required
	BaseElevationFt int `json:"baseElevationFt"`

	// Region is the geographic area / state (e.g. VT, NH, ME, NY)
	// +optional
	Region string `json:"region,omitempty"`

	// PrimaryAspects defines the primary compass directions that the ski slopes face
	// +optional
	PrimaryAspects []Aspect `json:"primaryAspects,omitempty"`

	// SkiableAcres defines the skiable acreage of the resort
	// +kubebuilder:validation:Minimum=0
	// +optional
	SkiableAcres int `json:"skiableAcres,omitempty"`

	// SyncInterval defines the meteorological ingestion schedule (e.g. "30m", "1h")
	// +kubebuilder:default="1h"
	// +optional
	SyncInterval string `json:"syncInterval,omitempty"`
}

// ResortTargetStatus defines the observed state of ResortTarget.
type ResortTargetStatus struct {
	// LastSyncTime is the timestamp of the last successful atmospheric ingestion
	// +optional
	LastSyncTime *metav1.Time `json:"lastSyncTime,omitempty"`

	// ObservedGeneration represents the .metadata.generation that was reconciled
	// +optional
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`

	// Conditions represent the current service conditions of the target reconciliation
	// +listType=map
	// +listMapKey=type
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Summit",type="integer",JSONPath=".spec.summitElevationFt",description="Summit elevation in feet"
// +kubebuilder:printcolumn:name="Base",type="integer",JSONPath=".spec.baseElevationFt",description="Base elevation in feet"
// +kubebuilder:printcolumn:name="Region",type="string",JSONPath=".spec.region",description="Geographic region"
// +kubebuilder:printcolumn:name="Sync",type="string",JSONPath=".spec.syncInterval",description="Sync schedule interval"
// +kubebuilder:printcolumn:name="Age",type="date",JSONPath=".metadata.creationTimestamp"

// ResortTarget is the Schema for the resorttargets API
type ResortTarget struct {
	metav1.TypeMeta `json:",inline"`

	// metadata is a standard object metadata
	// +optional
	metav1.ObjectMeta `json:"metadata,omitempty,omitzero"`

	// spec defines the desired state of ResortTarget
	// +required
	Spec ResortTargetSpec `json:"spec"`

	// status defines the observed state of ResortTarget
	// +optional
	Status ResortTargetStatus `json:"status,omitempty,omitzero"`
}

// +kubebuilder:object:root=true

// ResortTargetList contains a list of ResortTarget
type ResortTargetList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []ResortTarget `json:"items"`
}

func init() {
	SchemeBuilder.Register(&ResortTarget{}, &ResortTargetList{})
}

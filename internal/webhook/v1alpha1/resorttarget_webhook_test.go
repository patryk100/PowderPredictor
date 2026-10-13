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
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
	// TODO (user): Add any additional imports if needed
)

var _ = Describe("ResortTarget Webhook", func() {
	var (
		obj       *weatherv1alpha1.ResortTarget
		oldObj    *weatherv1alpha1.ResortTarget
		validator ResortTargetCustomValidator
		defaulter ResortTargetCustomDefaulter
	)

	BeforeEach(func() {
		obj = &weatherv1alpha1.ResortTarget{}
		oldObj = &weatherv1alpha1.ResortTarget{}
		validator = ResortTargetCustomValidator{}
		Expect(validator).NotTo(BeNil(), "Expected validator to be initialized")
		defaulter = ResortTargetCustomDefaulter{}
		Expect(defaulter).NotTo(BeNil(), "Expected defaulter to be initialized")
		Expect(oldObj).NotTo(BeNil(), "Expected oldObj to be initialized")
		Expect(obj).NotTo(BeNil(), "Expected obj to be initialized")
		// TODO (user): Add any setup logic common to all tests
	})

	AfterEach(func() {
		// TODO (user): Add any teardown logic common to all tests
	})

	Context("When creating ResortTarget under Defaulting Webhook", func() {
		It("Should apply default SyncInterval and primary aspects when omitted", func() {
			obj.Spec.SyncInterval = ""
			obj.Spec.PrimaryAspects = nil

			Expect(defaulter.Default(ctx, obj)).To(Succeed())
			Expect(obj.Spec.SyncInterval).To(Equal("1h"))
			Expect(obj.Spec.PrimaryAspects).To(ContainElements(weatherv1alpha1.AspectNorth, weatherv1alpha1.AspectEast))
		})

		It("Should preserve user-provided SyncInterval and PrimaryAspects", func() {
			obj.Spec.SyncInterval = "15m"
			obj.Spec.PrimaryAspects = []weatherv1alpha1.Aspect{weatherv1alpha1.AspectWest}

			Expect(defaulter.Default(ctx, obj)).To(Succeed())
			Expect(obj.Spec.SyncInterval).To(Equal("15m"))
			Expect(obj.Spec.PrimaryAspects).To(Equal([]weatherv1alpha1.Aspect{weatherv1alpha1.AspectWest}))
		})
	})

	Context("When validating ResortTarget under Validating Webhook", func() {
		BeforeEach(func() {
			obj.Name = "test-mountain"
			obj.Spec = weatherv1alpha1.ResortTargetSpec{
				Latitude:          44.5,
				Longitude:         -72.8,
				SummitElevationFt: 4000,
				BaseElevationFt:   1500,
				SyncInterval:      "1h",
			}
		})

		It("Should admit creation when within Northeast bounding box and elevation is sane", func() {
			warnings, err := validator.ValidateCreate(ctx, obj)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})

		It("Should reject coordinates outside the Northeast bounding box", func() {
			obj.Spec.Latitude = 32.5 // Too far South (e.g., Texas/Georgia)
			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("Northeast bounding box"))

			obj.Spec.Latitude = 44.5
			obj.Spec.Longitude = -105.0 // Colorado/Rockies
			_, err = validator.ValidateCreate(ctx, obj)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("Northeast bounding box"))
		})

		It("Should reject when SummitElevationFt <= BaseElevationFt", func() {
			obj.Spec.SummitElevationFt = 1500
			obj.Spec.BaseElevationFt = 1500
			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("summit elevation must strictly exceed base elevation"))
		})

		It("Should reject when vertical drop is less than 300 ft", func() {
			obj.Spec.SummitElevationFt = 1600
			obj.Spec.BaseElevationFt = 1500
			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("vertical drop (summit - base) must be at least 300 ft"))
		})

		It("Should reject invalid SyncInterval syntax", func() {
			obj.Spec.SyncInterval = "invalid-schedule"
			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("syncInterval must be a valid Go duration string"))
		})

		It("Should accept valid 5-part cron syntax for SyncInterval", func() {
			obj.Spec.SyncInterval = "0 * * * *"
			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).NotTo(HaveOccurred())
		})
	})

})

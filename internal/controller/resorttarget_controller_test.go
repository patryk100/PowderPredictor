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

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/record"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
	"github.com/powderpredictor/operator/pkg/ingestion"
	"github.com/powderpredictor/operator/pkg/testutil"
	"github.com/powderpredictor/operator/pkg/weather/nws"
	"github.com/powderpredictor/operator/pkg/weather/openmeteo"
)

var _ = Describe("ResortTarget Controller", func() {
	Context("When reconciling a resource", func() {
		const resourceName = "test-resource"

		ctx := context.Background()

		typeNamespacedName := types.NamespacedName{
			Name:      resourceName,
			Namespace: "default", // TODO(user):Modify as needed
		}
		resorttarget := &weatherv1alpha1.ResortTarget{}

		BeforeEach(func() {
			By("creating the custom resource for the Kind ResortTarget")
			err := k8sClient.Get(ctx, typeNamespacedName, resorttarget)
			if err != nil && errors.IsNotFound(err) {
				resource := &weatherv1alpha1.ResortTarget{
					ObjectMeta: metav1.ObjectMeta{
						Name:      resourceName,
						Namespace: "default",
					},
					Spec: weatherv1alpha1.ResortTargetSpec{
						Latitude:          44.5303,
						Longitude:         -72.7814,
						SummitElevationFt: 4395,
						BaseElevationFt:   1280,
						Region:            "VT",
						SyncInterval:      "30m",
					},
				}
				Expect(k8sClient.Create(ctx, resource)).To(Succeed())
			}
		})

		AfterEach(func() {
			resource := &weatherv1alpha1.ResortTarget{}
			err := k8sClient.Get(ctx, typeNamespacedName, resource)
			if err == nil {
				By("Cleanup the specific resource instance ResortTarget")
				Expect(k8sClient.Delete(ctx, resource)).To(Succeed())
			}
		})

		It("should successfully reconcile the resource and set status conditions without mutating generation", func() {
			mockServer := testutil.NewMockWeatherServer(testutil.ScenarioNoreaster)
			defer mockServer.Close()
			noaaClient := nws.NewClient(nws.WithBaseURL(mockServer.URL()))
			openMeteoClient := openmeteo.NewClient(openmeteo.WithBaseURL(mockServer.URL() + "/v1/forecast"))
			pipeline := ingestion.NewIngestionPipeline(noaaClient, openMeteoClient, 2)
			fakeRecorder := record.NewFakeRecorder(10)

			controllerReconciler := &ResortTargetReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Recorder: fakeRecorder,
				Pipeline: pipeline,
			}

			// Capture generation prior to status reconcile
			preTarget := &weatherv1alpha1.ResortTarget{}
			Expect(k8sClient.Get(ctx, typeNamespacedName, preTarget)).To(Succeed())
			initialGeneration := preTarget.Generation

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: typeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify status condition is populated
			reconciledTarget := &weatherv1alpha1.ResortTarget{}
			Expect(k8sClient.Get(ctx, typeNamespacedName, reconciledTarget)).To(Succeed())
			Expect(reconciledTarget.Status.Conditions).NotTo(BeEmpty())

			readyCondition := reconciledTarget.Status.Conditions[0]
			Expect(readyCondition.Type).To(Equal(weatherv1alpha1.ConditionTypeReady))
			Expect(readyCondition.Status).To(Equal(metav1.ConditionTrue))

			// Verify generation was NOT incremented by status update
			Expect(reconciledTarget.Generation).To(Equal(initialGeneration))
			Expect(reconciledTarget.Status.ObservedGeneration).To(Equal(initialGeneration))

			// Verify child SnowForecastReport CR was created and populated
			report := &weatherv1alpha1.SnowForecastReport{}
			reportName := types.NamespacedName{
				Name:      resourceName + "-forecast",
				Namespace: "default",
			}
			Expect(k8sClient.Get(ctx, reportName, report)).To(Succeed())
			Expect(report.Spec.ResortRef.Name).To(Equal(resourceName))
			Expect(report.Spec.PowderScore).To(BeNumerically(">=", 0))
			Expect(report.Spec.PredictedSnowfallInches).To(BeNumerically(">=", 0))
			Expect(report.OwnerReferences).NotTo(BeEmpty())
			Expect(report.OwnerReferences[0].Name).To(Equal(resourceName))
		})
	})
})

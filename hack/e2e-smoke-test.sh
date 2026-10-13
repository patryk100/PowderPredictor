#!/usr/bin/env bash
set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
NAMESPACE="powder-system"

echo "=== [1/5] Checking Kubernetes Cluster & CRD Readiness ==="
kubectl get crds | grep "powderpredictor.io"

echo "=== [2/5] Ensuring Gateway and Operator Deployments are Available ==="
kubectl wait --for=condition=Available deployment/powder-api-gateway -n "${NAMESPACE}" --timeout=60s
kubectl wait --for=condition=Available deployment/powder-controller-manager -n "${NAMESPACE}" --timeout=60s

echo "=== [3/5] Applying Test Target: mount-mansfield-stowe ==="
kubectl apply -f hack/manifests/mount-mansfield-stowe.yaml -n "${NAMESPACE}"

echo "=== [4/5] Polling Gateway Forecasts for Modeled Report ==="
MAX_RETRIES=20
RETRY_COUNT=0
FOUND=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  RESPONSE=$(curl -s "${GATEWAY_URL}/api/v1/forecasts" || echo "")
  if echo "$RESPONSE" | grep -q "mount-mansfield-stowe"; then
    echo "✓ Target 'mount-mansfield-stowe' found in API Gateway payload!"
    FOUND=1
    break
  fi
  echo "Waiting for reconciler to publish forecast... (attempt $((RETRY_COUNT+1))/${MAX_RETRIES})"
  sleep 3
  RETRY_COUNT=$((RETRY_COUNT+1))
done

if [ $FOUND -ne 1 ]; then
  echo "Error: Timed out waiting for target in gateway response!"
  exit 1
fi

echo "=== [5/5] Asserting Forecast Report Specifications ==="
kubectl get snowforecastreport mount-mansfield-stowe-forecast -n "${NAMESPACE}" -o yaml | grep -E "powderScore|predictedSnowfallInches|snowToLiquidRatio"

echo "=== E2E Smoke Test Passed Successfully! ==="

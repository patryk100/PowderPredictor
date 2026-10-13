#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="powder-local"

echo "=== Tearing down Kind cluster: ${CLUSTER_NAME} ==="
if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
  kind delete cluster --name "${CLUSTER_NAME}"
  echo "✓ Kind cluster '${CLUSTER_NAME}' deleted successfully."
else
  echo "Cluster '${CLUSTER_NAME}' not found. Nothing to delete."
fi

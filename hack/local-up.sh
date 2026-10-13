#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="powder-local"
KIND_CONFIG="kind-config.yaml"

echo "=== [1/6] Validating developer tool dependencies ==="
MISSING_TOOLS=()
for tool in kind kubectl kustomize helm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    MISSING_TOOLS+=("$tool")
  fi
done

if [ ${#MISSING_TOOLS[@]} -ne 0 ]; then
  echo "Error: Missing required local tools: ${MISSING_TOOLS[*]}"
  echo "Please install them via brew or your system package manager."
  exit 1
fi
echo "✓ All host dependencies (kind, kubectl, kustomize, helm) present."

echo "=== [2/6] Provisioning Kind cluster: ${CLUSTER_NAME} ==="
if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
  echo "Cluster '${CLUSTER_NAME}' already exists. Reusing existing cluster."
else
  kind create cluster --name "${CLUSTER_NAME}" --config "${KIND_CONFIG}"
fi

kubectl cluster-info --context "kind-${CLUSTER_NAME}"

echo "=== [3/6] Bootstrapping cert-manager ==="
helm repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
helm repo update jetstack >/dev/null 2>&1 || true

if ! helm status cert-manager -n cert-manager >/dev/null 2>&1; then
  echo "Installing cert-manager..."
  helm upgrade --install cert-manager jetstack/cert-manager \
    --namespace cert-manager \
    --create-namespace \
    --set crds.enabled=true \
    --wait --timeout=90s
else
  echo "✓ cert-manager is already installed."
fi

echo "=== [4/6] Bootstrapping ingress-nginx for Kind ==="
if ! kubectl get namespace ingress-nginx >/dev/null 2>&1; then
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
  echo "Waiting for ingress controller deployment..."
  kubectl wait --namespace ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=120s || true
else
  echo "✓ ingress-nginx namespace already present."
fi

echo "=== [5/6] Creating namespace & applying CRDs ==="
kubectl create namespace powder-system --dry-run=client -o yaml | kubectl apply -f -

# Secret injection
kubectl create secret generic weather-api-tokens \
  --namespace powder-system \
  --from-literal=NOAA_API_KEY=dev-noaa-key \
  --from-literal=OPEN_METEO_KEY=dev-open-meteo-key \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Applying CustomResourceDefinitions..."
kustomize build config/crd | kubectl apply -f -

echo "=== [6/6] Seeding initial Northeast target resources ==="
kubectl apply -f hack/manifests/seed-resorts.yaml -n powder-system

echo "=== Cluster setup complete! ==="
kubectl get crds | grep "powderpredictor.io"
kubectl get resorttargets -n powder-system

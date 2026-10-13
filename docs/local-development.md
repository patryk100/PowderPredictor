# PowderPredictor Local Developer Experience & Testing

PowderPredictor is configured with a fully automated, one-command local developer environment utilizing Kind, Tilt, Kustomize, and mock weather fixtures.

---

## 1. Prerequisites

Ensure the following tools are installed on your host system:
* **Docker** or **Colima** (Container runtime)
* **Go** (`v1.24+`)
* **Node.js** (`v20+`) & **npm**
* **kubectl** (`v1.28+`)
* **kind** (`v0.20+`)
* **tilt** (`v0.33+`)
* **helm** (`v3.12+`)

---

## 2. One-Click Cluster Bootstrapping

To provision a local Kind cluster preconfigured with Ingress, cert-manager, namespaces, CRDs, and initial target mountain seeds:

```bash
make cluster-up
```

### What `make cluster-up` automates:
1. Validates that host CLI binaries (`kind`, `kubectl`, `helm`, `tilt`) are installed.
2. Spawns a multi-node Kind cluster using `hack/kind-config.yaml` with port forwards (`80 -> 8080`, `443 -> 8443`).
3. Installs `cert-manager` via Helm for webhook TLS certificates.
4. Installs `ingress-nginx` with Kind-specific patches.
5. Applies CRDs (`kustomize build config/crd | kubectl apply -f -`).
6. Creates the `powder-system` namespace and registers dummy weather API secrets.
7. Deploys seed resort targets (`hack/manifests/seed-resorts.yaml`) including Jay Peak, Stowe, Killington, and Wildcat.

To cleanly destroy the cluster and release ports:
```bash
make cluster-down
```

---

## 3. Live-Reload Inner Loop with Tilt

Tilt orchestrates multi-service container builds, log aggregation, and real-time live synchronization without rebuilding Docker images.

Start the Tilt session:
```bash
tilt up
```

Press `Space` to open the web dashboard (`http://localhost:10350`).

### Managed Resources in `Tiltfile`:
* **Operator Service (`powder-controller-manager`)**: Watches Go files in `controllers/`, `pkg/`, and `api/`. Binary is live-synced into the running pod in under 5 seconds.
* **API Gateway (`powder-api-gateway`)**: Watches `cmd/api-gateway/` and `pkg/gateway/`, serving REST and SSE updates.
* **Next.js Frontend (`powder-frontend`)**: Runs Next.js with React Fast Refresh on `http://localhost:3000`.

### Custom Tilt UI Action Buttons:
* **`Trigger Reconcile Now`**: Patches annotations on active `ResortTarget` resources to force an immediate reconciliation.
* **`Reset Fixtures`**: Wipes and re-applies pristine seed manifests.

---

## 4. Running the Frontend Standalone

If you are developing frontend features exclusively:

```bash
cd web
npm install
npm run dev
```

The UI is available at `http://localhost:3000`. If the backend gateway is offline, the frontend seamlessly operates in disconnected mode using the comprehensive 26-mountain catalog fallback.

To connect the local frontend to the in-cluster API gateway:
```bash
kubectl port-forward svc/powder-api-gateway -n powder-system 8080:8080
```

---

## 5. Testing & Verification Suites

### 5.1 Unit Tests (Go)
```bash
make test
```
Executes controller unit tests using `envtest` against a real local Kubernetes control plane (4/4 test suites passing).

### 5.2 TypeScript & Lint Checking
```bash
cd web
npx tsc --noEmit
npm run lint
```

### 5.3 Automated End-to-End Smoke Test
Verify the full end-to-end integration path from CRD application to NOAA data downscaling and API gateway response:

```bash
./hack/e2e-smoke-test.sh
```

The script:
1. Deploys the offline mock weather server.
2. Applies a test `ResortTarget` CR (`mount-mansfield-stowe`).
3. Verifies controller reconciliation into a `SnowForecastReport` CR within 60 seconds.
4. Queries the API gateway endpoint (`/api/v1/forecasts`) to assert matching Powder Scores and Snowfall totals.

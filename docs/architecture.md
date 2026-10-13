# PowderPredictor Architecture & System Design

PowderPredictor is a cloud-native, Kubernetes-native meteorological downscaling and trip planning engine for Northeast ski mountains. It continuously reconciles regional numerical weather prediction (NWP) model outputs against mountain topographical profiles, generating real-time elevation-adjusted snow quality forecasts.

---

## 1. High-Level Architecture

PowderPredictor is designed following the **Kubernetes Operator Pattern**, separating raw numerical weather ingestion, physical atmospheric modeling, gateway caching, and client presentation into distinct decoupled layers.

```mermaid
flowchart TD
    subgraph Data Sources [Upstream NWP & Observations]
        NOAA[NOAA HRRR / GFS / NWS API]
        SNOTEL[USDA SNOTEL / NRCS Telemetry]
        MockSvc[Offline Synthetic Weather Server]
    end

    subgraph Kubernetes Cluster [powder-system Namespace]
        RT[ResortTarget CRD] -->|Watches| Ctrl[powder-controller-manager]
        Data Sources -->|Polled by Ingestion Worker| Ctrl

        subgraph Operator Engine
            Ctrl --> Ingest[Ingestion Engine & Circuit Breaker]
            Ingest --> Model[Atmospheric Physics Pipeline]
            Model --> MALR[Moist Adiabatic Lapse Rate]
            Model --> DGZ[Dendritic Growth Zone -12°C to -18°C]
            Model --> Aspect[Aspect Wind Loading & Scour]
            Model --> PowderScore[Powder Score Algorithmic Engine]
        end

        PowderScore -->|Publishes / Updates| SFR[SnowForecastReport CRD]

        subgraph Edge & API Layer
            SFR -->|Informer Shared Index Cache| GW[powder-api-gateway]
            GW --> Broker[In-Memory SSE Broker]
            GW --> REST[REST API /api/v1/forecasts]
        end
    end

    subgraph Presentation Layer [Next.js 16 Web Application]
        GW -->|Server-Sent Events| WebClient[Browser / MapLibre GL UI]
        REST -->|JSON Forecast Telemetry| WebClient
    end
```

---

## 2. Core Components

### 2.1 Kubernetes Custom Resource Definitions (CRDs)
PowderPredictor introduces two declarative custom resources in the `weather.powderpredictor.io` API group:

1. **`ResortTarget` (`v1alpha1`)**:
   - Represents a monitored ski mountain and its topographical parameters.
   - Declaratively configures summit, mid-mountain, and base elevations, geographic coordinates, pass alliance affiliations (Ikon, Epic, Indy, Independent), and poll intervals.
   - Spec fields include `elevation`, `coordinates`, `pollingIntervalSeconds`, and custom aspect configurations.

2. **`SnowForecastReport` (`v1alpha1`)**:
   - Output resource generated and managed exclusively by the controller.
   - Stores 24h/48h/72h modeled snowfall accumulations, Snow-to-Liquid Ratio (SLR), Freezing Level (ft MSL), Powder Score (0–100), wind hold risk indices, crust risk flags, and confidence intervals.
   - Includes standard Kubernetes conditions (`Ready`, `Reconciling`, `Degraded`).

### 2.2 Controller Manager (`powder-controller-manager`)
The operator controller is built with Go and `controller-runtime`:
* **Reconcile Loop**: Watches `ResortTarget` instances. At each scheduled interval, fetches meteorological grids from NOAA (with fallback caching and circuit breakers).
* **Atmospheric Modeling Engine (`pkg/model`)**:
  - Interpolates pressure and temperature profiles across vertical elevation bands.
  - Applies Moist Adiabatic Lapse Rate (MALR) adjustments.
  - Computes microclimate dendritic crystallization when temperatures cross the $-12^\circ\text{C}$ to $-18^\circ\text{C}$ DGZ window.
  - Calculates ridgeline wind redirection, lee-side deposition, and wind hold risk indices based on summit gusts and orientation.
* **Status Updates**: Writes the resulting predictions into the corresponding `SnowForecastReport` resource.

### 2.3 API Gateway (`cmd/api-gateway`)
A high-throughput Gin-based gateway running in `powder-system`:
* **Informer Caching**: Uses a `cache.SharedIndexInformer` watching `SnowForecastReport` CRs directly from the Kubernetes API server, eliminating database bottlenecks.
* **Server-Sent Events (SSE)**: Streams real-time forecast updates to connected browser clients over `GET /api/v1/forecasts/stream`.
* **REST Endpoints**: Exposes `/api/v1/forecasts` and `/api/v1/resorts/{id}/history`.
* **Observability**: Exposes standard Prometheus metrics on `:8080/metrics` and liveness/readiness probes on `:8080/healthz`.

### 2.4 Interactive Frontend (`web/`)
A Next.js 16 (React 19) web application featuring:
* **MapLibre GL Canvas**: 60fps interactive vector/raster topographic map supporting Dark Matter, USGS Topo, and Esri Satellite basemaps without proprietary tokens.
* **Dynamic Styling**: Snow total color-coded pins (grey `<2"`, light blue `2–6"`, royal blue `6–12"`, deep purple `12"+`).
* **Matrix Comparison Table**: Built with `@tanstack/react-table`, sortable by Powder Score, 48h snowfall, drive time from multiple metro origins, and SLR.
* **72-Hour Temporal Scrubber**: Real-time slider scrubbing forward 72 hours, visualizing dynamic freezing level and precipitation phase shifts.
* **Persona Quick-Filters**: One-click toggles for "Deep Powder Hunter", "Wind-Hold Avoider", and "Bluebird Cruiser" personas.

---

## 3. High Availability & Fault Tolerance

* **Circuit Breakers & Exponential Backoff**: Upstream NOAA and Open-Meteo requests enforce timeout caps and exponential backoff to handle upstream weather API downtime.
* **Offline Mock Server (`test/mockserver`)**: Provides reproducible deterministic weather fixtures for hermetic local testing, E2E validation, and offline development.
* **Informer Resiliency**: The gateway serves cached forecasts from memory even if the Kubernetes control plane experiences intermittent API throttling.

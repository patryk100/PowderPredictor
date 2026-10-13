# PowderPredictor API & CRD Reference

PowderPredictor provides high-performance REST and Server-Sent Events (SSE) interfaces exposed by `powder-api-gateway`, alongside declarative Kubernetes Custom Resources.

---

## 1. REST Endpoints

### 1.1 `GET /api/v1/forecasts`
Returns all current mountain forecast reports served directly from the gateway's in-memory Kubernetes Informer cache.

#### Request
```http
GET /api/v1/forecasts HTTP/1.1
Host: localhost:8080
Accept: application/json
```

#### Query Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `region` | `string` | No | Filter by state: `VT`, `NH`, `ME`, `NY`, `MA` |
| `pass` | `string` | No | Filter by pass affiliation: `Ikon`, `Epic`, `Indy`, `Independent` |
| `min_score` | `integer`| No | Minimum Powder Score filter (0–100) |

#### Response (`200 OK`)
```json
{
  "count": 26,
  "updatedAt": "2026-10-13T17:30:00Z",
  "items": [
    {
      "resortId": "jay-peak",
      "name": "Jay Peak",
      "region": "VT",
      "passType": "Indy",
      "latitude": 44.9248,
      "longitude": -72.5034,
      "summitFt": 3968,
      "baseFt": 1815,
      "verticalFt": 2153,
      "skiableAcres": 385,
      "powderScore": 36,
      "confidenceInterval": 85.0,
      "predictedSnowfallInches": 1.5,
      "snowfall24hInches": 0.5,
      "snowfall48hInches": 1.5,
      "snowfall72hInches": 2.0,
      "snowToLiquidRatio": 6.2,
      "freezingLevelElevationFt": 5850,
      "gladesRecommended": false,
      "windHoldWarning": false,
      "crustRisk": true,
      "baseDepthInches": 0,
      "windowStart": "2026-10-13T12:00:00Z",
      "windowEnd": "2026-10-16T12:00:00Z"
    }
  ]
}
```

---

### 1.2 `GET /api/v1/forecasts/stream`
Server-Sent Events (SSE) streaming endpoint pushing instant updates when the Kubernetes controller reconciles a `SnowForecastReport`.

#### Request
```http
GET /api/v1/forecasts/stream HTTP/1.1
Host: localhost:8080
Accept: text/event-stream
```

#### SSE Stream Format
```text
event: connected
data: {"clientId":"8f41e","timestamp":"2026-10-13T17:32:00Z"}

event: forecast-update
data: {"resortId":"jay-peak","powderScore":38,"predictedSnowfallInches":1.5,"snowToLiquidRatio":6.2,"freezingLevelElevationFt":5859,"timestamp":"2026-10-13T17:35:10Z"}
```

---

### 1.3 `GET /api/v1/resorts/{id}/history`
Fetches historical telemetry and model run reconciliation records for a specific mountain.

---

### 1.4 Operations & Diagnostics
* **Liveness Probe:** `GET /healthz` $\to$ `200 OK`
* **Readiness Probe:** `GET /readyz` $\to$ `200 OK`
* **Prometheus Telemetry:** `GET /metrics` $\to$ Standard Prometheus text format
  * `powder_reconciliation_total`: Total reconciliation runs
  * `powder_reconciliation_duration_seconds`: Model execution latency
  * `powder_active_sse_clients`: Number of connected browser streams

---

## 2. Kubernetes Custom Resources

### 2.1 `ResortTarget` Example
```yaml
apiVersion: weather.powderpredictor.io/v1alpha1
kind: ResortTarget
metadata:
  name: jay-peak
  namespace: powder-system
spec:
  name: "Jay Peak"
  region: "VT"
  passType: "Indy"
  coordinates:
    latitude: 44.9248
    longitude: -72.5034
  elevation:
    summitFt: 3968
    baseFt: 1815
  pollingIntervalSeconds: 300
```

### 2.2 `SnowForecastReport` Example
```yaml
apiVersion: weather.powderpredictor.io/v1alpha1
kind: SnowForecastReport
metadata:
  name: jay-peak-forecast
  namespace: powder-system
spec:
  resortRef:
    name: jay-peak
  powderScore: 36
  predictedSnowfallInches: 1.5
  snowfall24hInches: 0.5
  snowfall48hInches: 1.5
  snowfall72hInches: 2.0
  snowToLiquidRatio: 6.2
  freezingLevelElevationFt: 5850
  confidenceInterval: 85.0
  windowStart: "2026-10-13T12:00:00Z"
  windowEnd: "2026-10-16T12:00:00Z"
```

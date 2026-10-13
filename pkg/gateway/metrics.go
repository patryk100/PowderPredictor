package gateway

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// HTTPRequestsTotal measures the total count of HTTP requests handled by the API Gateway
	HTTPRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "powder_api_http_requests_total",
			Help: "Total count of HTTP requests partitioned by route, method, and status code.",
		},
		[]string{"route", "method", "code"},
	)

	// RequestDurationSeconds measures response latency distributions
	RequestDurationSeconds = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "powder_api_request_duration_seconds",
			Help:    "Latency distribution of HTTP requests across endpoints.",
			Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5},
		},
		[]string{"route", "method"},
	)

	// ActiveSSEClients tracks the number of actively connected Server-Sent Events subscribers
	ActiveSSEClients = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "powder_api_active_sse_clients",
			Help: "Number of active Server-Sent Events (SSE) connections currently held open.",
		},
	)

	// InformerCacheSyncStatus reflects whether the in-memory Kubernetes informer cache is healthy (1) or out-of-sync (0)
	InformerCacheSyncStatus = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "powder_api_informer_cache_sync_status",
			Help: "Health of the in-memory dynamic informer cache (1 = healthy/synced, 0 = degraded/disconnected).",
		},
	)
)

// PrometheusMiddleware captures latency and status code counters for each incoming request
func PrometheusMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		duration := time.Since(start).Seconds()
		statusCode := strconv.Itoa(c.Writer.Status())

		HTTPRequestsTotal.WithLabelValues(route, c.Request.Method, statusCode).Inc()
		RequestDurationSeconds.WithLabelValues(route, c.Request.Method).Observe(duration)
	}
}

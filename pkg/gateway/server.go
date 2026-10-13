package gateway

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	weatherv1alpha1 "github.com/powderpredictor/operator/api/v1alpha1"
)

// Server encapsulates the Gin router and backend state
type Server struct {
	router *gin.Engine
	store  *InClusterStore
	broker *EventBroker
}

// NewServer builds and wires the HTTP API routes
func NewServer(store *InClusterStore, broker *EventBroker) *Server {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(PrometheusMiddleware())

	// CORS allowing origin requests strictly from localhost:3000 and verified local ingress hosts
	corsConfig := cors.Config{
		AllowOrigins: []string{
			"http://localhost:3000",
			"http://127.0.0.1:3000",
			"http://powderpredictor.local",
			"http://localhost:8080",
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	r.Use(cors.New(corsConfig))

	s := &Server{
		router: r,
		store:  store,
		broker: broker,
	}

	s.registerRoutes()
	return s
}

// Handler exposes http.Handler
func (s *Server) Handler() http.Handler {
	return s.router
}

func (s *Server) registerRoutes() {
	// Prometheus Metrics endpoint
	s.router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Readiness & health probes
	s.router.GET("/healthz", s.handleHealthz)
	s.router.GET("/readyz", s.handleReadyz)

	v1 := s.router.Group("/api/v1")
	{
		v1.GET("/forecasts", s.handleListForecasts)
		v1.GET("/forecasts/:resortId", s.handleGetResortForecast)
		v1.GET("/events/stream", s.handleEventStream)
	}
}

func (s *Server) handleHealthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s *Server) handleReadyz(c *gin.Context) {
	if s.store == nil || !s.store.HasSynced() {
		InformerCacheSyncStatus.Set(0)
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":  "syncing",
			"message": "Informer caches have not finished initial cluster synchronization",
		})
		return
	}
	InformerCacheSyncStatus.Set(1)
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}

// GET /api/v1/forecasts
func (s *Server) handleListForecasts(c *gin.Context) {
	// Query parameters
	sortBy := c.DefaultQuery("sort_by", "powder_score") // powder_score, snowfall_48h, confidence, summit_wind
	order := c.DefaultQuery("order", "desc")            // asc, desc
	region := c.Query("region")                         // VT, NH, ME, NY
	passType := c.Query("pass_type")                    // Ikon, Epic, Indy
	minScoreStr := c.Query("min_score")
	userLatStr := c.Query("user_lat")
	userLonStr := c.Query("user_lon")

	var userLat, userLon float64
	hasUserCoords := false
	if userLatStr != "" && userLonStr != "" {
		if lat, err := strconv.ParseFloat(userLatStr, 64); err == nil {
			if lon, err := strconv.ParseFloat(userLonStr, 64); err == nil {
				userLat = lat
				userLon = lon
				hasUserCoords = true
			}
		}
	}

	var minScore int
	if minScoreStr != "" {
		if ms, err := strconv.Atoi(minScoreStr); err == nil {
			minScore = ms
		}
	}

	targets := s.store.ListTargets()
	results := make([]AggregatedForecastResponse, 0, len(targets))

	for _, target := range targets {
		// Region filter
		if region != "" && !strings.EqualFold(target.Spec.Region, region) {
			continue
		}

		resortPass := inferPassType(target.Name)
		if passType != "" && !strings.EqualFold(resortPass, passType) {
			continue
		}

		item := s.buildAggregatedItem(target)

		// Min score filter
		if minScore > 0 && item.PowderScore < minScore {
			continue
		}

		// Proximity
		if hasUserCoords {
			dist := HaversineDistanceMiles(userLat, userLon, target.Spec.Latitude, target.Spec.Longitude)
			driveEst := EstimateDriveTime(dist)
			item.DistanceMiles = &dist
			item.DriveTimeEst = &driveEst
		}

		results = append(results, item)
	}

	// Sorting
	sort.Slice(results, func(i, j int) bool {
		var less bool
		switch sortBy {
		case "powder_score":
			less = results[i].PowderScore < results[j].PowderScore
		case "snowfall_48h", "snowfall":
			less = results[i].PredictedSnowfall < results[j].PredictedSnowfall
		case "confidence":
			less = results[i].ConfidenceInterval < results[j].ConfidenceInterval
		case "distance":
			if results[i].DistanceMiles != nil && results[j].DistanceMiles != nil {
				less = *results[i].DistanceMiles < *results[j].DistanceMiles
			} else {
				less = results[i].PowderScore < results[j].PowderScore
			}
		default:
			less = results[i].PowderScore < results[j].PowderScore
		}

		if strings.ToLower(order) == "desc" {
			return !less
		}
		return less
	})

	c.JSON(http.StatusOK, gin.H{
		"count": len(results),
		"items": results,
	})
}

// GET /api/v1/forecasts/:resortId
func (s *Server) handleGetResortForecast(c *gin.Context) {
	resortID := c.Param("resortId")
	target, exists := s.store.GetResortTarget(resortID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"error":   "not_found",
			"message": fmt.Sprintf("ResortTarget with ID '%s' not found", resortID),
		})
		return
	}

	baseItem := s.buildAggregatedItem(target)
	midElevation := target.Spec.BaseElevationFt + (target.Spec.SummitElevationFt-target.Spec.BaseElevationFt)/2

	// Multi-elevation detailed profile
	detail := ResortDetailResponse{
		AggregatedForecastResponse: baseItem,
		PrimaryAspects:             target.Spec.PrimaryAspects,
		MidMountainFt:              midElevation,
		LapseRateF:                 3.5, // Standard environmental lapse rate
	}

	c.JSON(http.StatusOK, detail)
}

// GET /api/v1/events/stream
func (s *Server) handleEventStream(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")

	subID := fmt.Sprintf("sub-%d", time.Now().UnixNano())
	sub, unsubscribe := s.broker.Subscribe(subID)
	ActiveSSEClients.Inc()
	defer func() {
		ActiveSSEClients.Dec()
		unsubscribe()
	}()

	c.Writer.Flush()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			// Client disconnected gracefully
			return
		case <-ticker.C:
			// Heartbeat keepalive ping comment
			_, _ = c.Writer.WriteString(": ping\n\n")
			c.Writer.Flush()
		case event, ok := <-sub.Events:
			if !ok {
				return
			}
			msg, err := FormatSSE(event)
			if err == nil {
				_, _ = c.Writer.WriteString(msg)
				c.Writer.Flush()
			}
		}
	}
}

func (s *Server) buildAggregatedItem(target *weatherv1alpha1.ResortTarget) AggregatedForecastResponse {
	item := AggregatedForecastResponse{
		ResortID:    target.Name,
		Name:        strings.Title(strings.ReplaceAll(target.Name, "-", " ")),
		Region:      target.Spec.Region,
		PassType:    inferPassType(target.Name),
		Latitude:    target.Spec.Latitude,
		Longitude:   target.Spec.Longitude,
		SummitFt:    target.Spec.SummitElevationFt,
		BaseFt:      target.Spec.BaseElevationFt,
		VerticalFt:  target.Spec.SummitElevationFt - target.Spec.BaseElevationFt,
		SkiableAcre: target.Spec.SkiableAcres,
	}

	if report, exists := s.store.GetForecastReportForResort(target.Name); exists {
		item.PowderScore = report.Spec.PowderScore
		item.ConfidenceInterval = report.Spec.ConfidenceInterval
		item.PredictedSnowfall = report.Spec.PredictedSnowfallInches
		item.SnowToLiquidRatio = report.Spec.SnowToLiquidRatio
		item.FreezingLevelFt = report.Spec.FreezingLevelElevationFt
		item.WindowStart = report.Spec.WindowStart.Time
		item.WindowEnd = report.Spec.WindowEnd.Time

		for _, cond := range report.Status.Conditions {
			if cond.Status == "True" {
				switch cond.Type {
				case "GladesRecommended":
					item.GladesRecommended = true
				case "WindHoldWarning":
					item.WindHoldWarning = true
				case "CrustRisk":
					item.CrustRisk = true
				}
			}
		}
	}

	return item
}

func inferPassType(name string) string {
	lower := strings.ToLower(name)
	switch {
	case strings.Contains(lower, "killington") || strings.Contains(lower, "sugarbush") || strings.Contains(lower, "stratton") || strings.Contains(lower, "sunday"):
		return "Ikon"
	case strings.Contains(lower, "stowe") || strings.Contains(lower, "okemo") || strings.Contains(lower, "mount-snow") || strings.Contains(lower, "sunapee"):
		return "Epic"
	case strings.Contains(lower, "jay") || strings.Contains(lower, "bolton") || strings.Contains(lower, "magic") || strings.Contains(lower, "saddleback"):
		return "Indy"
	default:
		return "Independent"
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

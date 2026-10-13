package transport

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/hashicorp/go-retryablehttp"
	"golang.org/x/time/rate"
)

// ProviderRateLimiter manages token-bucket rate limiters per domain host
type ProviderRateLimiter struct {
	mu       sync.Mutex
	limiters map[string]*rate.Limiter
	defaultR rate.Limit
	defaultB int
}

// NewProviderRateLimiter creates a domain-aware rate limiter
func NewProviderRateLimiter(defaultRate float64, defaultBurst int) *ProviderRateLimiter {
	return &ProviderRateLimiter{
		limiters: make(map[string]*rate.Limiter),
		defaultR: rate.Limit(defaultRate),
		defaultB: defaultBurst,
	}
}

// SetDomainLimit customizes rate limits for a specific host (e.g. "api.weather.gov")
func (p *ProviderRateLimiter) SetDomainLimit(host string, r float64, b int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.limiters[host] = rate.NewLimiter(rate.Limit(r), b)
}

// GetLimiter returns or initializes the rate.Limiter for the given host
func (p *ProviderRateLimiter) GetLimiter(host string) *rate.Limiter {
	p.mu.Lock()
	defer p.mu.Unlock()

	if l, ok := p.limiters[host]; ok {
		return l
	}
	l := rate.NewLimiter(p.defaultR, p.defaultB)
	p.limiters[host] = l
	return l
}

// CachingTransport implements RFC 7234 conditional validation using ETag and If-Modified-Since
type CachingTransport struct {
	base        http.RoundTripper
	cache       *LRUCache
	rateLimiter *ProviderRateLimiter
}

// NewCachingTransport constructs an RFC 7234 caching HTTP transport with rate limiting
func NewCachingTransport(base http.RoundTripper, cache *LRUCache, limiter *ProviderRateLimiter) *CachingTransport {
	if base == nil {
		base = http.DefaultTransport
	}
	if cache == nil {
		cache = NewLRUCache(256)
	}
	if limiter == nil {
		limiter = NewProviderRateLimiter(5.0, 5) // Default 5 req/sec
	}
	return &CachingTransport{
		base:        base,
		cache:       cache,
		rateLimiter: limiter,
	}
}

// RoundTrip executes conditional request evaluation and caches successful responses
func (t *CachingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Only cache GET requests
	if req.Method != http.MethodGet {
		return t.base.RoundTrip(req)
	}

	cacheKey := req.URL.String()
	cached := t.cache.Get(cacheKey)

	// Apply conditional HTTP headers if cached entry is available
	if cached != nil {
		if cached.ETag != "" && req.Header.Get("If-None-Match") == "" {
			req.Header.Set("If-None-Match", cached.ETag)
		}
		if cached.LastModified != "" && req.Header.Get("If-Modified-Since") == "" {
			req.Header.Set("If-Modified-Since", cached.LastModified)
		}
	}

	// Apply domain rate limiting
	host := req.URL.Host
	if limiter := t.rateLimiter.GetLimiter(host); limiter != nil {
		if err := limiter.Wait(req.Context()); err != nil {
			return nil, err
		}
	}

	resp, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}

	// If server responds with 304 Not Modified, serve cached body
	if resp.StatusCode == http.StatusNotModified && cached != nil {
		resp.Body.Close()

		cachedResp := &http.Response{
			StatusCode:    cached.StatusCode,
			Status:        fmt.Sprintf("%d OK (From Cache)", cached.StatusCode),
			Proto:         resp.Proto,
			ProtoMajor:    resp.ProtoMajor,
			ProtoMinor:    resp.ProtoMinor,
			Header:        http.Header{},
			Body:          io.NopCloser(bytes.NewReader(cached.Body)),
			ContentLength: int64(len(cached.Body)),
			Request:       req,
		}
		for k, v := range cached.Header {
			cachedResp.Header[k] = v
		}
		cachedResp.Header.Set("X-Cache", "HIT")
		return cachedResp, nil
	}

	// Cache successful 200 OK responses with ETag or Last-Modified
	if resp.StatusCode == http.StatusOK {
		etag := resp.Header.Get("ETag")
		lastModified := resp.Header.Get("Last-Modified")

		if etag != "" || lastModified != "" {
			bodyBytes, readErr := io.ReadAll(resp.Body)
			resp.Body.Close()
			if readErr != nil {
				return nil, readErr
			}

			// Store in LRU cache
			entry := &CacheEntry{
				Key:          cacheKey,
				StatusCode:   resp.StatusCode,
				Header:       resp.Header.Clone(),
				Body:         bodyBytes,
				ETag:         etag,
				LastModified: lastModified,
				CachedAt:     time.Now(),
			}
			t.cache.Set(cacheKey, entry)

			// Replace body with fresh reader
			resp.Body = io.NopCloser(bytes.NewReader(bodyBytes))
		}
	}

	return resp, nil
}

// ClientBuilder configures a production-ready, resilient HTTP client
type ClientBuilder struct {
	timeout     time.Duration
	maxRetries  int
	rateLimit   float64
	burst       int
	cacheCap    int
	customLimit map[string]float64
}

// NewClientBuilder initializes a builder for creating resilient HTTP clients
func NewClientBuilder() *ClientBuilder {
	return &ClientBuilder{
		timeout:     10 * time.Second,
		maxRetries:  3,
		rateLimit:   5.0,
		burst:       5,
		cacheCap:    256,
		customLimit: make(map[string]float64),
	}
}

// WithRateLimit sets the default rate limit in req/s
func (b *ClientBuilder) WithRateLimit(reqPerSec float64, burst int) *ClientBuilder {
	b.rateLimit = reqPerSec
	b.burst = burst
	return b
}

// WithDomainRateLimit sets a custom rate limit for a specific domain
func (b *ClientBuilder) WithDomainRateLimit(domain string, reqPerSec float64) *ClientBuilder {
	b.customLimit[domain] = reqPerSec
	return b
}

// WithTimeout sets request timeout
func (b *ClientBuilder) WithTimeout(d time.Duration) *ClientBuilder {
	b.timeout = d
	return b
}

// WithMaxRetries sets the maximum number of retries
func (b *ClientBuilder) WithMaxRetries(retries int) *ClientBuilder {
	b.maxRetries = retries
	return b
}

// Build returns an http.Client equipped with exponential retry backoff, LRU ETag caching, and rate limiting
func (b *ClientBuilder) Build() *http.Client {
	retryClient := retryablehttp.NewClient()
	retryClient.RetryMax = b.maxRetries
	retryClient.RetryWaitMin = 200 * time.Millisecond
	retryClient.RetryWaitMax = 2 * time.Second
	retryClient.Logger = nil // suppress default verbose logging
	retryClient.HTTPClient.Timeout = b.timeout

	cache := NewLRUCache(b.cacheCap)
	limiter := NewProviderRateLimiter(b.rateLimit, b.burst)
	for domain, r := range b.customLimit {
		limiter.SetDomainLimit(domain, r, int(r))
	}

	cachingTransport := NewCachingTransport(retryClient.HTTPClient.Transport, cache, limiter)
	retryClient.HTTPClient.Transport = cachingTransport

	return retryClient.StandardClient()
}

// ExtractHost parses the hostname from a full URL
func ExtractHost(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return u.Host
}

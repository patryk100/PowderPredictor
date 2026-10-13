package transport_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/powderpredictor/operator/pkg/weather/transport"
)

func TestLRUCache(t *testing.T) {
	cache := transport.NewLRUCache(2)

	cache.Set("key1", &transport.CacheEntry{Key: "key1", StatusCode: 200})
	cache.Set("key2", &transport.CacheEntry{Key: "key2", StatusCode: 200})

	if cache.Get("key1") == nil || cache.Get("key2") == nil {
		t.Fatal("expected key1 and key2 in cache")
	}

	// Adding key3 should evict the oldest (key1 was accessed, so key2 was oldest? Let's verify)
	cache.Get("key1") // accesses key1, making key2 LRU
	cache.Set("key3", &transport.CacheEntry{Key: "key3", StatusCode: 200})

	if cache.Get("key2") != nil {
		t.Errorf("expected key2 to be evicted")
	}
	if cache.Get("key1") == nil {
		t.Errorf("expected key1 to still be present")
	}
	if cache.Get("key3") == nil {
		t.Errorf("expected key3 to be present")
	}
}

func TestETagCachingTransport(t *testing.T) {
	var requestCount int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&requestCount, 1)

		if match := r.Header.Get("If-None-Match"); match == `"wfo-hash-1234"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}

		w.Header().Set("ETag", `"wfo-hash-1234"`)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"forecast": "snow storm"}`))
	}))
	defer server.Close()

	client := transport.NewClientBuilder().
		WithRateLimit(100.0, 100).
		WithMaxRetries(1).
		Build()

	// Request 1: Fresh fetch -> HTTP 200 with ETag cached
	req1, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, server.URL+"/grid", nil)
	resp1, err := client.Do(req1)
	if err != nil {
		t.Fatalf("request 1 failed: %v", err)
	}
	body1, _ := io.ReadAll(resp1.Body)
	resp1.Body.Close()

	if string(body1) != `{"forecast": "snow storm"}` {
		t.Errorf("unexpected body1: %s", string(body1))
	}
	if atomic.LoadInt32(&requestCount) != 1 {
		t.Errorf("expected 1 request, got %d", requestCount)
	}

	// Request 2: Conditional fetch -> Server returns 304 Not Modified, Transport returns cached body
	req2, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, server.URL+"/grid", nil)
	resp2, err := client.Do(req2)
	if err != nil {
		t.Fatalf("request 2 failed: %v", err)
	}
	body2, _ := io.ReadAll(resp2.Body)
	resp2.Body.Close()

	if string(body2) != `{"forecast": "snow storm"}` {
		t.Errorf("unexpected body2 served from 304 cache: %s", string(body2))
	}
	if resp2.Header.Get("X-Cache") != "HIT" {
		t.Errorf("expected X-Cache HIT header, got %s", resp2.Header.Get("X-Cache"))
	}
	if atomic.LoadInt32(&requestCount) != 2 {
		t.Errorf("expected 2 server requests (1 initial + 1 304 validation), got %d", requestCount)
	}
}

func TestRateLimiting(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Rate limit: 5 req/sec with burst 1
	client := transport.NewClientBuilder().
		WithRateLimit(5.0, 1).
		Build()

	start := time.Now()
	for i := 0; i < 3; i++ {
		req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, server.URL, nil)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("request %d failed: %v", i, err)
		}
		resp.Body.Close()
	}
	elapsed := time.Since(start)

	// 3 requests at 5 req/sec should take at least ~350-400ms
	if elapsed < 300*time.Millisecond {
		t.Errorf("expected rate limiter to throttle, but completed in %v", elapsed)
	}
}

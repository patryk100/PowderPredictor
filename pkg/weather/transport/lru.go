package transport

import (
	"container/list"
	"sync"
	"time"
)

// CacheEntry holds a cached HTTP response payload and associated validation metadata
type CacheEntry struct {
	Key          string
	StatusCode   int
	Header       map[string][]string
	Body         []byte
	ETag         string
	LastModified string
	CachedAt     time.Time
	ExpiresAt    time.Time
}

// LRUCache provides a thread-safe, memory-bounded Least Recently Used cache for HTTP responses
type LRUCache struct {
	mu       sync.Mutex
	capacity int
	items    map[string]*list.Element
	evict    *list.List
}

type entryItem struct {
	key   string
	entry *CacheEntry
}

// NewLRUCache creates an in-memory LRU cache with the specified capacity
func NewLRUCache(capacity int) *LRUCache {
	if capacity <= 0 {
		capacity = 256
	}
	return &LRUCache{
		capacity: capacity,
		items:    make(map[string]*list.Element),
		evict:    list.New(),
	}
}

// Get returns the cached entry for key, or nil if not found
func (c *LRUCache) Get(key string) *CacheEntry {
	c.mu.Lock()
	defer c.mu.Unlock()

	if elem, ok := c.items[key]; ok {
		c.evict.MoveToFront(elem)
		return elem.Value.(*entryItem).entry
	}
	return nil
}

// Set stores or updates a cache entry, evicting the least recently used entry if over capacity
func (c *LRUCache) Set(key string, entry *CacheEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if elem, ok := c.items[key]; ok {
		c.evict.MoveToFront(elem)
		elem.Value.(*entryItem).entry = entry
		return
	}

	if c.evict.Len() >= c.capacity {
		oldest := c.evict.Back()
		if oldest != nil {
			c.evict.Remove(oldest)
			delete(c.items, oldest.Value.(*entryItem).key)
		}
	}

	elem := c.evict.PushFront(&entryItem{key: key, entry: entry})
	c.items[key] = elem
}

// Len returns current number of entries
func (c *LRUCache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.evict.Len()
}

// Clear clears all cache entries
func (c *LRUCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items = make(map[string]*list.Element)
	c.evict.Init()
}

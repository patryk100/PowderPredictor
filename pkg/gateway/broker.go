package gateway

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

// EventType distinguishes SSE events
type EventType string

const (
	EventForecastUpdated EventType = "forecast.updated"
	EventPowderAlert     EventType = "powder.alert"
)

// SSEEvent represents a payload broadcasted to SSE subscribers
type SSEEvent struct {
	Type      EventType   `json:"type"`
	Timestamp time.Time   `json:"timestamp"`
	ResortID  string      `json:"resortId"`
	Data      interface{} `json:"data"`
}

// ClientSubscriber wraps a client channel for receiving SSE events
type ClientSubscriber struct {
	ID     string
	Events chan SSEEvent
}

// EventBroker manages fan-out pub/sub for real-time SSE streaming
type EventBroker struct {
	mu          sync.RWMutex
	subscribers map[string]*ClientSubscriber
	broadcast   chan SSEEvent
	stopCh      chan struct{}
}

// NewEventBroker constructs and initializes an active event broker
func NewEventBroker() *EventBroker {
	b := &EventBroker{
		subscribers: make(map[string]*ClientSubscriber),
		broadcast:   make(chan SSEEvent, 100),
		stopCh:      make(chan struct{}),
	}
	go b.run()
	return b
}

func (b *EventBroker) run() {
	for {
		select {
		case <-b.stopCh:
			return
		case event := <-b.broadcast:
			b.mu.RLock()
			for _, sub := range b.subscribers {
				select {
				case sub.Events <- event:
				default:
					// Drop if subscriber channel is congested to prevent blocking the broker
				}
			}
			b.mu.RUnlock()
		}
	}
}

// Subscribe registers a new subscriber channel and returns a cleanup func
func (b *EventBroker) Subscribe(subID string) (*ClientSubscriber, func()) {
	b.mu.Lock()
	sub := &ClientSubscriber{
		ID:     subID,
		Events: make(chan SSEEvent, 50),
	}
	b.subscribers[subID] = sub
	b.mu.Unlock()

	unsubscribe := func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		if _, exists := b.subscribers[subID]; exists {
			delete(b.subscribers, subID)
			close(sub.Events)
		}
	}

	return sub, unsubscribe
}

// SubscriberCount returns active subscriber count
func (b *EventBroker) SubscriberCount() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.subscribers)
}

// Publish broadcasts an event to all connected subscribers
func (b *EventBroker) Publish(event SSEEvent) {
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now()
	}
	select {
	case b.broadcast <- event:
	default:
		// Drop on saturated broadcast channel
	}
}

// BroadcastForecastUpdate emits forecast.updated and conditionally powder.alert if score >= 85
func (b *EventBroker) BroadcastForecastUpdate(resortID string, score int, snowfall float64, data interface{}) {
	b.Publish(SSEEvent{
		Type:      EventForecastUpdated,
		Timestamp: time.Now(),
		ResortID:  resortID,
		Data:      data,
	})

	if score >= 85 {
		b.Publish(SSEEvent{
			Type:      EventPowderAlert,
			Timestamp: time.Now(),
			ResortID:  resortID,
			Data: map[string]interface{}{
				"resortId":    resortID,
				"powderScore": score,
				"snowfall":    snowfall,
				"alert":       fmt.Sprintf("Powder Alert! %s scored %d/100 with %.1f\" predicted", resortID, score, snowfall),
			},
		})
	}
}

// FormatSSE formats an event into standard Server-Sent Events text wire format
func FormatSSE(event SSEEvent) (string, error) {
	bytes, err := json.Marshal(event.Data)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("event: %s\ndata: %s\n\n", event.Type, string(bytes)), nil
}

// Close gracefully terminates the broker
func (b *EventBroker) Close() {
	close(b.stopCh)
}

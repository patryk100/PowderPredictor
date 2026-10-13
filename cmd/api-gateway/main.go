package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"

	"github.com/powderpredictor/operator/pkg/gateway"
)

func main() {
	var httpPort int
	var kubeconfig string
	flag.IntVar(&httpPort, "port", 8080, "Port for the HTTP API gateway")
	flag.StringVar(&kubeconfig, "kubeconfig", "", "Path to kubeconfig (optional, falls back to in-cluster or ~/.kube/config)")
	flag.Parse()

	// 1. Build Kubernetes Client Configuration
	config, err := buildKubeConfig(kubeconfig)
	if err != nil {
		fmt.Printf("Error creating Kubernetes client config: %v\n", err)
		os.Exit(1)
	}

	dynClient, err := dynamic.NewForConfig(config)
	if err != nil {
		fmt.Printf("Error creating dynamic client: %v\n", err)
		os.Exit(1)
	}

	// 2. Initialize in-memory cache & event broker
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	broker := gateway.NewEventBroker()
	defer broker.Close()

	store := gateway.NewInClusterStore(broker)

	if err := store.StartInformerSync(ctx, dynClient, 10*time.Minute); err != nil {
		fmt.Printf("Warning: Informer sync failed or timed out: %v\n", err)
	} else {
		fmt.Printf("Informer sync complete. Loaded %d ResortTargets.\n", len(store.ListTargets()))
	}

	// 3. Start Gin HTTP Server
	server := gateway.NewServer(store, broker)
	addr := fmt.Sprintf(":%d", httpPort)
	httpServer := &http.Server{
		Addr:    addr,
		Handler: server.Handler(),
	}

	go func() {
		fmt.Printf("PowderPredictor API Gateway listening on http://0.0.0.0%s\n", addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("HTTP server terminated: %v\n", err)
		}
	}()

	// Graceful shutdown handling
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("Shutting down API Gateway gracefully...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		fmt.Printf("Error shutting down HTTP server: %v\n", err)
	}
	fmt.Println("API Gateway stopped.")
}

func buildKubeConfig(kubeconfigPath string) (*rest.Config, error) {
	// Try in-cluster config first
	if config, err := rest.InClusterConfig(); err == nil {
		return config, nil
	}

	// Fallback to explicit flag or KUBECONFIG env
	if kubeconfigPath == "" {
		if env := os.Getenv("KUBECONFIG"); env != "" {
			kubeconfigPath = env
		} else if home := homedir.HomeDir(); home != "" {
			kubeconfigPath = filepath.Join(home, ".kube", "config")
		}
	}

	if _, err := os.Stat(kubeconfigPath); err == nil {
		return clientcmd.BuildConfigFromFlags("", kubeconfigPath)
	}

	return nil, fmt.Errorf("could not find valid in-cluster configuration or local kubeconfig file")
}

"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ResortForecast } from "@/types/resort";

interface UseForecastStreamOptions {
  onForecastUpdated?: (resortId: string, powderScore: number, predictedSnowfallInches: number, fullData?: any) => void;
  onFocusResort?: (resortId: string) => void;
}

export function useForecastStream(options: UseForecastStreamOptions = {}) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const backoffRef = useRef<number>(1000); // Exponential backoff starts at 1s
  const { onForecastUpdated, onFocusResort } = options;

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isCancelled = false;

    function connect() {
      try {
        eventSource = new EventSource("http://localhost:8080/api/v1/events/stream");

        eventSource.onopen = () => {
          setIsConnected(true);
          backoffRef.current = 1000; // Reset backoff upon successful handshake
        };

        // Standard forecast update event
        eventSource.addEventListener("forecast.updated", (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            if (data.resortId && onForecastUpdated) {
              onForecastUpdated(data.resortId, data.powderScore, data.predictedSnowfallInches, data);
            }
          } catch {
            // Ignore parse errors
          }
        });

        // High priority powder alert event (Score surge or heavy snowfall update)
        eventSource.addEventListener("powder.alert", (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            const resortName = data.name ?? data.resortId ?? "Northeast Mountain";
            const score = data.powderScore ?? 0;
            const snow = data.predictedSnowfallInches ?? 0;

            toast.info(`Powder Alert: ${resortName}`, {
              description: `Powder Score upgraded to ${score}/100 with ${snow}" fresh snow modeled.`,
              action: {
                label: "View Mountain",
                onClick: () => {
                  if (onFocusResort && data.resortId) {
                    onFocusResort(data.resortId);
                  }
                },
              },
              duration: 8000,
            });
          } catch {
            // Ignore
          }
        });

        eventSource.onerror = () => {
          setIsConnected(false);
          eventSource?.close();

          if (!isCancelled) {
            // Reconnect with exponential backoff capped at 15s
            const delay = backoffRef.current;
            backoffRef.current = Math.min(15000, backoffRef.current * 1.5);
            reconnectTimeoutRef.current = setTimeout(connect, delay);
          }
        };
      } catch {
        setIsConnected(false);
      }
    }

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      eventSource?.close();
    };
  }, [onForecastUpdated, onFocusResort]);

  return { isConnected };
}

import { useEffect, useState } from "react";
import { api, type HealthResponse } from "@/lib/api-client";

/**
 * Hook to monitor backend health status.
 * Polls every `intervalMs` (default: 30s).
 */
export function useBackendStatus(intervalMs = 30000) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const h = await api.health();
        if (active) {
          setHealth(h);
          setAvailable(true);
        }
      } catch {
        if (active) {
          setHealth(null);
          setAvailable(false);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    check();
    const timer = setInterval(check, intervalMs);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return { health, available, loading };
}

import { useEffect, useRef, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  flushTelemetryQueue,
  trackClick,
  trackNavigation,
  getTelemetrySessionId,
} from "@/lib/client-telemetry";

/**
 * Mount once under the router: navigation + coarse click tracking for observability_events.
 */
export function TelemetryProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    void getTelemetrySessionId();
  }, []);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    trackNavigation(pathname);
  }, [pathname]);

  useEffect(() => {
    const onClick = (ev: MouseEvent) => trackClick(ev.target);
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  useEffect(() => {
    const id = setInterval(() => void flushTelemetryQueue(), 15000);
    return () => clearInterval(id);
  }, []);

  return <>{children}</>;
}

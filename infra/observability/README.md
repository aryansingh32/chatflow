# ChatFlow observability stack (self-hosted)

This directory bootstraps **Prometheus**, **Grafana**, **Loki**, **Tempo**, and an **OpenTelemetry Collector** aligned with the ChatFlow API (`OTEL_EXPORTER_OTLP_ENDPOINT`).

## Quick start

```bash
cd infra/observability
docker compose up -d
```

Set on the API service:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=chatflow-api
```

Grafana: http://localhost:3001 (admin / admin in compose)

## Optional platforms

| Tool | Role | Notes |
|------|------|--------|
| **SigNoz** | APM + traces UI | Install via [official Helm](https://signoz.io/docs/install/kubernetes/); point the same OTLP endpoint. |
| **PostHog** | Product analytics | Self-host or cloud; use separate SDK keys in the web app. |
| **Highlight.io** | Session replay | Cloud or self-host; wire `H.init` in the frontend entry. |
| **GlitchTip** | Sentry-compatible errors | Self-host GlitchTip; send DSN from browser SDK. |
| **Wazuh** | SIEM / FIM | See `wazuh/README.md`. |

The ChatFlow admin **Observability** tab aggregates first-party events (`observability_events`, `error_reports`) and live Redis fan-out; external tools complement that data.

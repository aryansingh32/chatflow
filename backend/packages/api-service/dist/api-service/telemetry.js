// ============================================================
// OpenTelemetry — optional OTLP export (Grafana / SigNoz / etc.)
// Enable with OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
// ============================================================
import { createLogger } from '../shared/logger/index.js';
const logger = createLogger('telemetry');
let sdkStarted = false;
export async function initNodeTelemetry() {
    if (sdkStarted)
        return;
    if (process.env.OTEL_SDK_DISABLED === 'true') {
        logger.info('otel:disabled-flag');
        return;
    }
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
    if (!endpoint) {
        logger.info('otel:skipped-no-OTEL_EXPORTER_OTLP_ENDPOINT');
        return;
    }
    try {
        const { NodeSDK } = await import('@opentelemetry/sdk-node');
        const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
        const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
        const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');
        const { Resource } = await import('@opentelemetry/resources');
        const { ATTR_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions');
        const serviceName = process.env.OTEL_SERVICE_NAME ?? 'chatflow-api';
        const traceExporter = new OTLPTraceExporter({
            url: endpoint.includes('/v1/traces') ? endpoint : `${endpoint.replace(/\/$/, '')}/v1/traces`,
        });
        const metricExporter = new OTLPMetricExporter({
            url: endpoint.includes('/v1/metrics') ? endpoint : `${endpoint.replace(/\/$/, '')}/v1/metrics`,
        });
        const sdk = new NodeSDK({
            resource: new Resource({
                [ATTR_SERVICE_NAME]: serviceName,
            }),
            traceExporter,
            metricReader: new PeriodicExportingMetricReader({
                exporter: metricExporter,
                exportIntervalMillis: parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS ?? '60000', 10),
            }),
            instrumentations: [
                getNodeAutoInstrumentations({
                    '@opentelemetry/instrumentation-fs': { enabled: false },
                }),
            ],
        });
        await sdk.start();
        sdkStarted = true;
        logger.info('otel:sdk-started', { serviceName, endpoint });
        process.on('SIGTERM', () => {
            sdk
                .shutdown()
                .catch(() => { })
                .finally(() => process.exit(0));
        });
    }
    catch (e) {
        logger.error('otel:init-failed', e);
    }
}
//# sourceMappingURL=telemetry.js.map
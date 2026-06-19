# Wazuh (SIEM) — integration sketch

ChatFlow emits structured logs to Redis lists and Postgres. For **Wazuh**:

1. Deploy the [Wazuh Docker stack](https://documentation.wazuh.com/current/deployment-options/docker/wazuh-container.html) on a dedicated cluster segment.
2. Ship **API access logs** and **host / container logs** via Filebeat or the Wazuh agent.
3. Map high-signal rules:
   - repeated `401` on `/admin/*` → brute-force / token guessing
   - spikes in `429` → abuse or need to scale rate limits
   - OS-level file integrity on workflow JSON and `.env` paths

The admin **Security** tab can be extended to query Wazuh indexer APIs once credentials are configured (`WAZUH_INDEXER_URL`, `WAZUH_API_USER`).

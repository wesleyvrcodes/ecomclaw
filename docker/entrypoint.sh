#!/bin/bash
set -euo pipefail

AGENT_DIR="/home/openclaw/.openclaw/agents/default"
mkdir -p "$AGENT_DIR/agent"

# Write OpenClaw config from environment
if [ -n "${OPENCLAW_CONFIG_JSON:-}" ]; then
    echo "$OPENCLAW_CONFIG_JSON" > /home/openclaw/.openclaw/config.json
    echo "[entrypoint] Wrote OpenClaw config"
fi

# Write SOUL.md from environment
if [ -n "${AGENT_SOUL_MD:-}" ]; then
    echo "$AGENT_SOUL_MD" > "$AGENT_DIR/agent/SOUL.md"
    echo "[entrypoint] Wrote SOUL.md ($(wc -c < "$AGENT_DIR/agent/SOUL.md") bytes)"
fi

echo "[entrypoint] Starting OpenClaw gateway on port 8080..."

# Start OpenClaw gateway
exec openclaw gateway \
    --config /home/openclaw/.openclaw/config.json \
    --port 8080 \
    --bind 0.0.0.0

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PORT="${LLAMA_PORT:-8080}"
HOST="${LLAMA_HOST:-127.0.0.1}"
MODELS_PRESET="${LLAMA_MODELS_PRESET:-$SCRIPT_DIR/models.ini}"
MODELS_MAX="${LLAMA_MODELS_MAX:-1}"

LLAMA_BIN="$(command -v llama-server || echo "$HOME/.local/bin/llama-server")"

if [[ ! -x "$LLAMA_BIN" ]]; then
  echo "Error: llama-server executable not found." >&2
  exit 1
fi

if [[ ! -f "$MODELS_PRESET" ]]; then
  echo "Error: models preset file not found at: $MODELS_PRESET" >&2
  exit 1
fi

echo "=========================================================="
echo " Starting llama-server in Router Mode"
echo " Host: http://$HOST:$PORT"
echo " Presets: $MODELS_PRESET"
echo " Max active models: $MODELS_MAX (LRU eviction)"
echo " Binary: $LLAMA_BIN"
ENABLE_LISTEN=0
SERVER_ARGS=()

for arg in "$@"; do
  if [[ "$arg" == "--listen" || "$arg" == "-l" ]]; then
    ENABLE_LISTEN=1
  else
    SERVER_ARGS+=("$arg")
  fi
done

if [[ "$ENABLE_LISTEN" -eq 1 ]]; then
  echo " Mode: Router Server + Firestore Worker Daemon (--listen)"
  echo "=========================================================="

  mkdir -p "/tmp/braindump_llama_slots"
  # Launch llama-server in background
  "$LLAMA_BIN" \
    --models-preset "$MODELS_PRESET" \
    --models-max "$MODELS_MAX" \
    --host "$HOST" \
    --port "$PORT" \
    --slot-save-path "/tmp/braindump_llama_slots" \
    "${SERVER_ARGS[@]}" &
  LLAMA_PID=$!

  cleanup() {
    echo ""
    echo "Stopping llama-server (PID: $LLAMA_PID)..."
    kill "$LLAMA_PID" 2>/dev/null || true
    wait "$LLAMA_PID" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM

  sleep 2

  PYTHON_BIN="$PROJECT_ROOT/scripts/.venv/bin/python"
  if [[ ! -x "$PYTHON_BIN" ]]; then
    PYTHON_BIN="python3"
  fi

  exec "$PYTHON_BIN" "$SCRIPT_DIR/import_motivation.py" --listen --server "http://$HOST:$PORT"
else
  mkdir -p "/tmp/braindump_llama_slots"
  exec "$LLAMA_BIN" \
    --models-preset "$MODELS_PRESET" \
    --models-max "$MODELS_MAX" \
    --host "$HOST" \
    --port "$PORT" \
    --slot-save-path "/tmp/braindump_llama_slots" \
    "${SERVER_ARGS[@]}"
fi


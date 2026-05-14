#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-3000}"
NEXT_LOG="${NEXT_LOG:-$ROOT_DIR/.next/next-dev.log}"
NGROK_LOG="${NGROK_LOG:-$ROOT_DIR/.next/ngrok.log}"
export PORT

NEXT_PID=""
NGROK_PID=""

cleanup() {
  if [[ -n "$NGROK_PID" ]] && kill -0 "$NGROK_PID" 2>/dev/null; then
    kill "$NGROK_PID" 2>/dev/null || true
  fi

  if [[ -n "$NEXT_PID" ]] && kill -0 "$NEXT_PID" 2>/dev/null; then
    kill "$NEXT_PID" 2>/dev/null || true
  fi
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

is_port_listening() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_port() {
  local attempts=40

  for _ in $(seq 1 "$attempts"); do
    if is_port_listening; then
      return 0
    fi
    sleep 0.5
  done

  echo "Timed out waiting for localhost:$PORT to start." >&2
  echo "Check log: $NEXT_LOG" >&2
  exit 1
}

get_ngrok_url() {
  curl -fsS http://127.0.0.1:4040/api/tunnels 2>/dev/null |
    node -e '
      let input = "";
      process.stdin.on("data", (chunk) => (input += chunk));
      process.stdin.on("end", () => {
        try {
          const data = JSON.parse(input);
          const port = process.env.PORT;
          const tunnels = Array.isArray(data.tunnels) ? data.tunnels : [];
          const matchingTunnel = tunnels.find((tunnel) => {
            const addr = tunnel.config && tunnel.config.addr;
            return tunnel.proto === "https" && typeof addr === "string" && addr.endsWith(":" + port);
          });
          const fallbackTunnel = tunnels.find((tunnel) => tunnel.proto === "https");
          const publicUrl = (matchingTunnel || fallbackTunnel || {}).public_url;
          if (publicUrl) {
            console.log(publicUrl);
          }
        } catch {
          process.exit(0);
        }
      });
    '
}

wait_for_ngrok_url() {
  local attempts=40
  local public_url=""

  for _ in $(seq 1 "$attempts"); do
    public_url="$(get_ngrok_url || true)"
    if [[ -n "$public_url" ]]; then
      echo "$public_url"
      return 0
    fi
    sleep 0.5
  done

  echo "Timed out waiting for ngrok tunnel." >&2
  echo "Check log: $NGROK_LOG" >&2
  exit 1
}

trap cleanup INT TERM

require_command npm
require_command node
require_command ngrok
require_command curl
require_command lsof

mkdir -p "$ROOT_DIR/.next"

echo "Project: $ROOT_DIR"
echo "Local port: $PORT"

if is_port_listening; then
  echo "Next.js dev server already appears to be listening on localhost:$PORT."
else
  echo "Starting Next.js dev server..."
  (
    cd "$ROOT_DIR"
    PORT="$PORT" npm run dev
  ) >"$NEXT_LOG" 2>&1 &
  NEXT_PID="$!"
  wait_for_port
  echo "Next.js dev server started. Log: $NEXT_LOG"
fi

PUBLIC_URL="$(get_ngrok_url || true)"

if [[ -n "$PUBLIC_URL" ]]; then
  echo "ngrok tunnel already running: $PUBLIC_URL"
else
  echo "Starting ngrok tunnel..."
  ngrok http "$PORT" --log=stdout >"$NGROK_LOG" 2>&1 &
  NGROK_PID="$!"
  PUBLIC_URL="$(wait_for_ngrok_url)"
  echo "ngrok tunnel started. Log: $NGROK_LOG"
fi

echo
echo "Local app:  http://localhost:$PORT"
echo "Public URL: $PUBLIC_URL"
echo
echo "Use this value in .env.local while testing Telegram webhook locally:"
echo "NEXT_PUBLIC_APP_URL=\"$PUBLIC_URL\""
echo
echo "Telegram webhook command, after the webhook route exists:"
echo "curl \"https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=$PUBLIC_URL/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>\""
echo
echo "Later, after Vercel deployment, replace this local ngrok flow with the Vercel production URL."

if [[ -n "$NEXT_PID" || -n "$NGROK_PID" ]]; then
  echo "Press Ctrl+C to stop services started by this script."
  wait
fi

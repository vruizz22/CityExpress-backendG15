#!/usr/bin/env bash
# CodeDeploy hook (ValidateService) — corre en la EC2 como root.
# Falla el deploy (y dispara rollback en CodeDeploy) si el master no responde.
set -euo pipefail

for i in $(seq 1 18); do
  if curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then
    echo "master OK al intento ${i}"
    exit 0
  fi
  echo "esperando al master... (${i})"
  sleep 5
done

echo "El master no respondió en 127.0.0.1:3000 tras ~90s"
docker logs cityexpress_master --tail=50 || true
exit 1

#!/usr/bin/env bash
# Prueba local del ASL de suscripciones con AWS Step Functions Local + mocks.
# NO toca tu cuenta AWS real: usa un endpoint local y credenciales dummy.
# Requiere Docker.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENDPOINT="http://localhost:8083"
IMAGE="amazon/aws-stepfunctions-local"
NAME="sfn-local-cityexpress"
DUMMY_ROLE="arn:aws:iam::123456789012:role/DummyRole"

# Credenciales/región dummy SOLO para este script (no afectan tu ~/.aws).
export AWS_DEFAULT_REGION=us-east-1
export AWS_ACCESS_KEY_ID=dummy
export AWS_SECRET_ACCESS_KEY=dummy

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ Levantando Step Functions Local (Docker)..."
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p 8083:8083 \
  --mount type=bind,readonly,source="$HERE/MockConfigFile.json",destination=/home/StepFunctionsLocal/MockConfigFile.json \
  -e SFN_MOCK_CONFIG=/home/StepFunctionsLocal/MockConfigFile.json \
  "$IMAGE" >/dev/null

echo -n "▶ Esperando a que responda"
for _ in $(seq 1 30); do
  if aws stepfunctions list-state-machines --endpoint-url "$ENDPOINT" >/dev/null 2>&1; then
    echo " ✓"; break
  fi
  echo -n "."; sleep 1
done

echo "▶ Creando state machine (gemelo local)..."
aws stepfunctions create-state-machine \
  --endpoint-url "$ENDPOINT" \
  --name "SubscriptionEngine" \
  --definition "file://$HERE/state-machine.local.asl.json" \
  --role-arn "$DUMMY_ROLE" >/dev/null

run_case() {
  local case_name="$1"; local input="$2"
  echo ""
  echo "════════ Test: $case_name ════════"
  local arn="arn:aws:states:us-east-1:123456789012:stateMachine:SubscriptionEngine#$case_name"
  local exec_arn
  exec_arn=$(aws stepfunctions start-execution \
    --endpoint-url "$ENDPOINT" \
    --state-machine-arn "$arn" \
    --input "$input" \
    --query executionArn --output text)

  local status="RUNNING"
  for _ in $(seq 1 25); do
    status=$(aws stepfunctions describe-execution --endpoint-url "$ENDPOINT" \
      --execution-arn "$exec_arn" --query status --output text)
    [ "$status" != "RUNNING" ] && break
    sleep 1
  done

  echo "camino recorrido (estado : status del tick):"
  aws stepfunctions get-execution-history \
    --endpoint-url "$ENDPOINT" \
    --execution-arn "$exec_arn" \
    --query "events[?stateEnteredEventDetails].stateEnteredEventDetails.name" \
    --output text | tr '\t' '\n' | sed 's/^/   → /'
  echo "resultado ejecución: $status"
}

# periodSeconds=1 para que los Wait sean cortos (en prod el mínimo es 60).
run_case "CompletesAfterThree"    '{"subscriptionId":"sub-1","periodSeconds":1}'
run_case "BudgetExhausted"        '{"subscriptionId":"sub-2","periodSeconds":1}'
run_case "Cancelled"              '{"subscriptionId":"sub-3","periodSeconds":1}'
run_case "DuplicateThenCompleted" '{"subscriptionId":"sub-4","periodSeconds":1}'

echo ""
echo "✔ Listo. Esperado:"
echo "   • CompletesAfterThree    → 3 DispatchTick, termina en Done (SUCCEEDED)"
echo "   • BudgetExhausted        → 2 DispatchTick, corta en Done (SUCCEEDED)"
echo "   • Cancelled              → 2 DispatchTick, corta en Done (SUCCEEDED)"
echo "   • DuplicateThenCompleted → 3 DispatchTick (el duplicate NO corta), Done"
echo "   (el contenedor se elimina solo al salir)"

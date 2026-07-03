# Prueba local del ASL de suscripciones

Valida la **lógica de control** de la state machine (loop, gates, corte por status,
`tickNumber++`) con **AWS Step Functions Local** e integraciones **mockeadas**.
No toca la cuenta AWS real (endpoint local + credenciales dummy).

## Qué prueba

| Test | Mock de `DispatchTick` | Esperado |
|---|---|---|
| `CompletesAfterThree` | triggered, triggered, completed | 3 ticks, corta en `completed` → SUCCEEDED |
| `BudgetExhausted` | triggered, skipped-no-budget | 2 ticks, corta → SUCCEEDED |
| `Cancelled` | triggered, inactive | 2 ticks, corta → SUCCEEDED |
| `DuplicateThenCompleted` | triggered, duplicate, completed | 3 ticks (el `duplicate` **no** corta) → SUCCEEDED |

## Requisitos

- **Docker** (corre `amazon/aws-stepfunctions-local`; en Apple Silicon corre emulado).
- **AWS CLI** (ya instalado).

## Correr

```bash
cd infra/subscriptions/local-test
chmod +x run-local-test.sh
./run-local-test.sh
```

Imprime, por cada caso, la secuencia de estados recorridos y si terminó `SUCCEEDED`.

## Archivos

| Archivo | Rol |
|---|---|
| `state-machine.local.asl.json` | **Gemelo solo-para-test**: idéntico a `../state-machine.asl.json` salvo que `DispatchTick` usa `lambda:invoke` (mockeable determinista) en vez de `sqs:sendMessage.waitForTaskToken`. Mantener en sync. |
| `MockConfigFile.json` | Respuestas mockeadas de `DispatchTick` por caso de prueba. |
| `run-local-test.sh` | Levanta SFN Local, crea la state machine y corre los 4 casos. |

> **Por qué el gemelo:** el mocking de `.waitForTaskToken` en SFN Local es poco fiable;
> como la lógica del loop es igual con `lambda:invoke`, el gemelo la valida de forma
> determinista. La versión de **producción** (`../state-machine.asl.json`) usa SQS +
> `waitForTaskToken` (requisito de SQS + callback real del Dispatcher Lambda).

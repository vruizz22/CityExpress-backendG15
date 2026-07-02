# RF01 — Motor de suscripciones con AWS Step Functions

> **Qué es:** el motor que, dada una suscripción, dispara `amount` envíos periódicos
> (cada `periodSeconds`) hasta agotar el cupo o el presupuesto.
> **Workflow:** Step Functions **Standard**. **Cuenta:** `353731341232` · **Región:** `us-east-1`.
> **ARN:** `arn:aws:states:us-east-1:353731341232:stateMachine:cityexpress-subscriptions`
> **IaC:** todo el motor vive en [`infra/subscriptions/`](../infra/subscriptions/) (ver [`iac.md`](iac.md)).

---

## 1. Arquitectura en una imagen

```
Usuario ── POST /subscriptions (JWT) ──► Backend NestJS
                                           │  SfnSubscriptionTrigger.start()
                                           │  states:StartExecution (name = subscriptionId)
                                           ▼
                              ┌─────────────────────────────┐
                              │  State Machine (STANDARD)    │
                              │  cityexpress-subscriptions   │
                              └─────────────────────────────┘
                                           │ DispatchTick: sqs:sendMessage.waitForTaskToken
                                           ▼
                                   ┌──────────────────┐   maxReceiveCount=5   ┌─────────┐
                                   │  SQS: ...-tick    │ ───────────────────► │  DLQ    │
                                   └──────────────────┘                       └─────────┘
                                           │ event source mapping (batch_size=1)
                                           ▼
                              ┌─────────────────────────────┐
                              │  Dispatcher Lambda           │
                              │  ...-dispatcher (nodejs20.x) │
                              └─────────────────────────────┘
                                           │ POST /subscriptions/:id/tick  (x-tick-secret)
                                           ▼
                                   Backend NestJS · processTick()  ── gate + cobro + idempotencia
                                           │  devuelve TickResult { status }
                                           ▼
                              Dispatcher ── states:SendTaskSuccess(TickResult) ──► (reanuda la SM)
```

**Idea clave:** la lógica de negocio (¿corresponde cobrar?, ¿queda budget?, ¿ya se
cobró este tick?) vive **entera en el backend** (`processTick`, de Andrés). La state
machine **no** toma decisiones de negocio: sólo lleva el contador de tick, espera la
periodicidad, y decide seguir/parar mirando el `status` que devuelve el backend.

---

## 2. El flujo ASL (estados)

Definición: [`infra/subscriptions/state-machine.asl.json`](../infra/subscriptions/state-machine.asl.json).

```
StartExecution  input = { subscriptionId, periodSeconds, amount }
   │
   ▼
┌ Initialize ┐ (Pass)  tickNumber = 0
   │
   ▼
┌ DispatchTick ┐ (Task · sqs:sendMessage.waitForTaskToken)  ◄─────────────┐
   │  encola { subscriptionId, tickNumber, taskToken }                     │
   │  → la ejecución queda PAUSADA hasta el callback del Dispatcher         │
   │  TimeoutSeconds=60 · Retry ×3 (backoff 2.0) · Catch States.ALL → Failed│
   │  resultado (TickResult) → $.tick                                       │
   ▼                                                                        │
┌ EvaluateStatus ┐ (Choice sobre $.tick.status)                            │
   ├─ "triggered" | "duplicate" ─────────► ┌ WaitPeriod ┐ (Wait)           │
   │                                          SecondsPath $.periodSeconds   │
   │                                          │                            │
   │                                          ▼                            │
   │                                       ┌ IncrementTick ┐ (Pass)         │
   │                                          tickNumber++  ────────────────┘
   │
   └─ default ("completed" | "skipped-no-budget" | inesperado) ─► ┌ Done ┐ (Succeed)

┌ Failed ┐ (Fail)  ← Catch de DispatchTick tras agotar reintentos
```

| Estado | Tipo | Qué hace |
|---|---|---|
| **Initialize** | Pass | Inyecta `tickNumber = 0` al input. |
| **DispatchTick** | Task (`waitForTaskToken`) | Encola el tick en SQS con el `taskToken` y **pausa** la ejecución hasta el callback. `TimeoutSeconds=60`, `Retry` ×3 con backoff, `Catch` → `Failed`. |
| **EvaluateStatus** | Choice | Gate nativo: si `status ∈ {triggered, duplicate}` sigue; si no (`completed`, `skipped-no-budget`, o cualquier valor inesperado) → `Done`. |
| **WaitPeriod** | Wait | Espera `periodSeconds` (`SecondsPath`). El Wait va **después** del envío: el 1er paquete sale al toque, los siguientes cada período. |
| **IncrementTick** | Pass | `tickNumber++` (via `States.MathAdd`), reconstruye el estado y descarta `$.tick`. |
| **Done** | Succeed | Término normal (cupo alcanzado o budget agotado). |
| **Failed** | Fail | Falla irrecuperable tras reintentos (SQS caído / Dispatcher sin responder). |

---

## 3. El patrón `waitForTaskToken` (por qué)

`DispatchTick` usa `arn:aws:states:::sqs:sendMessage.waitForTaskToken`. Esto:

1. **Encola** un mensaje en la cola de ticks con un `taskToken` único de esa ejecución.
2. **Pausa** la ejecución (sin consumir capacidad de cómputo) hasta que alguien haga
   `SendTaskSuccess`/`SendTaskFailure` con ese token.
3. El **Dispatcher Lambda** (disparado por la cola) hace el trabajo real —pegarle al
   backend— y devuelve el `TickResult` con `SendTaskSuccess`, reanudando la máquina.

Ventaja sobre invocar la Lambda directo: desacopla el disparo del resultado, da
**reintentos con backoff a nivel de state machine** (no a nivel de mensaje SQS), y deja
una **DLQ** como red de seguridad para mensajes veneno.

**Reintentos — dos capas distintas:**
- **Lógicos** (el backend respondió error, o timeout del fetch): `SendTaskFailure('DispatchFailed')`
  → lo maneja el `Retry` de `DispatchTick`, que reintenta con un **token nuevo** (no
  reencola el mensaje viejo).
- **Veneno** (JSON inválido, o la Lambda crashea sin borrar el mensaje): la
  `redrive_policy` de SQS lo manda a la **DLQ** tras `maxReceiveCount=5`.

---

## 4. Contrato del trigger (backend ⇄ state machine)

Contrato completo en [`E3/contrato-trigger-andres.md`](../../E3/contrato-trigger-andres.md).

### Arranque — `StartExecution`
El backend arranca la máquina desde
[`src/subscriptions/sfn-subscription-trigger.ts`](../src/subscriptions/sfn-subscription-trigger.ts)
(`SfnSubscriptionTrigger`, inyectado como `SUBSCRIPTION_TRIGGER` en
[`subscriptions.module.ts`](../src/subscriptions/subscriptions.module.ts)):

```jsonc
// input de StartExecution
{ "subscriptionId": "<uuid>", "periodSeconds": 60..172800, "amount": 1..100 }
```

- `name = subscriptionId` → **idempotencia**: 1 ejecución por suscripción. Si ya
  existe, AWS lanza `ExecutionAlreadyExists`, que se atrapa y se devuelve `null`
  (no re-arranca ni rompe).
- ARN por env `SUBSCRIPTIONS_STATE_MACHINE_ARN`; región por `AWS_REGION`.
- Devuelve `executionArn` → el service lo guarda en `sfnExecutionArn`.

### Cada tick — `POST /subscriptions/:id/tick`
El Dispatcher ([`jobs-service/src/dispatch.ts`](../jobs-service/src/dispatch.ts)) llama:

```
POST {BACKEND_URL}/subscriptions/:id/tick
Headers: x-tick-secret: <SUBSCRIPTION_TICK_SECRET>
Body:    { "tickNumber": <n> }
→ 2xx  { "status": "triggered" | "duplicate" | "completed" | "skipped-no-budget", ... }
```

`processTick` hace **gate + cobro + ledger + idempotencia de forma atómica** y devuelve
el `status`. El Dispatcher lo reenvía tal cual a la state machine con `SendTaskSuccess`.

| `status` | Significado | Efecto en la SM |
|---|---|---|
| `triggered` | Se despachó un envío este tick. | **Sigue** (WaitPeriod → siguiente tick). |
| `duplicate` | Tick repetido (idempotencia): no re-cobra. | **Sigue**. |
| `completed` | Se alcanzó `amount` envíos. | **Para** (Done). |
| `skipped-no-budget` | Presupuesto agotado. | **Para** (Done). |

> **Nota de diseño — `amount + 1` ticks.** El último tick es de *confirmación*: ve que
> `sentCount >= amount`, devuelve `completed` y **no re-cobra**. Ej.: `amount=3` produce
> `4 DispatchTick / 3 WaitPeriod`. Esto es esperado, no un doble cobro.

---

## 5. Seguridad y permisos (mínimo privilegio)

Detalle del IaC en [`iac.md`](iac.md). Roles ([`infra/subscriptions/iam.tf`](../infra/subscriptions/iam.tf)):

| Principal | Permisos | Sobre |
|---|---|---|
| **State machine** (`states.amazonaws.com`) | `sqs:SendMessage` | la cola `-tick` |
| | `logs:*Delivery`, `logs:PutResourcePolicy`… | `*` (lo exige la config de logging) |
| **Dispatcher Lambda** (`lambda.amazonaws.com`) | `sqs:ReceiveMessage/DeleteMessage/GetQueueAttributes` | la cola `-tick` |
| | `states:SendTaskSuccess/Failure/Heartbeat` | `*` (el task token no es ARN → no admite resource-level) |
| | `AWSLambdaBasicExecutionRole` | logs |
| **Backend / EC2** (`cityexpress-ec2-role`) | `states:StartExecution` | la state machine |
| | `states:StopExecution/DescribeExecution` | `:execution:<sm>:*` |

- El permiso del backend se agrega como **inline policy al rol EXISTENTE** de la EC2
  (sin adoptar el rol completo en Terraform) → cambio acotado. Ver [`infra/backend-iam.tf`](../infra/backend-iam.tf).
- El endpoint `/tick` **no** usa el authorizer JWT del API Gateway (auth `NONE`, mismo
  patrón que `/heartbeat`); lo protege el guard `x-tick-secret` (secreto compartido
  Lambda ⇄ backend, inyectado como variable **sensible** de Terraform Cloud, nunca en el repo).

---

## 6. Decisiones de diseño (y descartadas)

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| **Standard** (no Express) | Ejecuciones **largas** (hasta 2 días entre ticks), pocas y con historial auditable. Express es para alto volumen y ≤5 min. | Express: no soporta la duración. |
| **Sin "CheckGate" Lambda** | `processTick` ya gatea+cobra atómicamente y devuelve `status`; la SM sólo mira ese `status`. | Un estado extra de gate: redundante y duplicaría la fuente de verdad. |
| **1 sola Dispatcher Lambda** | El envío es un único paso (pegarle al backend). | Varias Lambdas por sub-paso: complejidad sin beneficio. |
| **`waitForTaskToken` + SQS** | Desacople, reintentos a nivel SM, DLQ como red. | Invocar Lambda directo: sin DLQ ni backoff nativo. |
| **`name = subscriptionId`** | Idempotencia gratis (1 ejecución por suscripción). | Nombre random: permitiría duplicados. |
| **Wait DESPUÉS del envío** | El 1er paquete sale inmediato; el resto cada período. | Wait antes: el usuario esperaría un período para el 1er envío. |
| **Dispatcher extiende `jobs-service/`** | Reusa el toolchain (esbuild, deps) del worker existente. | Proyecto Lambda aparte: más scaffolding. |

---

## 7. Operación

- **Logs SM:** CloudWatch `/aws/vendedlogs/states/cityexpress-subscriptions` (nivel `ALL`, con execution data).
- **Logs Dispatcher:** CloudWatch `/aws/lambda/cityexpress-subscriptions-dispatcher`.
- **Mensajes muertos:** cola `cityexpress-subscriptions-tick-dlq` (retención 14 días) — inspeccionar ahí si un tick nunca completó.
- **Cancelar una suscripción:** `states:StopExecution` sobre su ejecución (el backend ya tiene el permiso).
- **Reintentar la infra / redeploy:** ver [`iac.md`](iac.md) §"Cómo recrear".

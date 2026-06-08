# Serverless — Workers en AWS Lambda (RDOC03 / RNF06)

> Documenta el cálculo de rutas desplegado como **AWS Lambda** con **Serverless Framework v3**, invocada por el servicio de jobs. No contiene secretos.

---

## 1. Qué y por qué

**RNF06** exige que los workers corran en AWS vía Serverless Framework o SAM, invocables por el servicio de jobs, y que persistan o retornen el resultado.

Diseño elegido (reusa todo el `jobs-service` de BullMQ que cubre RNF01): la cola sigue siendo **BullMQ/Redis**, pero el **worker ya no calcula localmente en prod** — invoca una **Lambda** que corre el Dijkstra. Así "el servicio de jobs invoca la Lambda" (RNF06) **y** la cola sigue siendo Bull (RNF01).

```text
orquestador (NestJS)
   │  POST /job { sourceNode, graph }
   ▼
job-master (Express + BullMQ)  ──encola──▶  Redis (cola "routing-jobs")
                                               │
                                               ▼
                                   job-worker (BullMQ Worker)
                                     │  WORKER_LAMBDA_NAME seteado?
                                     ├─ sí → invoca AWS Lambda (RequestResponse)
                                     │         cityexpress-jobs-worker-prod-compute
                                     │         (corre dijkstra.ts) ──▶ retorna { byDistance, byPrice }
                                     └─ no → calcula local con dijkstra.ts (dev)
                                     │
                                     ▼  returnvalue persistido en Redis
orquestador hace polling GET /job/:id ──▶ "completed" + result ──▶ updateComputedRoutes()
```

La Lambda **retorna** el resultado (RNF06 "retornar"), BullMQ lo **persiste** en Redis como `returnvalue`, y el orquestador lo aplica al hacer polling.

---

## 2. Prerrequisitos

- AWS CLI autenticada en la cuenta `353731341232`, región `us-east-1`.
- Node 20 + `pnpm` (o `npm`) en `jobs-service/`.
- El stage por defecto es `prod` (configurable con `--stage`).

> El cómputo pesado vive en Lambda → la EC2 solo corre Redis + master + worker delgado (cabe en la t3.micro). Por eso se usa **una sola cuenta AWS** (la 2ª cuenta del enunciado es solo sugerencia).

---

## 3. Estructura

Todo vive en `jobs-service/` (reusa `src/dijkstra.ts`):

| Archivo | Rol |
|---|---|
| [jobs-service/src/handler.ts](../jobs-service/src/handler.ts) | Handler Lambda `compute`: recibe `{ graph, sourceNode }`, corre `computeOptimalRoutes` y retorna `{ byDistance, byPrice }`. |
| [jobs-service/src/dijkstra.ts](../jobs-service/src/dijkstra.ts) | Dijkstra por `distance` y `transportCost` (mismo algoritmo en Lambda y local). |
| [jobs-service/src/worker.ts](../jobs-service/src/worker.ts) | Worker BullMQ **dual-mode** (invoca la Lambda o calcula local). |
| [jobs-service/src/master.ts](../jobs-service/src/master.ts) | Express + BullMQ: `POST /job`, `GET /job/:id`, `GET /heartbeat`. |
| [jobs-service/serverless.yml](../jobs-service/serverless.yml) | Config Serverless v3. |

### `serverless.yml` (resumen)

```yaml
service: cityexpress-jobs-worker
frameworkVersion: '3'
provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  stage: ${opt:stage, 'prod'}
functions:
  compute:
    handler: src/handler.compute
    timeout: 60
    memorySize: 256
plugins:
  - serverless-esbuild      # bundlea el TS sin config extra
```

- **Serverless v3** (no v4): open-source, sin login/licencia.
- **`serverless-esbuild`**: empaqueta `handler.ts` + `dijkstra.ts` (sin deps externas → artefacto chico).
- **Rol de ejecución por defecto** (solo logs en CloudWatch): la Lambda no toca otros servicios AWS.
- Nombre resultante de la función: **`cityexpress-jobs-worker-${stage}-compute`** → en prod `cityexpress-jobs-worker-prod-compute`.

---

## 4. Deploy

```bash
cd jobs-service
pnpm install            # incluye serverless, serverless-esbuild, @aws-sdk/client-lambda
pnpm exec serverless deploy --stage prod
```

**Output esperado** (al final del deploy):
```text
functions:
  compute: cityexpress-jobs-worker-prod-compute
```
Anota ese **nombre de función** → va en `WORKER_LAMBDA_NAME` del worker.

> 📸 _Captura pendiente:_ salida de `serverless deploy` + la función en la consola de Lambda.

### Prueba directa (invoke)

```bash
pnpm exec serverless invoke -f compute --stage prod --data '{
  "sourceNode": "TK3",
  "graph": {
    "TK3": [{"code":"HGW","distance":100,"transportCost":10,"enabled":true}],
    "HGW": []
  }
}'
```
**Output esperado:** `{ "byDistance": { "HGW": { "nextHop":"HGW","totalDistance":100,"totalCost":10,"path":["TK3","HGW"] } }, "byPrice": { ... } }`.

> 📸 _Captura pendiente:_ resultado del `serverless invoke`.

---

## 5. Cómo el worker invoca la Lambda

[jobs-service/src/worker.ts](../jobs-service/src/worker.ts) decide en runtime:

- Si **`WORKER_LAMBDA_NAME`** está seteado → crea un `LambdaClient` e invoca con `InvokeCommand` (`InvocationType: 'RequestResponse'`), pasando `{ graph, sourceNode }` como `Payload`. Si `FunctionError`, lanza error (BullMQ reintenta: `attempts: 3`, backoff exponencial).
- Si **no** está seteado → corre `computeOptimalRoutes` local (útil en dev sin AWS).

El retorno del worker se guarda como `returnvalue` del job en Redis (persistencia del resultado, RNF06).

---

## 6. Levantar master + Redis + worker

### Dev (local, sin AWS)

```bash
docker compose up -d redis-jobs job-master job-worker
curl http://localhost:3001/heartbeat   # {"status":true,"service":"Routing Job Master"}
```
En dev el worker **no** tiene `WORKER_LAMBDA_NAME` → calcula local. `restart: always` en el compose mantiene los servicios arriba.

### Prod (cablear la Lambda) — ⏳ pendiente de deploy

Para que el worker invoque la Lambda en la EC2:

1. Agregar `redis-jobs`, `job-master` y `job-worker` a `docker-compose.prod.yml`.
2. En `job-worker` (prod), setear:
   ```yaml
   - WORKER_LAMBDA_NAME=cityexpress-jobs-worker-prod-compute
   - AWS_REGION=us-east-1
   ```
3. Dar al **instance profile** de la EC2 el permiso `lambda:InvokeFunction` sobre esa función (sin keys en el código — usa el rol de la instancia).
4. El front consume el estado vía `GET https://api.andresitowan.com/heartbeat` (proxy del backend al `job-master`).

---

## 7. Limpieza

```bash
cd jobs-service
pnpm exec serverless remove --stage prod   # borra la Lambda y su stack CloudFormation
```

---

## 8. Decisiones (resumen)

| Tema | Elegido | Por qué |
|---|---|---|
| Serverless v3 vs v4 vs SAM | **v3** | open-source, sin login/licencia; `serverless-esbuild` empaqueta TS con config mínima reusando `dijkstra.ts` |
| Worker = BullMQ que invoca Lambda | Cumple **RNF01** (cola) + **RNF06** (Lambda) | no se bota el `jobs-service` existente |
| Una sola cuenta AWS | Sí | el cómputo pesado va a Lambda → la EC2 no sufre de RAM |
| Persistir/retornar | Lambda retorna → BullMQ persiste en Redis | cubre el "persistir o retornar" de RNF06 |

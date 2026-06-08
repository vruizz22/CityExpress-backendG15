# Plan E2 — Guillermo

> **Rol / Alcance:** Infraestructura, jobs/workers serverless, auth/permisos y deploy/CI-CD.
> **Requisitos asignados:** **RNF01** (jobs/workers, 6 pts · *Esencial*), **RNF05** (permisos admin/usuario, 3 pts · *Esencial*), **RNF06** (workers serverless en AWS, 3 pts · *Esencial*), **RNF08** (CI/CD backend, 4 pts), **RNF09** (CI/CD frontend, 2 pts), **RDOC03** (doc serverless, 2 pts), **RDOC04** (doc CI/CD, 2 pts).
> **Total bajo tu responsabilidad:** ~22 pts (+8 si tomas BONUS01, opcional).

> **🔴 Cambio importante vs. la 1ª versión del plan:** el PR **#21 (`feature/best-route-logic`, de mamorkus/Joaco)** ya creó un `jobs-service/` funcional con **BullMQ + Redis** (master Express + worker + Dijkstra) y cableó el backend para usarlo. Eso cubre buena parte de **RNF01**, así que **NO lo reconstruyas**. Tu trabajo real se desplaza a: **(1) convertir el worker a Lambda/Serverless para RNF06**, (2) endurecer RNF01, (3) RNF05, (4) RNF08/RNF09, (5) docs. Ver §1.5 y §3–§4.

> **🌿 Branch de trabajo (actualizado 2026-06-07):** trabajamos en **`feature/e2-infra`**. Los PR **#20** (`feature/routing-packages`) y **#21** (`feature/best-route-logic`), ambos de mamorkus, **ya están mergeados en `develop`** (`6a4df74`). Hicimos *fast-forward* de `feature/e2-infra` al tip de `develop`, así que la rama ya tiene **todo el trabajo del equipo** (`jobs-service/`, ruteo por criterios, orquestador) y **aún sin commits propios** nuestros. Ya **no hay merges pendientes** con #20/#21. A medida que el equipo siga empujando a `develop`, rebasea/mergea periódicamente. `jobs-service/dijkstra.ts` ya está disponible en la rama → RNF06 puede reutilizarlo directo.

---

## ⚠️ 0. Prioridades (la fecha no es problema, pero igual ordena)

Meta dura del enunciado: *"NO se revisarán entregas que no estén en la nube bajo ningún concepto."* Orden recomendado:

1. **RNF06** — convertir el worker a Lambda (Serverless) y desplegarlo. Es tu gap genuino y esencial (3 pts) que el PR #21 NO cubre.
2. **RNF01** — endurecer el jobs-service ya existente (queue, estados, heartbeat proxy, persistencia de resultados) y dejarlo en la nube.
3. **RNF05** — validar JWT Auth0 en backend + separar admin/usuario.
4. **RNF08 / RNF09** — pipelines de deploy.
5. **RDOC03 / RDOC04** — se escriben mientras implementas.

Cada sección marca con 🟢 el **MVP mínimo demostrable**.

---

## 1. Contexto del repo (estado E1 + lo que trae el PR #21)

**Base E1 (en `develop`/`main`):**
- Backend **NestJS** (`master`) + **Postgres** + **RabbitMQ** directo (`amqplib`).
- **IdP = Auth0** (issuer `https://frontendg15cityexpress.us.auth0.com/`, audience `https://api.andresitowan.com`). Hoy el backend **NO valida el token**: lo valida API Gateway y NGINX confía vía `X-Origin-Auth`. El modelo [User](prisma/schema.prisma) ya tiene `subject` (= `sub`) y `email`.
- **Infra AWS:** cuenta `353731341232`, `us-east-1`, EC2 `i-0bfbc93f5e6340508` (EIP `52.5.25.114`, t3.micro, Ubuntu 24.04), ECR privado, front en S3 `cityexpress-frontend-andresitowan` + CloudFront `EYMIU0TNOQ7F9`. Deploy hoy **manual** (ver [docs/deploy.md](docs/deploy.md)).

**Ya en `develop` (E2, #20+#21 mergeados — estado actual):**
- `jobs-service/` (BullMQ + Redis): `src/master.ts`, `src/worker.ts`, `src/dijkstra.ts`. Sub-proyecto con su propio `package.json` (excluido del build del root vía `tsconfig.build.json`).
- Backend: `routing-orchestrator.service.ts` (POST /job + polling vía `JOB_MASTER_URL`), `distance-table.service.ts` con `getNextHop(dest, criteria)` + `computedRoutes` en memoria, ruteo por criterio en `package.service.ts`.
- `docker-compose.yml` (dev) trae `redis-jobs` + `job-master` + `job-worker`. En ambos compose el `master` tiene **`USE_AMQP=true`** (para que el broker conecte: el factory de `routing.module.ts` usa esa env) y en dev agregamos **`JOB_MASTER_URL=http://job-master:3001`** para que el orquestador alcance al `job-master`.
- ⚠️ **Pendiente de deploy:** el `jobs-service` (y Redis) **no** está en `docker-compose.prod.yml` todavía — eso es parte de tu RNF06.

**Front (confirmado por el agente del front):**
- Repo: `https://github.com/vruizz22/CityExpress-frontendG15.git`, rama prod `main`, **sin workflow de deploy** (solo CI). Build: `pnpm build` (vite) → `dist/`.
- Manda **ACCESS token** (no ID token) con `audience=https://api.andresitowan.com` como `Authorization: Bearer`.
- **No distingue admin**: no lee claim/rol/permiso ni grupo. No existe nada de admin en Auth0 todavía → hay que definirlo (ver §5).
- "Mis envíos": el front NO manda `sub` ni user id; espera que el **backend derive el usuario desde el JWT**.
- Heartbeat (RNF04): el front lo consumiría vía `https://api.andresitowan.com/heartbeat` (a través del backend), **no** a una URL directa del jobs-service.

---

## 1.5 🔴 Qué traen los PR #20/#21 (✅ ya mergeados a `develop`) y cómo te repartes el trabajo

**PR #20 (`feature/routing-packages`, mamorkus) — arreglo E1:** corrige `GET /routes` para que el front muestre las rutas (el back devuelve las rutas guardadas en memoria), y suma capacidad al broker (`amqp-message-broker.service.ts`, +193 líneas, publicar a otras colas — base para el RF06 de Victor). No cambia tu alcance, pero es la base sobre la que se apoya el #21.

El PR #21 agrega:

- **`jobs-service/`** (contenedor, igual que `connector`):
  - `src/master.ts` — Express con `POST /job`, `GET /job/:id`, `GET /heartbeat`. Usa **BullMQ** sobre **Redis**. Job payload: `{ sourceNode, graph }`.
  - `src/worker.ts` — **BullMQ Worker** que ejecuta `computeOptimalRoutes(graph, source)` localmente.
  - `src/dijkstra.ts` — Dijkstra para `distance` y `transportCost`. Devuelve `{ byDistance, byPrice }` con `{ nextHop, totalDistance, totalCost, path }` por destino.
  - `Dockerfile`, `package.json` (bullmq, express, ioredis, zod).
- **Backend:** `routing-orchestrator.service.ts` (arma el grafo, `POST /job` a `JOB_MASTER_URL`, hace polling de `GET /job/:id`, aplica el resultado), `distance-table.service.ts` (guarda `computedRoutes` en memoria, expone `getNextHop(dest, criteria)`), y `package.service.ts` usa criterio en vez de salto aleatorio. Añade Redis al `docker-compose`.

**Reparto resultante:**

| Requisito | Estado por PR #21 | Lo que te queda a ti |
|---|---|---|
| **RNF01** | Mayormente hecho (queue BullMQ, estados, 3 endpoints). El enunciado recomienda "Bull" para Node ✅. | Endurecer (heartbeat proxy, persistir resultados RNF07, idempotencia/debounce), dejarlo en la nube. |
| **RNF06** | ❌ **No cubierto.** El worker es un proceso BullMQ, no una Lambda. | **Convertir el worker para que invoque una Lambda (Serverless Framework) que corre el Dijkstra.** Este es tu trabajo central. |
| RF02/RF07 | Dijkstra + criterios + getNextHop (de Joaco). | Solo aportar `hops`/`routeMetricCost` si faltan (ver §2). |

> ⚠️ **3 bugs/gaps que SIGUEN ABIERTOS post-merge (verificado al 2026-06-07):**
> 1. **[Lo arreglamos nosotros en RNF06]** — El grafo NO calza con el schema del master. El orquestador manda `graph: { [CITY]: { dest: {distance, price} } }` (objeto anidado, key `price`), pero `master.ts` valida `graph: Record<string, RouteEdge[]>` con `RouteEdge = {code, distance, transportCost, enabled}` (array, key `transportCost`). **`POST /job` daría 400 — sigue roto.** Como en RNF06 vamos a tocar el flujo de jobs y decidiste arreglarlo directo (sin esperar a Joaco), unificamos el shape ahí (avisándole a mamorkus). Ver §4.
> 2. **[Pregúntale a Victor]** — El grafo solo tiene aristas de la ciudad propia (un salto). Para ruteo óptimo multi-salto real se necesita la **matriz completa de todas las ciudades** → es su **RF06** (responder y juntar las tablas de todas las ciudades). Hasta eso, "óptimo" = directo.
> 3. **[Pregúntale a Andre]** — `computedRoutes` vive solo en memoria → falta persistir "rutas calculadas" (RNF07). Él es dueño de los modelos/BD; necesitas que cree `CalculatedRoute` y acordar que el orquestador lo escriba al aplicar el resultado.

---

## 2. Dependencias y contratos con el equipo

| Con | Qué acordar | Estado |
|---|---|---|
| **mamorkus / Joaco** (PR #21) | Shape único del grafo (`POST /job`) y del resultado. **Recomiendo el del master:** `graph: Record<city, RouteEdge[]>`, `RouteEdge={code,distance,transportCost,enabled}`; resultado `{byDistance,byPrice}` con `{nextHop,totalDistance,totalCost,path}`. **Añadir `hops` (= `path.length-1`) y dejar `routeMetricCost` = totalDistance|totalCost** para la cotización (RF02) y maxHops (RF01/RF07). | 🔧 lo arreglamos en RNF06 (avisar a mamorkus) |
| **Victor** (broker) | Que la matriz que alimenta `getSnapshot()`/el orquestador contenga **todas** las ciudades (RF06), no solo la propia. Y debounce del recálculo (hoy se dispara en cada update). | ⚠️ por cerrar (gap #2) |
| **Andre** (BD/pagos) | (a) Modelo `CalculatedRoute` y **quién persiste** el resultado del job (propuesta: el orquestador, al aplicar `updateComputedRoutes`). (b) Que los modelos de envío/pago tengan `ownerSubject` (= `sub`) para RNF05. | ⚠️ por cerrar (gap #3) |
| **Front** | Resuelto (ver §1). Falta solo definir cómo se marca admin (§5) — lo decides tú en backend. | ✅ |

---

## 3. RNF01 — Servicio de jobs/workers (6 pts · Esencial) — *endurecer lo existente*

No reconstruyas: adopta el `jobs-service/` del PR #21. Tu trabajo:

1. ✅ **Heartbeat proxy en el backend (HECHO, 2026-06-07)** — para RNF04 del front, que pega a `api.andresitowan.com/heartbeat`:
   - ✅ Módulo `src/jobs/`: `GET /heartbeat` → `JobsService.isJobsServiceUp()` hace `fetch(${JOB_MASTER_URL}/heartbeat)` con timeout (`AbortSignal.timeout(2000)`) + try/catch → `{ jobsService: true|false }` (siempre 200). Con tests (controller + service).
   - ✅ Env `JOB_MASTER_URL` (ya en `docker-compose.yml` dev → `http://job-master:3001`). Falta su valor en prod al desplegar el jobs-service (RNF06/RNF08).
   - ⏳ **Deploy:** agregar la ruta `/heartbeat` (auth NONE) en API Gateway (ver [docs/deploy.md §10](docs/deploy.md)) para que el front la alcance vía `api.andresitowan.com/heartbeat`.
2. **Persistir resultados (RNF07):** cuando el orquestador recibe el resultado, además de `updateComputedRoutes` en memoria, persistir en `CalculatedRoute` (coordinar con Andre). Así sobrevive reinicios y sirve a la cotización.
3. ✅ **Idempotencia / anti-spam (HECHO, 2026-06-07):** el `DistanceTableService` ahora llama `routingOrchestrator.scheduleRouteRecomputation()` (debounce de `ROUTE_RECOMPUTE_DEBOUNCE_MS`, default 3000ms) en vez de disparar directo. Agrupa ráfagas de `cost-update` en un solo recálculo + guard de "uno a la vez" (si ya corre uno, marca rerun trailing en vez de solapar). Con tests (`routing-orchestrator.service.spec.ts`).
4. **Robustez (RNF03):** ya hay retries en BullMQ (`attempts:3`, backoff) y polling con límite. Verifica que `FAILED` se propague y que el backend no quede colgado.
5. **Redis en la nube:** BullMQ necesita Redis. En EC2 va como contenedor (`restart: unless-stopped`). Ojo RAM en la t3.micro (ver §4.2 y respuesta de "2 cuentas").

🟢 **MVP demostrable:** `curl https://api.andresitowan.com/heartbeat` → `{jobsService:true}`; ciclo `cost-update` → orquestador `POST /job` → `GET /job/:id` `completed` con `{byDistance,byPrice}` aplicadas.

---

## 4. RNF06 — Workers serverless en AWS (3 pts · Esencial) — *tu trabajo central*

**Objetivo del enunciado:** *"El sistema de workers debe estar desplegado en AWS utilizando Serverless Framework o AWS SAM. Las funciones Lambda... deben poder ser invocadas por el servicio de jobs y deben persistir o retornar el resultado del cálculo de rutas."*

El worker BullMQ del PR #21 **no es una Lambda** → no cumple RNF06. Solución limpia que **reutiliza todo lo del PR #21**: mantienes el master + BullMQ (cola y tracking = RNF01), pero el **worker BullMQ deja de calcular localmente y pasa a invocar una Lambda** que corre el Dijkstra. Así "el servicio de jobs invoca a la Lambda" (RNF06) y la cola sigue siendo Bull (RNF01). Doble check ✅.

### 4.0 Tooling de deploy — ✅ DECISIÓN: Serverless Framework v3

El enunciado deja libre elección (Serverless Framework **o** AWS SAM). Elegimos **Serverless Framework v3**:
- **El enunciado lo recomienda explícitamente** y la mayoría del material/ayudantías apunta a Serverless.
- **v3 (no v4):** v3 es totalmente open-source y **no requiere crear cuenta ni licencia de Serverless Inc** (v4 sí pide login/credenciales sobre cierto umbral). Para un proyecto de curso, v3 evita esa fricción y no tiene costo.
- **vs AWS SAM:** SAM es válido pero más AWS-céntrico y verboso (CloudFormation puro); Serverless + `serverless-esbuild` empaqueta TS con cero config y un `serverless.yml` mínimo, y nos deja **reutilizar `jobs-service/src/dijkstra.ts`** directo en el handler.
- Empaquetado con **`serverless-esbuild`** (bundlea el handler TS; `dijkstra.ts` no tiene deps externas, así que el artefacto es chico).

### 4.1 Pasos

> **Estado (2026-06-07) — scaffolding hecho y verificado (build/lint/test) en `feature/e2-infra`, sin commitear:**
> - ✅ `jobs-service/src/handler.ts` (Lambda, reutiliza `dijkstra.ts`).
> - ✅ `jobs-service/serverless.yml` (v3 + `serverless-esbuild`).
> - ✅ `jobs-service/src/worker.ts` → **dual-mode** (invoca la Lambda si `WORKER_LAMBDA_NAME` está seteado; si no, calcula local).
> - ✅ `jobs-service/package.json` → `@aws-sdk/client-lambda` + serverless v3 toolchain + script `deploy`.
> - ✅ Orquestador: arreglado el shape del grafo (bug #1) → `POST /job` ya valida contra el master.
> - ⏳ **Falta (deploy, lo corres tú con creds AWS):** `cd jobs-service && npx serverless deploy --stage prod` → crea `cityexpress-jobs-worker-prod-compute`; luego setear `WORKER_LAMBDA_NAME` + dar `lambda:InvokeFunction` al job-worker en prod, y sumar el jobs-service a `docker-compose.prod.yml`.

1. **Crear la Lambda (Serverless Framework v3) reutilizando `dijkstra.ts`:**
   - Vive en `jobs-service/` (mismo proyecto, reusa `src/dijkstra.ts`): nuevos `src/handler.ts` + `serverless.yml`.
   - `handler.ts`:
     ```ts
     import { computeOptimalRoutes } from '../src/dijkstra';
     export const compute = async (event: { graph: Graph; sourceNode: string }) => {
       return computeOptimalRoutes(event.graph, event.sourceNode);
     };
     ```
   - `serverless.yml`:
     ```yaml
     service: cityexpress-jobs-worker
     provider:
       name: aws
       runtime: nodejs20.x
       region: us-east-1
     functions:
       compute:
         handler: handler.compute
         timeout: 60
     plugins: [serverless-esbuild]
     ```
   - `pnpm add -D serverless serverless-esbuild`. Deploy: `pnpm exec serverless deploy --stage prod`. Anota el **nombre/ARN** de la función.
2. **Cambiar `worker.ts` (BullMQ) para invocar la Lambda** en vez de `computeOptimalRoutes` local:
   ```ts
   import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
   const lambda = new LambdaClient({ region: 'us-east-1' });
   // dentro del handler del Worker:
   const out = await lambda.send(new InvokeCommand({
     FunctionName: process.env.WORKER_LAMBDA_NAME!,        // 'cityexpress-jobs-worker-prod-compute'
     InvocationType: 'RequestResponse',
     Payload: Buffer.from(JSON.stringify({ graph: job.data.graph, sourceNode: job.data.sourceNode })),
   }));
   return JSON.parse(Buffer.from(out.Payload!).toString());  // BullMQ guarda esto como returnvalue
   ```
   - `pnpm add @aws-sdk/client-lambda` en `jobs-service`.
   - El resultado de la Lambda se **retorna** (RNF06 "retornar el resultado") y BullMQ lo **persiste** en Redis.
3. **Credenciales para invocar la Lambda:**
   - Si el jobs-service corre en la **EC2 (misma cuenta)**: dale al **instance profile** de la EC2 el permiso `lambda:InvokeFunction` sobre esa función. Sin keys en el código.
   - Si va en **otra cuenta** (ver §4.2): cross-account role (más fricción). Recomendado evitar al inicio.
4. **Persistir/retornar resultado:** ya cubierto — la Lambda retorna; BullMQ persiste en Redis; el orquestador lo guarda en `CalculatedRoute` (§3.2). Cubre el "persistir o retornar" de RNF06.
5. **Master reiniciable + disponible en demo:** `restart: unless-stopped` en compose; `/heartbeat` accesible vía el proxy del backend (§3.1).

### 4.2 Cuentas AWS — ✅ DECISIÓN TOMADA: una sola cuenta

- La segunda cuenta es **sugerencia, no requisito** (RNF01: *"Se sugiere utilizar otra cuenta AWS... por motivos de RAM"*; RNF06 NO la exige). "Dos cuentas" = dos cuentas AWS con distinto account ID (cada una con su free tier); dos IAM users NO sirven (comparten el free tier de la misma cuenta).
- **Decidido: usamos una sola cuenta** (`353731341232`, `us-east-1`). Como el cómputo pesado (Dijkstra) vive en **Lambda**, la EC2 solo suma **Redis + master + worker delgado** → cabe en la t3.micro. Y el `lambda:InvokeFunction` desde la EC2 es trivial con el instance profile (sin cross-account).
- Si la t3.micro queda corta de RAM con Redis: opciones baratas antes de abrir 2ª cuenta → usar **ElastiCache/Upstash Redis free**, o subir el `jobs-service` a su propia EC2 chica en la misma cuenta.

🟢 **MVP demostrable:** `serverless deploy` ok; la Lambda invocada por el worker BullMQ; resultado vuelve al backend; captura del deploy y de un job `completed` para RDOC03.

---

## 5. RNF05 — Permisos admin/usuario en el backend (3 pts · Esencial)

El front manda **access token** Auth0 y **no maneja admin**; el backend debe (a) derivar identidad del JWT y (b) decidir el rol.

### 5.1 Pasos

1. **Validar JWT Auth0 en el backend** (defensa en profundidad + obtener `sub`):
   - `pnpm add jwks-rsa jsonwebtoken` (o `jose`). Env: `AUTH0_ISSUER`, `AUTH0_AUDIENCE` (valores ya conocidos).
   - `JwtAuthGuard`: lee `Authorization: Bearer`, valida firma vía JWKS, verifica `iss/aud/exp`, pone `req.user = { sub, email, ... }`.
   - Upsert en [User](prisma/schema.prisma) por `subject = sub`.
2. **Rol admin — ¿se exige Auth0 o se puede en BD?**
   - **No se exige que el flag admin viva en Auth0.** El enunciado pide *"Utilice su IdP para el manejo de usuarios"* (= autenticación vía IdP, que ya cumples con Auth0) y *"usuarios marcados como admins"*, sin especificar **dónde** está esa marca. RNF05 solo exige **separar permisos** admin/usuario. Por lo tanto **manejar el rol en tu BD es válido y defendible**.
   - 🟢 **Recomendado (rápido, todo en backend):** agrega `role`/`isAdmin` al modelo `User` (migración Prisma). Marca admins a mano (SQL/seed). El backend lee el rol tras resolver `sub` del JWT. Expón `GET /me → { sub, email, role }` para que el front (RF08, no es tuyo) muestre la UI admin.
   - **Alternativa "más IdP" (opcional):** crear un Role "admin" en Auth0 + un **Action** post-login que inyecte `https://cityexpress/roles` en el access token; el backend lo lee. Más "puro" pero requiere tocar el dashboard de Auth0 y coordinar con el front. Si un ayudante fuera estricto, esta es la más a prueba de balas; igual la marca en BD cumple el requisito. Déjala como mejora si sobra tiempo.
3. **`RolesGuard` + `@Roles('admin')`** sobre los endpoints:
   - Heredados E1 + nuevas vistas de rutas/jobs/pagos → admin.
   - Cotizar / pagar / mis-envíos → autenticado + ownership.
4. **Ownership:** las vistas de usuario filtran por `ownerSubject = req.user.sub` (coordinar con Andre que sus modelos lo guarden). "Mis envíos" deriva el usuario del JWT, como espera el front.
5. **No rompas el gateway:** mantén `X-Origin-Auth`/NGINX; solo **añades** validación de identidad/rol en la app.
6. Tests: user vs admin; user no ve envío ajeno (403); sin token (401).

🟢 **MVP demostrable:** guard valida JWT; `req.user.sub` poblado; `/me` devuelve rol; un endpoint admin y uno de usuario protegidos; test "user no ve envíos de otro".

---

## 6. RNF08 — CI/CD backend (4 pts)

**Objetivo:** push a rama de producción → build imagen → **AWS ECR (público)** → **AWS CodeDeploy** → EC2 descarga y ejecuta. Hoy solo hay CI lint/test/build ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

### 6.1 Pasos

1. **ECR Public** (solo en `us-east-1`): `aws ecr-public create-repository --repository-name cityexpress-master --region us-east-1`. Login push: `aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws`. (Pull público es anónimo → simplifica la EC2.)
2. **Credenciales GitHub→AWS:** OIDC (rol asumible, ideal) o secrets `AWS_*` con permisos mínimos (`ecr-public` push + `codedeploy:CreateDeployment`).
3. **Workflow `.github/workflows/cd-backend.yml`** (trigger `push` a `main`, `needs` el job de calidad):
   - Login ECR Public → `docker buildx build --platform linux/amd64 -t public.ecr.aws/<alias>/cityexpress-master:${GIT_SHA} --push .`
   - Considera buildear también la imagen del `jobs-service` (master+worker) y subirla.
   - Disparar CodeDeploy.
4. **CodeDeploy (EC2):** instala el agente; crea Application `cityexpress-backend` + Deployment Group (por instance id `i-0bfbc93f5e6340508` o tag); `appspec.yml` + `deploy/pull_and_up.sh`:
   ```yaml
   version: 0.0
   os: linux
   files: [{ source: /, destination: /opt/cityexpress }]
   hooks:
     AfterInstall:
       - location: deploy/pull_and_up.sh
         timeout: 300
         runas: root
   ```
   `pull_and_up.sh`: setea `IMAGE_TAG` al SHA, `docker compose -f docker-compose.prod.yml --env-file .env pull && up -d`.
5. **Migraciones Prisma:** ya corren en el `CMD` del [Dockerfile](Dockerfile). Verifica que apliquen en el deploy.
6. **Actualiza `docker-compose.prod.yml`** a las imágenes de ECR Public (incluye `jobs-service` y Redis).

> 💡 **Plan B realista si CodeDeploy te come el tiempo:** workflow que tras `main` haga build+push a ECR y luego SSH a la EC2 (`appleboy/ssh-action`) con `docker compose pull && up -d`. Cumple "CI buildea → ECR → EC2 descarga/ejecuta", pero el enunciado nombra CodeDeploy explícitamente: **intenta CodeDeploy primero** y documenta la decisión (RDOC04).

🟢 **MVP demostrable:** push a `main` → imagen en ECR Public → EC2 con la imagen nueva (verifica SHA + `/healthz`).

---

## 7. RNF09 — CI/CD frontend (2 pts) — *en el repo del front*

Repo: `https://github.com/vruizz22/CityExpress-frontendG15.git`, rama prod `main`, build `pnpm build` → `dist/`. Hoy no hay workflow de deploy (solo CI). Automatiza el deploy manual de [docs/deploy.md §11](docs/deploy.md).

### 7.1 Pasos (en el repo front)

1. Secrets AWS (OIDC o keys) con `s3:PutObject/DeleteObject` al bucket + `cloudfront:CreateInvalidation`.
2. Env de build (confirmadas por el front):
   ```env
   VITE_API_BASE_URL=https://api.andresitowan.com
   VITE_AUTH0_DOMAIN=frontendg15cityexpress.us.auth0.com
   VITE_AUTH0_CLIENT_ID=sb1CnASsgLO1tOpYWHMgrqA8ADLOsnK6
   VITE_AUTH0_AUDIENCE=https://api.andresitowan.com
   ```
3. **Workflow `.github/workflows/cd-frontend.yml`** (trigger push a `main`):
   ```yaml
   - run: pnpm install --frozen-lockfile
   - run: pnpm build
   - run: aws s3 sync dist/ s3://cityexpress-frontend-andresitowan/ --delete
   - run: aws cloudfront create-invalidation --distribution-id EYMIU0TNOQ7F9 --paths '/*'
   ```
4. Verifica el SPA (CloudFront ya tiene `403/404 → /index.html`).

🟢 **MVP demostrable:** push al front → S3 sync → invalidación → cambio visible en `https://app.andresitowan.com`.

---

## 8. RDOC03 — Documentación serverless/SAM (2 pts)

`docs/serverless.md`, pasos reproducibles: prerrequisitos, estructura `jobs-service/` + `serverless.yml`, `serverless deploy` y outputs (ARN Lambda), cómo el worker BullMQ invoca la Lambda y cómo vuelve el resultado, cómo levantar master+Redis (`restart`, `/heartbeat`), capturas de deploy y de un job `completed`. Escríbelo **mientras** haces §3–§4.

## 9. RDOC04 — Documentación CI/CD (2 pts)

`docs/cicd.md`: por paso, qué hace cada pipeline. Backend (RNF08): trigger, lint/test/build, build imagen, push ECR Public, CodeDeploy (o SSH plan B), migraciones, verificación. Frontend (RNF09): build, `s3 sync`, invalidación. Secrets usados (sin valores), rama prod, rollback, diagrama `push → CI → ECR → CD → EC2`.

## 10. BONUS01 (opcional, 8 pts)

JWT access(<3h)+refresh(1d) HMAC o **ES256 (+3 pts)** para autenticar backend ↔ jobs-service. Solo si lo esencial está verde.

---

## 11. Cronograma sugerido

| # | Tarea | Depende de | Esfuerzo |
|---|---|---|---|
| 1 | Cerrar contratos §2 con mamorkus/Joaco, Victor, Andre (shape grafo + persistencia) | PR #21 | 30–60 min |
| 2 | **RNF06:** Lambda Serverless con `dijkstra.ts` + cambiar `worker.ts` a invoke + IAM | 1 | 3–4 h |
| 3 | **RNF01:** heartbeat proxy backend + persistir `CalculatedRoute` + debounce | 1, Andre | 2–3 h |
| 4 | Todo el ciclo en la nube (Redis+master+worker+Lambda) verificado | 2,3 | 1–2 h |
| 5 | **RNF05:** guard Auth0 + `User.role`/`/me` + ownership | front (listo) | 2–3 h |
| 6 | **RNF08:** ECR Public + CodeDeploy (o SSH) | — | 2–4 h |
| 7 | **RNF09:** workflow en repo front | acceso repo | 1 h |
| 8 | **RDOC03 + RDOC04** | en paralelo | 1–2 h |
| 9 | (Opcional) BONUS01 | 1–8 | 4–6 h |

Ruta crítica: 1 → 2 → 3 → 4 → 5 → 6.

---

## 12. Checklist de verificación (demo)

- [ ] `GET https://api.andresitowan.com/heartbeat` → `{jobsService:true}` (proxy al jobs-service).
- [ ] `cost-update` → orquestador `POST /job` → `GET /job/:id` `completed` con `byDistance` y `byPrice`.
- [ ] **Worker BullMQ invoca una Lambda** (Serverless) que corre el Dijkstra; resultado vuelve y se persiste.
- [ ] `serverless deploy` documentado; Lambda visible en AWS, invocable por el jobs-service.
- [ ] Master + Redis con `restart: unless-stopped`; sobreviven `docker kill`.
- [ ] Backend valida JWT Auth0; `req.user.sub` poblado; `/me` devuelve rol; admin vs user separados; user no ve envíos ajenos (403); sin token (401).
- [ ] Push a `main` (backend) → imagen en ECR Public → EC2 actualizada (verifica SHA).
- [ ] Push al front → S3 sync + invalidación CloudFront → cambio visible.
- [ ] `docs/serverless.md` y `docs/cicd.md` en `/docs`.
- [ ] Sin `.env` ni `.pem` commiteados.
- [ ] (Coordinación) bug #1 grafo/schema, gap #2 matriz completa, gap #3 persistencia — resueltos con el equipo.

---

## Anexo A — Estado de la consulta al front

✅ Respondida (resumen integrado en §1 y §5). En síntesis: access token Auth0, sin admin definido (lo defines en backend, §5.2), build `pnpm build`→`dist/`, bucket/distribution/VITE confirmados (§7), heartbeat vía `api.andresitowan.com/heartbeat` (§3.1).

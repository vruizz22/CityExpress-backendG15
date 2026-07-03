# Plan E3 — Victor: Mensajería (prioridad de cola, seguros, eventos SSE) + RDOC01

> IIC2173 2026-1 · E3 CityExpress · Entrega: **02/jul/2026** (hoy — cada hora cuenta, atraso Fibonacci F1=F2=6).
> Repos: `CityExpress-backendG15` (este) y `CityExpress-frontendG15` (sin cambios míos; Oriana consume lo que expongo).

---

## 0. Contexto: qué ya existe y qué me toca

El equipo ya mergeó a `develop` gran parte de la E3:

| Ya hecho (otros) | Dónde |
|---|---|
| Feed SSE (`EventsService` + `GET /events/stream`) — Andres | `src/events/` |
| Motor de suscripciones + trigger SFN — Andres/Guillermo | `src/subscriptions/` |
| Factores de precio prioridad 0.5/1/2.5 y prima seguro 5% **en el precio** | `src/payments/pricing.ts` (`priceWithSurcharges`, `PRIORITY_FACTORS`, `INSURANCE_PREMIUM_RATE`) |
| Modelos Prisma `Subscription`, `SubscriptionShipment`, `BudgetLedgerEntry`; `UserShipment.insured/priorityClass` | `prisma/schema.prisma` |
| Dedup anti-loop por `msgId` (TTL+tope) e idempotencia por `idpk` (P2002) | `routing-subscriber.service.ts`, `package-events.repository.ts` |

**Mi alcance (reparto del equipo):**
1. **RF03 (mensajería):** publicar `package-transit` usando el sistema de prioridades de RabbitMQ (`priority` 1/2/3 según `priorityClass`) al **crear** y al **redirigir**.
2. **RF02 (mensajería):** flag `insured` en `metaContent` conforme al enunciado; al no poder entregar un paquete asegurado → `package-status: expired` con `reason` a la ciudad de **origen** + gatillar **cobro del seguro**.
3. **Idempotencia y anti-loops** en los flujos nuevos.
4. **RF04 (parte):** inyectar al SSE de Andres los eventos de mensajería (recepción, redirección, cobro de seguro).
5. **RDOC01:** actualizar UML de componentes (`docs/arquitectura.drawio` + `docs/architecture.md`) con broker con prioridad, Step Functions, SSE y observabilidad.

### Gaps detectados en la exploración (por qué este plan)

- **G1 (bloqueante de interop):** `PackageBodySchema` tipa `metaContent` como `string` (`src/dto/package.dto.ts:11`). El enunciado E3 define `metaContent: { "insured": true }` como **objeto** → hoy **NACKearíamos** todo paquete asegurado que nos envíe otro grupo.
- **G2:** `AmqpMessageBrokerService.send` publica solo con `{persistent: true}` — no existe la propiedad AMQP `priority` (RF03 sin cumplir en el lado broker).
- **G3:** el flag `insured` viaja en `constraints` (`payments.service.ts:296`, `subscription-engine.service.ts:63`), no en `metaContent` como exige el enunciado.
- **G4:** no existe el mensaje `package-status`, ni schema, ni handler inbound, ni cobro de seguro.
- **G5:** la mensajería no publica nada al feed SSE (`package-received`/`package-redirected`/`insurance-charged` ya están declarados en `feed-event.types.ts` pero nadie los emite).

---

## 1. Diseño

### 1.1 RF03 — Prioridad RabbitMQ al crear/redirigir

**Decisión (NFR Performance/Integrabilidad):** la cola de nuestra ciudad la declara la central (no podemos re-declararla con `x-max-priority`; daría `PRECONDITION_FAILED`). Lo que sí controla el productor es la **propiedad `priority` del mensaje** — eso publicamos siempre; surte efecto en toda cola destino declarada como priority queue. Se documenta el supuesto en RDOC01.

Mapeo (enunciado): `low → 1`, `medium → 2`, `high → 3`.

Cambios:
- `src/payments/pricing.ts`: agregar `PRIORITY_LEVELS: Record<PriorityClass, number> = { low: 1, medium: 2, high: 3 }` y `getPriorityLevel(priorityClass: string): number` (default 2). Vive junto a `PRIORITY_FACTORS` para mantener una sola fuente de verdad de RF03.
- `src/messaging/message-broker.interface.ts`: `send<T>(routingKey, message, options?: SendOptions)` con `interface SendOptions { priority?: number }`.
- `src/messaging/amqp-message-broker.service.ts`: `send` pasa `priority` en `channel.publish(..., { persistent: true, ...(options?.priority !== undefined ? { priority: options.priority } : {}) })`. `PendingMessage` (buffer offline) guarda también `options` y `flushPendingMessages` las respeta.
- `src/messaging/noop-message-broker.service.ts`: aceptar el parámetro (loguearlo).
- Callers que crean/redirigen `package-transit`:
  - `src/routing/package.service.ts` → `sendPackage()` (cubre redirección normal y drenado de pendientes): `this.broker.send(cityRoutingKey(dest), message, { priority: getPriorityLevel(packageBody.priorityClass) })`.
  - `src/shipments/amqp-initial-shipment.service.ts` → `send()` (creación post-pago y ticks de suscripción — el engine delega aquí).
- ACKs, auditorías y tablas siguen sin priority (no son `package-transit`).

### 1.2 RF02 — `insured` en `metaContent` + `package-status` + cobro del seguro

**a) Interop de `metaContent` (fix G1/G3):**
- `src/dto/package.dto.ts`: `metaContent: z.union([z.string(), z.record(z.string(), z.unknown())]).nullable().optional()`.
- Nuevo helper `src/routing/insurance.util.ts` (puro, testeable):
  - `isInsured(pkg: PackageBody): boolean` — true si `metaContent` objeto con `insured === true`, o `metaContent` string JSON-parseable con `insured === true`, o `constraints.insured === true` (retro-compat con nuestros mensajes E3 ya emitidos).
  - `normalizeMetaContent(value)` — si es string JSON de objeto, devuelve el objeto (para no degradar el formato al reenviar pendientes desde BD).
- `src/packages/package-event.mapper.ts` (`buildPackageEventData`): si `metaContent` es objeto → `JSON.stringify` antes de persistir (columna `String?`; **sin migración**).
- `src/routing/package.service.ts` → `toPackageBody()`: aplicar `normalizeMetaContent` al reconstruir desde BD.
- **Formato saliente conforme enunciado** (nuestros paquetes asegurados deben salir con `metaContent.insured: true`):
  - `src/payments/payments.service.ts` → `triggerInitialShipment`: `metaContent: shipment.insured ? { insured: true, ...(shipment.metaContent ? { note: shipment.metaContent } : {}) } : shipment.metaContent`.
  - `src/subscriptions/subscription-engine.service.ts` → `dispatch`: ídem con `sub.insured`/`sub.metaContent`.
  - Se conserva `constraints.insured` (lo usan flujos internos ya mergeados; cero regresión).

**b) Mensaje `package-status` saliente (ciudad tenedora → ciudad origen):**
- `src/messaging/message.types.ts` + `message.schemas.ts`: nuevo tipo
  ```ts
  interface PackageStatusMessage extends BaseMessage {
    type: 'package-status';
    data: { pkgId: string; status: 'expired'; reason: string };
  }
  ```
  `PackageStatusMessageSchema` con Zod (laxo en campos extra, como el resto).
- En `src/routing/package.service.ts`, los **dos** sitios donde un paquete muere en nuestra ciudad (`processForwarding` con `maxHops <= 0` y `routePendingRecord` con `maxHops <= 0`) llaman, además de `auditService.reportExpired`, a un nuevo `InsuranceService.handleUndeliverable(pkg, reason)`.

**c) `InsuranceService` (nuevo, `src/routing/insurance.service.ts`):**
- `handleUndeliverable(pkg, reason)`:
  1. Si `!isInsured(pkg)` → return.
  2. Claim idempotente `pkg-status:<pkgId>` vía `PackageEventsRepository` (mismo patrón P2002 de `recordInitialSent`; agregar método genérico `claim(idpk, type, packageBody)`); si `duplicate` → return (reintentos del broker no duplican la notificación — **anti-loop**).
  3. Si `sameCity(pkg.originId, CITY_ID)` → somos origen: `chargeInsurance(pkg.id, reason)` directo (no nos mandamos mensajes a nosotros mismos — anti-loop).
  4. Si no → `broker.send(cityRoutingKey(pkg.originId), packageStatusMessage)` (con `createBaseMessage('package-status')`, que ya adjunta `cityId` en minúscula).
- `chargeInsurance(pkgId, reason)`:
  1. Claim idempotente `insurance:<pkgId>` (el cobro se ejecuta **una sola vez** aunque lleguen N `package-status` duplicados).
  2. `userShipment.updateMany({ where: { packageId }, data: { status: 'expired-insured' } })` y `subscriptionShipment.updateMany({ where: { packageId }, data: { status: 'expired-insured', reason } })` — la UI de Oriana ("qué pasó con los paquetes") lo refleja sin trabajo extra.
  3. `events.publish({ type: 'insurance-charged', packageId, message: reason })` → feed SSE (RF04).
- **Decisión — alcance del "cobro" (tradeoff documentado):** registro idempotente + cambio de estado + evento en vivo; **no** muto `Subscription.budgetSpent` ni creo `BudgetLedgerEntry` de refund, porque la semántica del ledger es de Andres y mutar el budget desde el consumer AMQP puede descuadrar su contabilidad de ticks. Si el grupo decide que el seguro reembolsa al budget, es un `ledger.create({delta: +pricePerShipment, reason: 'insurance-payout'})` dentro de `chargeInsurance` — un cambio de 5 líneas, coordinable con Andres post-entrega de esto.

**d) Handler inbound `package-status` (somos la ciudad origen):**
- `src/routing/routing-subscriber.service.ts`: nueva rama `type === 'package-status'` (antes del fallthrough):
  - Parse con `PackageStatusMessageSchema`; malformado + `cityId` presente → NACK al emisor (regla E1); sin `cityId` → log y descartar.
  - Válido → ACK al emisor (es una petición de otro servicio; **no** se ACKea un ACK — regla existente ya lo garantiza) y `insuranceService.chargeInsurance(data.pkgId, data.reason)`.
  - El dedup por `msgId` existente ya filtra reentregas; el claim `insurance:<pkgId>` cubre duplicados con `msgId` distinto.

### 1.3 RF04 (parte) — Inyección de eventos de mensajería al SSE

- `src/routing/routing.module.ts`: `imports: [RoutingCalcModule, EventsModule]` (EventsModule ya exporta `EventsService`, sin ciclos: no importa nada).
- `src/routing/package.service.ts`:
  - `package-received`: en `handlePackageTransit`, tras `recordInbound === 'created'` (todo paquete que entra a nuestra cola, con `cityId` del emisor y `packageId`).
  - `package-redirected`: en `processForwarding` y `routePendingRecord` tras `sendPackage` (con `data: { nextCityId }`).
- `insurance-charged`: lo emite `InsuranceService` (§1.2c).
- `package-created` ya lo emiten shipments/suscripciones (Andres). No lo toco.

### 1.4 Idempotencia y anti-loops (transversal)

Ya existente y reutilizado: dedup `msgId` TTL+tope (subscriber), `idpk` PK en `PackageEvent` (P2002), no-ACK-de-ACKs, `cityId` en minúscula. Nuevo en esta entrega: claims `pkg-status:<pkgId>` e `insurance:<pkgId>`; no auto-enviarnos `package-status`; `package-status` solo se emite para paquetes asegurados y **una vez** por paquete.

### 1.5 RDOC01 — UML de componentes

- `docs/arquitectura.drawio` (editar XML directamente, 423 líneas manejables):
  - Dentro de AWS Cloud: subsistema **«Motor de Suscripciones»**: `Step Functions (state machine)` → `SQS tick` → `Lambda tick` → (HTTP interno) `NestJS Master /subscriptions/tick`, con nota UML del contrato del trigger.
  - En NestJS Master: componente `EventsController (SSE)` con interfaz provista `IEventFeed` consumida por el Browser SPA (flecha punteada CloudFront→API GW→SSE).
  - En el broker: nota UML "priority queue: publish con priority 1/2/3 según priorityClass (RF03); supuesto: la cola destino define x-max-priority".
  - Flujo `package-status` (ciudad↔ciudad) y componente `InsuranceService`.
  - Observabilidad: `«service» New Relic` (APM + infra + alertas RNF01/RNF04 de Joaco) con dependencia punteada desde EC2/Master.
- `docs/architecture.md`: nueva sección `## 10. E3 — Suscripciones, prioridad, seguros y feed en vivo (RDOC01)` con: diagrama Mermaid de componentes actualizado, secuencia Mermaid del flujo seguro (expira asegurado → package-status → cobro → SSE), tabla de mensajes nuevos, decisiones+tradeoffs (los de §1.1 y §1.2c).
- Re-exportar `docs/arquitectura.svg` desde draw.io (manual, lo hago yo desde la app; si no, queda anotado en el PR).

---

## 2. Orden de ejecución y PRs (gitflow del repo: feature → PR a `develop`)

Dado que la entrega vence **hoy**, 3 PRs pequeños en serie (patrón del repo), cada uno con lint+tests verdes:

1. **PR A — `feat/e3-priority-publish`** (RF03 mensajería): §1.1 completo + specs. ~1 h.
   `feat(messaging): publish package-transit with RabbitMQ priority per priorityClass`
2. **PR B — `feat/e3-insurance-messaging`** (RF02 + idempotencia + feed): §1.2 + §1.3 + specs. ~2.5 h.
   `feat(routing): insured package-status notification, idempotent insurance charge and SSE feed events`
3. **PR C — `docs/e3-rdoc01-uml`** (RDOC01 + metodología): §1.5 + AI-log. ~1 h.
   `docs(architecture): E3 component UML — subscriptions engine, priority broker, SSE, observability`

Metodología (obligatoria): AI-log de esta sesión en `docs/prompts/2026-07-02-e3-mensajeria-rf02-rf03-rdoc01.md` (prompt→output→decisión+tradeoffs); marcar en `docs/milestones.md` el hito E3-mensajería; PRs con descripción completa + cómo se verificó + link al ai-log; 2 reviewers (Andres/Guillermo).

## 3. Tests y verificación

- **Unit (Jest, coverage ≥75% se mantiene):**
  - `amqp-message-broker.service.spec.ts`: `publish` recibe `priority`; buffer offline conserva options.
  - `insurance.util` (nuevo spec): matriz `isInsured` (objeto/string-JSON/constraints/no asegurado) y `normalizeMetaContent`.
  - `insurance.service.spec.ts` (nuevo): asegurado+origen remoto → send a `city.<origin>` una sola vez (claim duplicate no re-envía); asegurado+origen local → cobra directo; no asegurado → no-op; `chargeInsurance` idempotente y publica `insurance-charged`.
  - `package.service.spec.ts`: expiración de asegurado invoca `handleUndeliverable`; feed `package-received`/`package-redirected` emitidos; `metaContent` objeto aceptado por el schema (regresión G1).
  - `routing-subscriber.service.spec.ts`: rama `package-status` → ACK + charge; malformado → NACK.
- **E2E local:** `docker-compose.test.yml` + publicar en la cola propia un `package-transit` asegurado con `maxHops: 0` y destino ≠ nuestra ciudad → verificar: mensaje `package-status` publicado a `city.<origin>`, fila `insurance:<pkgId>` en `PackageEvent`, evento en `GET /events/recent`, y `curl -N .../events/stream` mostrando el feed.
- `pnpm lint && pnpm test` antes de cada PR (RNF05 de Andres bloquea CD si fallan).

## 4. Riesgos

| Riesgo | Mitigación |
|---|---|
| Atraso Fibonacci corriendo (vence hoy) | PRs A y B primero (puntos RF); RDOC01 en paralelo mientras revisan |
| Cola central sin `x-max-priority` → priority sin efecto observable | Cumplimos el lado productor exigido; supuesto documentado en RDOC01 y demo con cola local priorizada |
| Toco archivos de Andres (`payments.service.ts`, `subscription-engine.service.ts`) | Cambios mínimos (solo `metaContent`), avisar en el PR y pedirle review |
| Otros grupos envían `package-status` con formas raras | Schema laxo + NACK/log; nunca throw que re-encole infinito |
| Loop de cobros por `package-status` duplicados | Claim `insurance:<pkgId>` + dedup `msgId` + no ACK de ACKs |

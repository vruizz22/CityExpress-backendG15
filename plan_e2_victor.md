# Plan E2 — Victor

> **Rol / Alcance:** Broker, coordinación entre ciudades y envío inicial de paquetes post-pago.
> **Requisitos asignados:** **RF06** (responder/solicitar tablas + ACK + anti-loop, 2 pts), **RF04** (parte importante — construir `package-transit` post-pago y enviarlo al siguiente salto, 3 pts), **RF07** (parte — ruteo por criterio), **RNF03** (tolerancia a fallos en ruteo distribuido, 3 pts), **RNF07** (parte — idempotencia del envío inicial + persistencia), **RDOC01** (parte — UML broker/colas/ACK/`distance-table`/`cost-update`/envío inicial).
> **Branch sugerida:** `feature/e2-broker-coordination` desde `develop`.

---

## ✅ Estado de implementación (2026-06-08)

**Implementado, typecheck + lint + tests verdes** (20 tests nuevos en mis suites, 31 en specs relacionados, sin regresiones):

- **RF06** — `request`/`cost-update`/`ack` enrutados en `routing-subscriber.service.ts`; `distance-table.service.ts` con `requestTablesFromAllCities()` (fanout), `respondWithOwnTable()` (ACK + cost-update), `applyOwnTable()` vs `applyPeerTable()` (guarda en `ReceivedTable`), `sendAck()`. Anti-loop: distinción propia/peer + dedup por `msgId` + throttle de fanout.
- **Integración workers (Joaco)** — `routing-orchestrator.service.ts buildFullGraph()` arma la matriz completa (`Record<city, RouteEdge[]>`) desde `getAllTables()` + snapshot propio.
- **RF04 + RNF07** — `shipments/amqp-initial-shipment.service.ts` real (reemplaza el stub): siguiente salto por criterio, `package-transit` compatible E1, idempotencia vía `recordInitialSent` (idpk `initial:<id>`, P2002).
- **RNF03** — malformados ignorados (safeParse), ciudad sin responder = sin arista (costo infinito), sin ruta ⇒ `pending-routing`/throw.
- **RDOC01** — `docs/architecture.md §9` con secuencias broker/ACK/distance-table y envío inicial.
- **Front** — no requiere cambios: `statusLabels.js` ya mapea `sent → "Enviado al siguiente salto"` y `pending-routing`.

> ⚠️ **Para correr en este entorno**: faltan deps en `node_modules` (env desactualizado). El usuario debe correr (ver final del doc): `pnpm install` y `pnpm prisma generate`. El Prisma client ya lo regeneré para validar tests.

**Coordinar con el equipo (no bloqueante):** orden del claim de idempotencia con Andre (hoy doble capa: claim de pago + marcador `initial:<id>`); confirmar con Joaco que su Dijkstra excluye `enabled:false`.

---

## 0. TL;DR — qué está hecho y qué falta (verificado en `develop`, 2026-06-08)

| Área | Estado actual | Mi gap real |
|---|---|---|
| Recepción `package-transit` + ACK/NACK + forwarding por criterio + idempotencia inbound | ✅ Hecho (`package.service.ts`, `package-events.repository.ts`) | Nada estructural; solo robustez |
| Recibir tabla desde central | ⚠️ Parcial: `requestInitialTable()` pide **solo a central**; el subscriber **sobrescribe** las distancias propias con cualquier `cost-update` | 🔴 **RF06: fanout a todas las ciudades, distinguir tabla propia vs peer, guardar tablas peer** |
| Responder `request` de `distance-table` de otras ciudades | ❌ **No existe handler** | 🔴 **RF06** |
| ACK de `distance-table`/`cost-update` | ❌ Solo hay ACK para `package-transit` | 🔴 **RF06** |
| Guardar matriz de todas las ciudades | ❌ `received-table.repository.upsertTable()` **nunca se llama** | 🔴 **RF06** (desbloquea RF02 y a Joaco) |
| Envío inicial post-pago (RF04) | 🔴 **STUB** (`StubInitialShipmentService` solo loggea) | 🔴 **RF04: implementación real + idempotencia (RNF07)** |
| Alimentar grafo completo al jobs-service de Joaco | ⚠️ El orquestador manda `graph[CITY_ID]` (1 salto) | 🔴 **Construir el grafo desde la matriz completa** (el "mapa json" que pidió Joaco) |

**Insight clave:** mi RF06 (poblar `ReceivedTable` con las tablas de TODAS las ciudades) es el cuello de botella que desbloquea **3 cosas a la vez**: (1) cotizaciones multi-salto correctas de Andre/Joaco (`route-computation.service.buildTables()` ya lee `getAllTables()` pero hoy llega vacío), (2) el grafo completo que necesitan los workers de Joaco (`jobs-service/mocks/mock_routes_payload.json` = `Record<city, RouteEdge[]>`), y (3) el `getNextHop` real para forwarding y envío inicial.

---

## 1. Contexto del broker (lo que ya existe)

- **RabbitMQ** vía `amqplib` (`amqp-message-broker.service.ts`): exchange `fulfillment.x`, una cola por ciudad, `routingKey = city.<code>` (`cityRoutingKey`). Ya trae reconexión con backoff Fibonacci, `prefetch(10)`, cola de mensajes pendientes mientras no hay canal, NACK sin requeue para JSON malformado, NACK con requeue ante error del handler. **No tocar el core**; solo construir sobre él.
- **Subscriber** (`routing-subscriber.service.ts`) enruta por `type`: hoy maneja `distance-table`/`cost-update` (→ `updateFromMessage` + `processPendingRoutes`) y `package-transit`. **No** maneja `request` ni `ack`/`nack` de tablas.
- **Identidad:** `CITY_ID` (env), `CENTRAL_ID='central'`, `CITY_CODES` (17 ciudades) en `config/city.config.ts`.
- **Idempotencia inbound ya resuelta** con patrón `idpk` PK + catch `P2002` (`package-events.repository.ts`). **Reusar este patrón** para el envío inicial y el dedup de tablas.

---

## 2. Contratos / coordinación con el equipo

| Con | Qué cerrar | Estado |
|---|---|---|
| **Joaco** | El orquestador pasará a mandar el **grafo completo** (`Record<city, RouteEdge[]>` desde `getAllTables()`), no 1 salto. Shape ya calza con su mock y su `dijkstra.ts`. | 🔧 lo implemento yo, avisar |
| **Andre** | Orden de la idempotencia del envío inicial: hoy `payments.service.triggerInitialShipment()` ya hace claim `paid→sent`. Acordar si el marcador de "ya enviado" lo pone mi `InitialShipmentService` (tabla/evento propio) o si reusamos su claim de estado. **Propuesta:** claim atómico `paid→sending` ANTES de publicar (idempotente ante callbacks duplicados). | ⚠️ por cerrar |
| **Oriana** | El estado `sent` / `pending-routing` ya viaja en la vista de envíos (`shipments.service.toView`). Solo confirmar que el front lo muestra como "enviado al siguiente salto". | ✅ casi |
| **Guillermo** | Sin cambios; broker queda igual, solo agrego flujos. | ✅ |

> **Cómo distinguir tabla propia vs peer (regla anti-loop central):** un `cost-update`/`distance-table` con `cityId === CITY_ID` (o sin `cityId`, viene de central) = **mi tabla** → actualizo distancias propias + **fanout** a las demás + recompute. Un `cost-update` con `cityId !== CITY_ID` = **tabla de un peer** (respuesta a mi request) → `upsertTable(cityId, distances)` + ACK al peer + recompute, **SIN fanout**. Esto rompe el ciclo request→respuesta→request.

---

## 3. RF06 — Coordinación de tablas entre ciudades (2 pts) — *núcleo de mi entrega*

### 3.1 Tipos y schemas
- `messaging/message.types.ts`: agregar `source: string` a `DistanceTableRequestMessage`.
- `messaging/message.schemas.ts`: nuevo `DistanceTableRequestSchema` (`type: literal('request')`, `source: string`, `data: { ask: literal('distance-table') }`). Reusar `MessageEnvelopeSchema` para discriminar en el subscriber.

### 3.2 `distance-table.service.ts`
- `requestInitialTable()`: agregar `source: CITY_ID` al request a central (consistencia).
- **Nuevo** `requestTablesFromAllCities()`: para cada `code` en `CITY_CODES` (excluir el propio y central), enviar `{ type:'request', source: CITY_ID, data:{ ask:'distance-table' } }` a `city.<code>`.
- **Nuevo** `respondWithOwnTable(requesterCityId)`: enviar **ACK** a `city.<requester>`, luego `cost-update` con `cityId: CITY_ID` y `data.distances = getSnapshot()` a `city.<requester>`.
- **Nuevo** `applyOwnTable(distances)` (= lo que hoy hace `updateDistances`) vs **nuevo** `applyPeerTable(cityId, distances)` (→ `receivedTables.upsertTable` + recompute). Inyectar `ReceivedTableRepository` (exportar `RoutingCalcModule` ya lo expone; importar en `RoutingModule`).
- Al aplicar **mi** tabla: además de set local, llamar `requestTablesFromAllCities()` (fanout) — **solo aquí**.

### 3.3 `routing-subscriber.service.ts` (enrutamiento por type)
```
if type === 'request' && data.ask === 'distance-table' → distanceTable.respondWithOwnTable(source)
if type ∈ {distance-table, cost-update}:
    if cityId === CITY_ID || sin cityId (central) → distanceTable.applyOwnTable(distances); requestTablesFromAllCities(); recompute
    else (peer)                                   → distanceTable.applyPeerTable(cityId, distances); sendAck(cityId); recompute
if type ∈ {ack, nack} → log (+ marcar request resuelto para timeout, §5)
if type === 'package-transit' → packageService.handlePackageTransit(...)  // ya existe
```
- `sendAck` para tablas: reusar el helper de `package.service` o extraer uno común en `distance-table.service`.

### 3.4 Anti-loop (requisito explícito "evitando ciclos infinitos")
1. **Nunca** hacer fanout sobre tabla peer (solo sobre la propia/central). ← lo más importante.
2. No enviar `request` a sí mismo ni a central en el fanout.
3. ACK/NACK son terminales: jamás disparan un envío.
4. **Dedup por `msgId`**: Set en memoria con TTL corto (o `idpk` PK + P2002) para descartar `cost-update`/`request` reprocesados (cubre RNF07 "mensajes duplicados").
5. Debounce del recompute ya existe (`scheduleRouteRecomputation`, 3s).

🟢 **MVP demostrable:** otra ciudad manda `{type:request, ask:distance-table}` → respondo ACK + `cost-update`; al llegar mi tabla de central, disparo requests a las 16 ciudades, recibo sus `cost-update`, las guardo en `ReceivedTable` y mando ACK; `getAllTables()` deja de estar vacío; sin loops (verificar logs/Flower).

---

## 4. RF04 + RNF07 — Envío inicial post-pago real (3 pts + idempotencia)

Reemplazar `StubInitialShipmentService`.

### 4.1 Nuevo `shipments/amqp-initial-shipment.service.ts implements InitialShipmentService`
Inyecta `MESSAGE_BROKER`, `DistanceTableService`, `PrismaService` (idempotencia), `AuditService` (opcional).
```
async send(packageBody):
  criteria = constraints.criteria === 'price' ? 'price' : 'distance'
  nextHop = distanceTable.getNextHop(packageBody.destinationId, criteria)
  if (!nextHop) throw  // el caller (payments) ya cae a 'pending-routing'
  // IDEMPOTENCIA: marcar "initial-sent" de forma atómica antes de publicar.
  claim = recordInitialSent(packageBody.id)  // PackageEvent idpk=`initial:${id}` o claim status; P2002 → ya enviado → return
  if (claim === 'duplicate') return
  msg = createBaseMessage('package-transit') + { type:'package-transit', cityId: CITY_ID, packageBody }
  broker.send(cityRoutingKey(nextHop), msg)   // package-transit COMPATIBLE E1 (mismo shape que forwarding)
```
- **maxHops:** enviar con el `maxHops` del usuario **sin decrementar** (la ciudad receptora decrementa al reenviar, igual que en `package.service.processForwarding`). Consistencia verificada.
- **`package-transit` compatible E1:** mismo builder/shape que `package.service.sendPackage` (incluir `cityId` para que el receptor pueda ACKear).

### 4.2 Idempotencia (RNF07) — defensa en capas
- **Capa pago (ya existe):** `payments.service` hace claim optimista del status del pago; el segundo callback SUCCESS no vuelve a llamar `triggerInitialShipment`. Bien.
- **Capa envío (mi parte):** marcador único keyed por `packageId`. Opción sin tocar schema: escribir `PackageEvent` con `idpk = initial:${packageId}` (reusa P2002). Opción más limpia (coordinar con Andre): claim `UserShipment.status paid→sending` con `updateMany` ANTES de publicar; si `count===0` → ya enviado → skip. **Recomendado el claim de status** (atómico en BD, sin filas sintéticas).
- Resultado: ante callbacks Webpay duplicados o reintentos/reboot, **el paquete se publica exactamente una vez**.

### 4.3 Wiring
- `shipments.module.ts`: cambiar `useClass: StubInitialShipmentService` → `AmqpInitialShipmentService`; importar `RoutingModule` (provee `MESSAGE_BROKER` + `DistanceTableService`). **Verificar que no haya ciclo** `ShipmentsModule → RoutingModule` (RoutingModule no importa ShipmentsModule; PaymentsModule importa ShipmentsModule → OK).

🟢 **MVP demostrable:** pago SUCCESS → se publica un `package-transit` al `nextHop` correcto según criterio; el envío queda `sent`; reenviar el callback no genera segundo paquete; sin ruta → `pending-routing`.

---

## 5. RNF03 — Tolerancia a fallos en ruteo distribuido (3 pts)

- **Ciudad no responde:** tras el fanout, las que no contesten simplemente no estarán en `ReceivedTable` → en el grafo sus aristas son inexistentes = costo infinito (enunciado: "precios infinitos"). El debounce del recompute actúa como ventana de timeout suave. *Opcional:* tracker `Map<requestMsgId, {city, ts}>` resuelto por ACK/cost-update + log de las que expiran.
- **Respuesta malformada:** `safeParse` ya descarta con warn antes de `upsertTable`. Mantener.
- **Timeout/job fallido:** `routing-orchestrator.pollJobResult` ya limita reintentos y propaga `failed`. Verificar que un job fallido no deje el backend colgado (no lanza; loggea).
- **Sin ruta:** `getNextHop===null` → paquete a `pending-routing` (forwarding y envío inicial). Ya cubierto; agregar test.
- **Reconexión broker:** ya hay backoff; `onConnect` re-dispara `requestInitialTable()`. Asegurar que también re-haga fanout si corresponde.

---

## 6. Integración con los workers de Joaco (alimentar el grafo completo)

- `routing-orchestrator.service.triggerRouteRecomputation()`: construir `graph` desde `receivedTables.getAllTables()` (todas las ciudades) **+** snapshot propio, en formato `Record<city, RouteEdge[]>` (ya coincide con `jobs-service/mocks/mock_routes_payload.json` y con `dijkstra.Graph`). Hoy solo arma `graph[CITY_ID]`. Este es el "mapa json" que Joaco pidió por WhatsApp.
- Caminos `enabled:false` → tratarlos como costo infinito (omitir arista o marcar). Confirmar con Joaco que su `dijkstra.ts` los excluye (el `RouteEdge.enabled` ya viaja).

---

## 7. RDOC01 — Documentación UML (parte mía)

Actualizar `docs/architecture.md` + `docs/arquitectura.drawio` con:
- Broker: exchange `fulfillment.x`, colas `city.<code>`, routing keys.
- **Mermaid `sequenceDiagram`** del intercambio `distance-table`: A→B `request(ask:distance-table)`, B→A `ack`, B→A `cost-update`, A→B `ack`; y del fanout al recibir tabla de central.
- **Mermaid `sequenceDiagram`** del envío inicial post-pago: Webpay SUCCESS → claim idempotente → `getNextHop` → `package-transit` al siguiente salto.
- Nota UML de la regla anti-loop (tabla propia vs peer) y de la idempotencia (idpk/P2002, claim de status).

---

## 8. Tests (coverage ≥75%)

- `distance-table.service.spec`: `respondWithOwnTable` (manda ack+cost-update), `requestTablesFromAllCities` (16 requests, excluye self/central), `applyPeerTable` (upsert + no fanout), `applyOwnTable` (fanout + recompute).
- `routing-subscriber.service.spec`: ruteo por type (request / own cost-update / peer cost-update / ack / package-transit), dedup por msgId.
- `amqp-initial-shipment.service.spec`: nextHop por criterio, build `package-transit` E1, idempotencia (segundo `send` no publica), `nextHop===null` → throw.
- RNF03: ciudad sin responder → grafo sin su arista; malformado → ignorado.

---

## 9. Orden de trabajo sugerido

1. **RF06 tipos+schemas+service+subscriber** (3.1–3.3) → desbloquea matriz, RF02 y workers. *(núcleo)*
2. **Anti-loop + dedup** (3.4).
3. **Alimentar grafo completo al orquestador** (§6) → cerrar con Joaco.
4. **RF04 InitialShipmentService real + idempotencia** (§4) → cerrar orden de claim con Andre.
5. **RNF03 robustez** (§5).
6. **Tests** (§8) en paralelo a cada bloque.
7. **RDOC01** (§7) mientras implemento.

Ruta crítica: 1 → 3 → 4. (1 y 4 son los puntos esenciales; 3 destraba a Joaco.)

---

## 10. Checklist demo

- [ ] Otra ciudad pide `distance-table` → respondo ACK + `cost-update`.
- [ ] Llega tabla de central → fanout a las 16 → recibo `cost-update` → `ReceivedTable` poblada + ACKs enviados.
- [ ] Sin loops infinitos (logs/Flower estables; peer table no re-dispara fanout).
- [ ] Orquestador manda **grafo completo** al jobs-service; `getNextHop` multi-salto correcto por criterio.
- [ ] Pago SUCCESS → un único `package-transit` al siguiente salto; estado `sent`; callback duplicado no re-envía; sin ruta → `pending-routing`.
- [ ] RNF03: ciudad caída = costo infinito; mensaje malformado ignorado.
- [ ] `docs/architecture.md` + `.drawio` con secuencias broker/ACK/envío inicial.
- [ ] Sin `.env` ni `.pem` commiteados; coverage ≥75% en lo tocado.

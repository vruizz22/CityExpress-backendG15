# Session: 2026-06-09 — Fix: GET /routes devuelve todas las ciudades como `enabled: false`

**Agente:** Claude Code CLI
**Owner:** Victor (vruizz22)
**Branch:** fix/distance-table-schema-tolerant → develop

## Prompt (resumen)

Tras arreglar el array vacío de `/routes`, ahora el endpoint sí devuelve las
rutas pero **todas aparecen deshabilitadas**. Sospecha de un problema con el
broker: el GET /routes responde 200 pero la tabla de distancias nunca se
puebla. Solucionarlo desde una branch fix → develop → main con PRs.

## Diagnóstico

`getRoutes()` arma la respuesta desde `CITY_CATALOG` y completa cada ciudad con
`snapshot[code]?.enabled ?? false`. Que **todas** salgan `enabled:false` (e
incluso la ciudad propia) implica que el snapshot está **vacío**: la tabla de
distancias nunca se aplicó.

Causa raíz: la respuesta de la central (`distance-table` / `cost-update`) llega
**sin `idpk`/`msgId`** y con un `timestamp` que no siempre es ISO 8601 estricto
(ver `docs/requirements.md` §6.2). El `MessageEnvelopeSchema` exigía
`idpk`/`msgId` y `BaseMessageSchema` exigía `z.string().datetime()`, así que el
`safeParse` del subscriber fallaba ("Envelope parse failed") y el mensaje se
descartaba antes de aplicar la tabla. Los tests pasaban porque sintetizaban
esos campos que el broker real no envía.

## Cambios

- `src/messaging/message.schemas.ts`
  - `MessageEnvelopeSchema`: `idpk`/`msgId` opcionales (gate de entrada).
  - `BaseMessageSchema`: re-exige `idpk`/`msgId` (package-transit/payment/ack) y
    relaja `timestamp` a string no vacío (ya no fuerza ISO estricto).
  - `DistanceTableMessageSchema`: `idpk`/`msgId` opcionales (la central los omite).
- `src/routing/routing-subscriber.service.ts`: el dedup tolera `msgId` ausente;
  el ACK a un peer cae a `''` si falta `idpk`/`msgId`.
- `src/routing/package.service.ts`: NACK con fallback `''` para `idpk`/`msgId`.
- Tests de regresión: `message.schemas.spec.ts` y un caso en
  `routing-subscriber.service.spec.ts` con la forma real del broker (sin
  idpk/msgId).

## Segundo hallazgo (con logs de EC2): casing de routing keys

Los compañeros confirmaron en el EC2:

```
[AmqpMessageBrokerService] Connected. Queue=city.tk3.q Exchange=fulfillment.x
```

El broker bindea las colas en **minúscula** (`city.tk3.q` → routing key
`city.tk3`) y las routing keys de topic son **case-sensitive**. Pero la app
emitía `cityRoutingKey(cityId)` = `city.${cityId}` con `CITY_ID="TK3"`
(mayúscula) y `source: CITY_ID` también en mayúscula. Resultado:

- Pedimos la tabla a `city.central` (ok), pero con `source:"TK3"`. La central
  responde a `city.TK3`, que **no** calza con el binding `city.tk3` → la
  respuesta se pierde → el snapshot nunca se llena.
- Aunque llegara, si la central marca la tabla con `cityId` en otra caja
  (p. ej. `tk3`), el subscriber la trataba como tabla *peer* (`!== CITY_ID`) y
  la guardaba en `ReceivedTable` en vez de aplicarla a `distances`.

Por extensión, **todo** el ruteo entre ciudades (forwarding de paquetes, ACKs,
fanout de tablas) estaba roto por el mismo casing.

Fix:
- `config/city.config.ts`: `cityRoutingKey` ahora emite en minúscula; nuevo
  helper `sameCity(a,b)` (comparación insensible a mayúsculas).
- `distance-table.service.ts`: `source` en minúscula; guard `respondWithOwnTable`
  usa `sameCity`; logs de diagnóstico (request inicial + N entradas aplicadas).
- `routing-subscriber.service.ts`: detección de tabla propia con `sameCity`.
- `package.service.ts`: decisión entrega-vs-forward con `sameCity` (los
  `destinationId` del broker llegan en minúscula, ver `docs/listen-xxx.ts`).
- Tests actualizados a routing keys en minúscula + casos nuevos de casing.

## Cómo se verificó

- `tsc --noEmit`: sin errores nuevos (los de `jobs-service`/`bullmq` son
  preexistentes y ajenos al cambio).
- `jest` completo: 107/107 (incluye los 3 tests de regresión nuevos).
- `eslint` sobre los archivos tocados: limpio.

## Trazabilidad

- Cierra: RF02 (vista de conectividad sincronizada con `distance-table`), RF06.

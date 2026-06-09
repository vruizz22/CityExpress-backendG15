# Session: 2026-06-09 — Fix: la central no entrega la tabla a `city.tk3.q`

**Branch:** fix/central-response-routing-citycase → develop

## Síntoma

Con el casing (PR #40) y el formato real `body.routes` (PR #41) ya desplegados,
`GET /routes` seguía mostrando las 17 ciudades como `enabled:false`. Logs del
EC2:

```
LOG [DistanceTableService] Solicitando tabla inicial a la central (routingKey=city.central, source=tk3).
(repetido, en pares, cada ~2 min)
```

No aparece ningún `Incoming raw`, `cost-update`, `distance-table`, `Envelope
parse` ni `Tabla de distancias actualizada`: **no llega NADA** a la cola. Además
"pide a cada rato" y el EC2 se quedó sin RAM.

## Diagnóstico

El request sale bien (`source=tk3` en minúscula). Pero `createBaseMessage`
seguía estampando `cityId: "TK3"` en **mayúscula**. La central piensa en códigos
en mayúscula (su body trae `cityCode:"TK3"`); si rutea su respuesta usando el
`cityId` que le mandamos, publica a `city.TK3`, que **no** calza con el binding
`city.tk3` de nuestra cola → la tabla se pierde.

El doble request (pares) viene de que cada reconexión dispara `onConnect →
requestInitialTable`, sin throttle → spam que suma a la presión de RAM.

## Cambios

- `messaging/message.factory.ts` — `cityId` se emite en minúscula
  (`CITY_ID.toLowerCase()`). Las comparaciones internas ya usan `sameCity`
  (case-insensitive), así que no se rompe la detección de tabla propia.
- `routing/distance-table.service.ts` — el `cost-update` a peers también usa
  `cityId` en minúscula; nuevo throttle del request inicial
  (`TABLE_REQUEST_THROTTLE_MS`, default 15s) para no inundar la central en
  reconexiones.
- Tests: `cityId` lowercase en factory y cost-update; throttle del request.

## Importante (fuera del backend)

Si tras desplegar esto **sigue** sin llegar nada (ni `Tabla de distancias
actualizada` ni `Incoming raw`), el problema es del lado de la central / infra,
no del backend:
- la central podría identificar la ciudad por credenciales AMQP y simplemente no
  estar respondiendo, o
- el EC2 sin RAM está tirando la conexión (reconexión cada ~2 min) → subir la
  instancia / agregar swap.

## Verificación

- `tsc` limpio, `eslint` limpio, `jest` **112/112**.

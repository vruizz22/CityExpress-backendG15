# Session: 2026-06-09 — Fix: tormenta de requests + logging que satura el EC2

**Branch:** fix/broker-storm-throttle-logging → develop

## Síntoma

Tras los fixes de casing/cityId/body, los mensajes **ya llegan** (`Tabla de
distancias actualizada` = 9 en logs) y las rutas aparecen habilitadas... pero
de forma **intermitente**: "me funcionó por un momento, pero ya no, me sale
todas no disponible". El EC2 se "pega" y hay que reiniciarlo.

## Diagnóstico (logs del master, 03:00)

1. Otras ciudades (p. ej. `KLD`) mandan `request` de tabla **decenas por
   segundo**. Por cada request entrante respondíamos ACK + **nuestra tabla
   completa** (cost-update grande), amplificando la tormenta del broker
   compartido → CPU/RAM/disco al límite → OOM → al reiniciar, `distances` en
   memoria queda vacío → /routes "todo deshabilitado" hasta que la central
   reenvía. De ahí lo intermitente.
2. Logueábamos el payload COMPLETO (`JSON.stringify(message)`) en DEBUG por
   CADA mensaje; las tablas son enormes → I/O y memoria que agravan el OOM.

## Cambios

- `routing/distance-table.service.ts` — `respondWithOwnTable` ahora aplica un
  **throttle por requester** (`TABLE_RESPOND_THROTTLE_MS`, default 5s): si una
  ciudad spammea, le respondemos como mucho una vez por ventana. Ciudades
  distintas no se afectan entre sí.
- `routing/routing-subscriber.service.ts` — el log por defecto es un **resumen
  compacto** (`type/city/msg`); el payload completo solo si
  `LOG_RAW_MESSAGES=true`.
- Tests: throttle de respuesta (misma ciudad / ciudades distintas).

## Nota de coordinación / infra

- El spam de `request` viene de otras ciudades (su fanout sin throttle). No lo
  controlamos; este PR evita que **nosotros** lo amplifiquemos.
- El EC2 necesita más RAM o swap: bajo la tormenta del broker compartido se
  queda sin memoria. Considerar subir la instancia.

## Verificación

- `tsc` limpio, `eslint` limpio, `jest` **114/114**.

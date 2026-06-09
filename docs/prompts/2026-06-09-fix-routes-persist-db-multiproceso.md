# Session: 2026-06-09 — Fix: /routes intermitente por snapshot en memoria (multiproceso)

**Branch:** fix/routes-persist-db → develop

## Síntoma

La tabla ya llega y se parsea perfecto (`Tabla de distancias actualizada: 17
entradas (16 habilitadas)`), pero `/routes` funciona **a veces sí, a veces no**
(todas deshabilitadas). 502 ocasionales por reinicios.

## Diagnóstico (de Andrés, confirmado en logs)

Los logs muestran **varios PIDs vivos a la vez** (`[Nest] 78/79/80`): el master
corre como **múltiples procesos Node** en el contenedor. Cada proceso tiene su
**propia copia en memoria** del snapshot de distancias, y el broker entrega cada
mensaje a **un solo** consumidor (round-robin). Entonces:

- solo el proceso que consumió el cost-update tiene la tabla;
- las requests a `/routes` se reparten entre procesos → a veces pegas a uno con
  tabla (ves ciudades) y a veces a uno sin tabla (todo deshabilitado);
- además el snapshot se pierde en cada reinicio/OOM.

El snapshot vivía **solo en memoria**, nunca en la BD.

## Fix

Persistir la tabla propia en la BD (modelo `Route`, que ya existía y estaba sin
usar) y servir `/routes` desde la BD:

- `routing/route.repository.ts` *(nuevo)* — `saveSnapshot()` (upsert por código,
  en transacción) y `findAll()` (BigInt→number). Registrado/exportado en
  `RoutingModule`.
- `routing/distance-table.service.ts` — al aplicar la tabla (`updateDistances`)
  persiste en BD (fire-and-forget con log de error).
- `routes/routes.service.ts` — `getRoutes()` ahora es async y lee de la BD
  (mezcla con `CITY_CATALOG` para mostrar siempre las 17 ciudades).
- `routes/routes.controller.ts` — `await` del servicio async.

Resultado: cualquier proceso que consuma la tabla la escribe en la BD; todos los
procesos (y los reinicios) leen lo mismo → `/routes` consistente.

## Nota

Esto resuelve la **lectura** (RF02). El ruteo de paquetes (forwarding) sigue
usando el snapshot en memoria por proceso; si se quiere robustez total ahí,
habría que correr el master como **un solo proceso** o compartir estado. Lo dejo
anotado para coordinar (la causa de los múltiples PIDs hay que ubicarla en cómo
se levanta el contenedor: cluster / réplicas).

## Verificación

- `tsc` limpio, `eslint` limpio, `jest` **119/119** (nuevos: RouteRepository,
  RoutesService).

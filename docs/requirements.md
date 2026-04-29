# CityExpress — Requirements (E0 + E1)

> Tabla maestra de RFs/RNFs/RDOCs. Toda PR debe referenciar el ID de requisito que cierra.

---

## 1. Resumen de puntaje

| Entrega | RF | RNF | Compose | Variable | RDOC | Total |
|---|---|---|---|---|---|---|
| E0 (individual) | 10 | 20 | 15 | 15 | – | 60 (+ variable) |
| **E1 (grupal)** | **20** | **34** | – | – | **6** | **60** |

---

## 2. E0 — Estado

### 2.1 Funcionales (10 ptos)

| ID | Pts | Esencial | Descripción | Estado | Notas |
|---|---|---|---|---|---|
| RF1 | 3 | sí | `GET /packages` con todos los campos del paquete (aplanados) | ✅ | `packages.service.ts:50-87` |
| RF2 | 1 | sí | `GET /packages/:id` detalle del paquete | ⚠ → ✅ M1 | Bug: usaba `idpk` en vez de `packageId`. Hotfix en `packages.service.ts:89-97` |
| RF3 | 2 | sí | Paginación `?page&limit` (default 25) | ✅ | `packages.service.ts:51-53,72` |
| RF4 | 4 | sí | Filtro por `payment`, `originId`, `deliveryStrategy`, `createdAt` | ✅ | `packages.service.ts:55-66` |

### 2.2 No Funcionales (20 ptos)

| ID | Pts | Esencial | Descripción | Estado |
|---|---|---|---|---|
| RNF1 | 5 | sí | Connector independiente con AMQP, alimenta master por POST | ✅ |
| RNF2 | 4 | sí | Master en container recibe del connector | ✅ |
| RNF3 | 3 | – | NGINX directo en EC2 (no en container) | ✅ |
| RNF4 | 2 | – | Dominio de primer nivel | ✅ (`.tech`) |
| RNF5 | 2 | sí | EC2 free tier | ✅ (`t3.micro`) |
| RNF6 | 4 | – | Postgres en container o RDS | ✅ |

### 2.3 Compose (15 ptos)

| ID | Pts | Descripción | Estado |
|---|---|---|---|
| Compose-RNF1 | 5 | `master` desde compose | ✅ |
| Compose-RNF2 | 5 | `db` desde compose | ✅ |
| Compose-RNF3 | 5 | `connector` desde compose | ✅ |

### 2.4 Variable HTTPS (15 ptos)

| ID | Pts | Descripción | Estado |
|---|---|---|---|
| HTTPS-RNF1 | 7 | SSL Let's Encrypt | ✅ |
| HTTPS-RNF2 | 3 | Redirect 80→443 | ✅ |
| HTTPS-RNF3 | 5 | Cron renovación 2x/día | ✅ |

---

## 3. E1 — Pendiente

### 3.1 Funcionales (20 ptos)

| ID | Pts | Esencial | Descripción | Milestone | Archivos involucrados |
|---|---|---|---|---|---|
| RF01 | 5 | sí | Vista de paquetes recibidos: identificador, ciudades origen/destino, MaxHops vigente, fechas, estado, última acción | M4 (vista frontend) + M3 (estado backend) | `frontend/PackagesView.vue`, `backend/packages.service.ts` |
| RF02 | 3 | sí | Vista de conectividad ciudad ↔ ciudades, sincronizada con `distance-table` | M3 | `backend/routes.module.*`, `frontend/RoutesView.vue` |
| RF03 | 10 | sí | Sistema de ruteo: redirección, drop por `maxHops=0`, recepción local | M3 | `backend/router.service.ts` (nuevo), `connector/index.js` |
| RF04 | 2 | – | Concretar entrega cuando `deliverNotBefore` lo permita; sin doble entrega; UI de cambio de estado | M4 | `backend/packages.service.ts` (`deliver()` nuevo) |

### 3.2 No Funcionales (34 ptos)

| ID | Pts | Esencial | Descripción | Milestone |
|---|---|---|---|---|
| RNF01 | 5 | sí | Backend/Frontend separados (SPA Vue/React, container Docker distinto, **ECR sobre EC2**) | M4 |
| RNF03 | 2 | sí | Budget alerts AWS configurados | M4 |
| RNF04 | 5 | sí | API detrás de **AWS API Gateway** REST/HTTP, subdominio asociado, CORS | M2 |
| RNF05 | 3 | sí | HTTPS backend + frontend | M2 (backend ya OK) + M4 (frontend) |
| RNF06 | 4 | sí | Auth (Auth0 recomendado / Cognito) con JWK estándar | M2 |
| RNF07 | 3 | – | API Gateway autentica via RNF06 (Custom Authorizer en REST) | M2 |
| RNF08 | 3 | – | Frontend en S3 + CloudFront | M4 |
| RNF09 | 5 | – | Monitoreo SaaS (New Relic recomendado): APM + infra | M4 |
| RNF10 | 2 | – | Containers auto-restart + retry Fibonacci hacia broker | M2 |

### 3.3 Documentación (6 ptos)

| ID | Pts | Descripción | Milestone |
|---|---|---|---|
| RDOC01 | 3 | Diagrama UML de componentes (formal) | M3 |
| RDOC02 | 2 | Pasos para replicar instalación + flujo de monitoreo | M4 |
| RDOC03 | 1 | Cómo correr la app en local | M1 (parte del README) |

---

## 4. Schema de mensajes E1

### 4.1 Estructura común

```json
{
  "idpk": "uuid",
  "msgId": "uuid",
  "type": "request",
  "timestamp": "ISO 8601"
}
```

### 4.2 Reglas

- `msgId` debe ser **distinto** del `idpk` (las respuestas referencian `msgId`).
- Reintentos del mismo `msgId` deben mantener el mismo `idpk` (idempotencia).
- Si emites un mensaje, agrega tu `cityId` (= `code` de tu ciudad) al payload:

  ```json
  {
    "...": "...",
    "cityId": "city-code"
  }
  ```

### 4.3 Ciudades disponibles

```
HGW Hogwarts · COR Coruscant · REE Re-Estize · RAP Rapture · RNC Rancagua
TAL Talca · LSN Los Santos · MTI Minas Tirith · SPR Springfield · NNY New New York
MET Metropolis · KLD King's Landing · TAR Tar Valon · ZIN Zion · TK3 Tokyo-3
ROM Romdo · TRA Trantor
```

Binding queue: `city.<code>` sobre vhost `/fulfillment`, exchange `fulfillment.x`.

---

## 5. ACK / NACK contract

### 5.1 ACK (acknowledge correcto)

```json
{
  "idpk": "<eco>",
  "msgId": "<eco>",
  "type": "ack",
  "timestamp": "ISO 8601"
}
```

### 5.2 NACK (rechazo por mensaje malformado)

```json
{
  "idpk": "<eco>",
  "msgId": "<eco>",
  "type": "nack",
  "timestamp": "ISO 8601"
}
```

### 5.3 Reglas

- ACK / NACK son **mensajes nuevos**, no son `channel.ack()` AMQP por sí solos.
- **No se hacen ACKs de ACKs** (evitar loops).
- Tras NACK, el receptor decide qué hacer; no se espera retry obligatorio.

---

## 6. Tabla de distancias dinámica

### 6.1 Solicitud (al canal `central`)

```json
{
  "idpk": "uuid",
  "msgId": "uuid",
  "type": "request",
  "timestamp": "...",
  "data": { "ask": "distance-table" }
}
```

### 6.2 Respuesta esperada

```json
{
  "cityId": "<code-emisor>",
  "type": "distance-table",
  "data": {
    "distances": {
      "HGW": {
        "destinationCode": "HGW",
        "destinationName": "Hogwarts",
        "distance": 62763183,
        "transportCost": 9351985,
        "enabled": true
      },
      "...": "..."
    }
  },
  "timestamp": "..."
}
```

### 6.3 Recomendaciones

- Pedir la tabla **una sola vez** al inicializar el servicio.
- Aplicar updates posteriores (mensajes `distance-table` que llegan automáticamente).
- Para RF02 sólo importa el campo `enabled`.

---

## 7. Paquetes — `package-transit`

```json
{
  "idpk": "...",
  "msgId": "...",
  "type": "package-transit",
  "timestamp": "...",
  "packageBody": {
    "id": "uuidv4",
    "deliveryStrategy": "direct",
    "maxHops": 3,
    "createdAt": "2026-03-01T12:00:00Z",
    "deliverNotBefore": "2026-03-20T12:00:00Z",
    "originId": "central",
    "destinationId": "HGW",
    "metaContent": "",
    "isMetaEncrypted": false,
    "constraints": {},
    "priorityClass": "medium",
    "payment": 0
  }
}
```

### 7.1 Reglas

- `maxHops`: descontar 1 al reenviar. Si llega a `0` y no es para la ciudad → **expirado**.
- `deliverNotBefore`: sólo aplica para la ciudad destino; no rutas.
- `destinationId`: ciudad destino final.
- ACK/NACK obligatorio al emisor del paquete.

---

## 8. Auditoría hacia central

| Acción | Emitir | Cuándo |
|---|---|---|
| Reenvío con ruta directa | `{pkgId, type:"transit", data:{nextCityId}}` | Tienes ruta directa a destino o intermedio |
| Ruta imposible (random) | `{pkgId, type:"transit-redirect", data:{nextCityId}}` | No hay ruta directa; envías a ciudad random ≠ central ≠ origen |
| Expirado | `{pkgId, type:"expired"}` | `maxHops=0` y no eres destino |
| Recibido | `{pkgId, type:"received"}` | Te llega el paquete y aún no está entregado |
| Entregado | `{pkgId, type:"delivered"}` | Lo entregas al cliente final (RF04) |

---

## 9. Quality gates (recordatorio)

- [ ] Coverage unitario ≥ 75% en módulos tocados.
- [ ] E2E setup listo (Jest + Supertest desde M1).
- [ ] Lint + type-check sin errores.
- [ ] Build pasa.
- [ ] `.env` y `.pem` **NUNCA** commiteados.
- [ ] PRs con 2 reviewers en `main`.
- [ ] AI usage logs por sesión.

---

## 10. Trazabilidad

- Visión y plan temporal → [`roadmap.md`](./roadmap.md)
- Procesos (DoR, DoD, Gitflow) → [`milestones.md`](./milestones.md)
- Diagramas UML + NFRs → [`architecture.md`](./architecture.md)
- AI logs → [`prompts/`](./prompts/)

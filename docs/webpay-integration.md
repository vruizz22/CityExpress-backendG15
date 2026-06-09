# Integración con Webpay (Transbank) — CityExpress E2
## Resumen

Un usuario logueado cotiza un envío, lo crea y lo paga. El backend abre la transacción en Webpay,
manda al usuario al formulario de pago y, cuando vuelve, confirma el resultado. Cada paso se audita
hacia la central y los estados quedan guardados en la base, así un callback repetido no rompe nada.

```
Usuario → Frontend → Backend → Webpay
                       │
                       └→ Broker (auditoría a la central): payment-status
```

## Archivos

| Archivo | Qué hace |
|---|---|
| `payments/webpay.service.ts` | Envuelve el SDK: `create`, `commit`, `status`. |
| `payments/payments.service.ts` | La lógica: iniciar pago, confirmar, idempotencia, estados, gatillo del envío. |
| `payments/payments.controller.ts` | Los endpoints (todos con `JwtAuthGuard`). |
| `payments/payment-audit.service.ts` | Manda los mensajes `payment-status` a la central. |
| `shipments/*` | Cotización, creación de envío e historial. |
| `prisma/schema.prisma` | Modelos `UserShipment` y `Payment`, entre otros. |

## El flujo, paso a paso

**1. Cotizar y crear el envío (antes de pagar)**

`POST /quotes` calcula el `routeMetricCost` de la ruta optima y el precio con la fórmula
`max(5000, min(100000, 0.01·(h+w+d)·routeMetricCost·f_price))`. No guarda nada.

`POST /shipments` crea el `UserShipment` en estado `pending-payment`, genera de una vez el
`packageId` (que después usa el paquete E1 y la auditoría) y congela el precio cotizado.

**2. Iniciar el pago — `POST /payments`**

Crea un `Payment` en estado `TRYING`, llama a `webpay.create(...)` para obtener el `token` y la
`url`, los guarda, audita el intento como `TRYING` y devuelve `{ token, url }`. Si el envío ya tiene
un pago en `TRYING`, reusa ese en vez de crear otro; si ya está pagado, responde `409`.

Con `{ token, url }`, el frontend manda al usuario a Webpay con un formulario que se auto-envía:

```html
<form action="{url}" method="POST">
  <input type="hidden" name="token_ws" value="{token}" />
</form>
```

Después de pagar, Webpay devuelve al `returnUrl` (una ruta del front) con el `token_ws` en la query.
El front lo lee y llama a `POST /payments/commit`.

**3. Confirmar — `POST /payments/commit`**

Acepta el token como `token_ws` (el nombre real de Webpay) o `ws_token` (alias de la ayudantía).

- Pago normal: se llama a `webpay.commit(token)`. Si `response_code === 0` y `status === "AUTHORIZED"`,
  queda `SUCCESS`; si no, `FAILED` con `reason: "REJECTED"`.
- Anulación: llega `TBK_TOKEN` (sin `token_ws`) → `FAILED` con `reason: "ABORTED"`, sin llamar a
  Webpay. Si no llega ningún token, responde `200` con `ABORTED` (no es error, igual que la ayudantía).
- Error de red o de Webpay: queda `FAILED` con `reason: "ERROR"`.

La respuesta trae un `message` legible ("Transacción aceptada.", "...rechazada.", "...anulada por
el usuario.").

Cuando el pago queda `SUCCESS`, el envío pasa a `paid`, se arma el paquete E1 y se entrega al flujo
de envío inicial (RF04); al terminar, el envío queda en `sent`. Y se audita el resultado.

**4. Consultar estado — `GET /payments/:id`**

Devuelve el estado actual del pago, para que el front lo muestre o haga polling.

## Estados del pago

```
                POST /payments              commit OK
   (nada) ──────────────────▶ TRYING ──────────────────▶ SUCCESS → envío inicial
                                 │
                                 ├─ rechazo ────────────▶ FAILED (REJECTED)
                                 ├─ anulación ──────────▶ FAILED (ABORTED)
                                 └─ error ──────────────▶ FAILED (ERROR)
```

El envío sigue `pending-payment → paid → sent`. Si el pago falla queda en `failed`; si el pago sale
bien pero el envío inicial no, queda en `pending-routing`.

## Idempotencia (RNF02)

El callback de Webpay puede llegar repetido (reintentos, React StrictMode, etc.). Para que confirmar
dos veces no cobre ni envíe dos veces:

- `webpayToken` y `buyOrder` son únicos en la base.
- Antes de llamar a Webpay, el pago se mueve de `TRYING` a `COMMITTING` con un update atómico. Solo
  el request que gana esa transición llama a `webpay.commit`; los demás esperan el resultado y lo
  devuelven.
- Si el pago ya está `SUCCESS` o `FAILED`, se devuelve lo guardado sin volver a confirmar.
- Si `commit` tira error (por ejemplo, 422 por doble confirmación), se consulta `webpay.status(token)`
  para no marcar como error un pago que en realidad se autorizó.
- El gatillo del envío inicial corre una sola vez (lo asegura la misma transición de estado) y el
  `packageId` es estable.

## Mensaje de auditoría (`payment-status`)

Se manda a la central (`city.central`) con el envoltorio estándar (`idpk`, `msgId`, `type`,
`timestamp`, `cityId`). Está definido en `message.types.ts` y se valida en `message.schemas.ts`.

TRYING, al iniciar el pago:

```json
{
  "cityId": "TK3", "type": "payment-status", "pkgId": "packageId",
  "payment_token": "webpay-token",
  "data": { "status": "TRYING", "paymentId": "uuid", "amount": 15000, "currency": "CLP",
            "destinationId": "HGW", "criteria": "price", "routeMetricCost": 12000, "maxHops": 5 }
}
```

SUCCESS: lo mismo con `status: "SUCCESS"` más `authorizationCode` y `transactionDate`.
FAILED: lo mismo con `status: "FAILED"` y `reason` (`REJECTED`, `ABORTED` o `ERROR`).

## Endpoints (todos con `Authorization: Bearer <JWT Auth0>`)

| Método | Ruta | Para qué |
|---|---|---|
| POST | `/quotes` | Cotizar un envío. |
| POST | `/shipments` | Crear el envío con el precio congelado. |
| POST | `/payments` | Iniciar el pago (estado TRYING). |
| POST | `/payments/commit` | Confirmar el retorno de Webpay. |
| GET | `/payments/:id` | Estado del pago. |
| GET | `/shipments` | Historial del usuario (el admin ve todos). |
| GET | `/shipments/:id` | Detalle de un envío y su pago. |

## Variables de entorno

```env
WEBPAY_ENVIRONMENT=integration
WEBPAY_COMMERCE_CODE=
WEBPAY_API_KEY=
WEBPAY_RETURN_URL=http://localhost:5173/payment/callback
F_PRICE=1
```

En integración, si dejas `WEBPAY_COMMERCE_CODE` y `WEBPAY_API_KEY` vacíos, el SDK usa las
credenciales de prueba oficiales.

## Probarlo

Tests unitarios (`pnpm test`):

- `payments.service.spec.ts`: éxito, gatillo único, callbacks duplicados, rechazo y anulación.
- `pricing.spec.ts`: la fórmula de costo y sus límites.

Tarjetas de prueba de Webpay:

| Resultado | Tarjeta | CVV / vencimiento |
|---|---|---|
| Aprueba | VISA `4051 8856 0044 6623` | `123`, cualquier fecha futura |
| Rechaza | MASTERCARD `5186 0595 5959 0568` | `123`, cualquier fecha futura |

En el banco simulado: RUT `11.111.111-1`, clave `123`.

Helpers en `docs/`:

- `CityExpress.postman_collection.json`: colección Postman con el flujo completo (quote → shipment →
  payment → commit).
- `webpay-test.html`: un form para mandar el token a Webpay y pagar en el navegador.

## Cómo se implementó (RDOC02)

1. Instalamos `transbank-sdk` y escribimos `WebpayService` (`create`, `commit`, `status`) en modo
   integración.
2. Modelamos `Payment` con sus estados y las claves únicas (`buyOrder`, `webpayToken`), y
   `UserShipment` con el precio congelado.
3. `POST /payments` abre la transacción, guarda el token y la url, y audita `TRYING`.
4. El frontend manda al usuario a Webpay con el form y vuelve con el `token_ws`.
5. `POST /payments/commit` confirma con el SDK, interpreta el resultado, guarda el estado y audita
   `SUCCESS`/`FAILED`.
6. Agregamos la idempotencia (transición atómica + fallback a `status`) y el gatillo del envío
   inicial una sola vez.

Lo probamos de punta a punta contra el ambiente de integración real de Transbank: abrir la
transacción, pagar con tarjeta de prueba, confirmar con `SUCCESS`, y reintentar el `commit` para
verificar que no se procesa dos veces.

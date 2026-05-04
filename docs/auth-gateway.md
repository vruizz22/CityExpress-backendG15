# Auth0 + API Gateway E1

> Configuración de autenticación, autorización por ruta y CORS para CityExpress G15.

---

## 1. Resumen

E1 delega autenticación en Auth0 y autorización inicial en API Gateway HTTP API con JWT authorizer nativo.

```text
SPA -> Auth0 login -> access_token
SPA -> API Gateway (Authorization: Bearer token)
API Gateway -> validates issuer/audience/signature
API Gateway -> appends X-Origin-Auth
NGINX -> validates X-Origin-Auth
NGINX -> master
```

El master no necesita validar JWT directamente para E1; API Gateway bloquea las rutas protegidas antes de llegar al origen.

## 2. Tenant Auth0

| Campo | Valor |
|---|---|
| Tenant | `frontendg15cityexpress.us.auth0.com` |
| Issuer URL | `https://frontendg15cityexpress.us.auth0.com/` |
| Region | US |

## 3. API en Auth0

| Campo | Valor |
|---|---|
| Name | `CityExpress API` |
| Identifier / audience | `https://api.andresitowan.com` |
| Signing algorithm | `RS256` |

El `audience` debe ser exactamente `https://api.andresitowan.com`; si el SPA pide otro audience, API Gateway devuelve 401.

## 4. SPA Application en Auth0

| Campo | Valor |
|---|---|
| Type | Single Page Application |
| Client ID | `sb1CnASsgLO1tOpYWHMgrqA8ADLOsnK6` |

Allowed Callback URLs:

```text
http://localhost:5173
https://app.andresitowan.com
https://d2emu55e9ka9fs.cloudfront.net
```

Allowed Logout URLs:

```text
http://localhost:5173
https://app.andresitowan.com
https://d2emu55e9ka9fs.cloudfront.net
```

Allowed Web Origins:

```text
http://localhost:5173
https://app.andresitowan.com
https://d2emu55e9ka9fs.cloudfront.net
```

Variables frontend:

```env
VITE_AUTH0_DOMAIN=frontendg15cityexpress.us.auth0.com
VITE_AUTH0_CLIENT_ID=sb1CnASsgLO1tOpYWHMgrqA8ADLOsnK6
VITE_AUTH0_AUDIENCE=https://api.andresitowan.com
VITE_API_BASE_URL=https://api.andresitowan.com
```

## 5. API Gateway HTTP API

| Campo | Valor |
|---|---|
| API name | `cityexpress-api` |
| Custom domain | `api.andresitowan.com` |
| Authorizer type | JWT |
| Identity source | `$request.header.Authorization` |
| Issuer URL | `https://frontendg15cityexpress.us.auth0.com/` |
| Audience | `https://api.andresitowan.com` |

Asignación por ruta:

| Method | Route | Auth |
|---|---|---|
| GET | `/` | NONE |
| GET | `/packages` | JWT |
| GET | `/packages/{id}` | JWT |
| POST | `/packages/{id}/deliver` | JWT |
| GET | `/routes` | JWT |

Parameter mapping hacia el origen:

```text
append:header.X-Origin-Auth = <shared-secret-32-bytes-hex>
```

Ese header solo lo conoce API Gateway y NGINX. No debe aparecer en el SPA, Postman público, CORS allowed headers ni documentación con valores reales.

## 6. CORS Configuration

Allowed origins:

```text
http://localhost:5173
https://app.andresitowan.com
https://d2emu55e9ka9fs.cloudfront.net
```

Allowed methods:

```text
GET
POST
OPTIONS
```

Allowed headers:

```text
Authorization
Content-Type
```

Credentials:

```text
false
```

Verificar preflight:

```bash
curl -i -X OPTIONS https://api.andresitowan.com/packages \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

La respuesta debe incluir `access-control-allow-origin` para el origin enviado.

## 7. Cómo Obtener un Token para Tests

Camino recomendado para E1:

1. Abrir el SPA en `http://localhost:5173`, `https://app.andresitowan.com` o `https://d2emu55e9ka9fs.cloudfront.net`.
2. Hacer login con Auth0.
3. Abrir DevTools.
4. Ir a Application.
5. Buscar el storage usado por Auth0.
6. Copiar el `access_token` emitido para audience `https://api.andresitowan.com`.

Usarlo solo en sesión local:

```bash
export TOKEN=<auth0-access-token>
curl -i https://api.andresitowan.com/packages \
  -H "Authorization: Bearer $TOKEN"
```

No pegar tokens en commits, issues, screenshots públicos ni logs de prompts.

## 8. Troubleshooting

| Síntoma | Causa probable | Verificación |
|---|---|---|
| 401 en API Gateway | Token faltante, inválido, expirado, issuer incorrecto o audience incorrecto | Revisar `iss`, `aud`, expiración y header `Authorization` |
| 403 golpeando `origin-api` directo | Falta `X-Origin-Auth` o no coincide con el secreto de NGINX | Esperado para tráfico directo; solo API Gateway debe inyectar el header |
| 403 con CORS desde navegador | Origin no permitido en CORS de API Gateway | Confirmar origin exacto, sin slash final |
| OPTIONS falla | Preflight no está cubierto por CORS o faltan headers permitidos | Ejecutar el curl de preflight de §6 |
| Login vuelve al dominio equivocado | Callback URL no está en Allowed Callback URLs | Agregar el origin exacto en Auth0 |
| Warning "Dev Keys" en Auth0 | Google social connection usa claves de desarrollo de Auth0 | Google connection quedó deshabilitada; no es requerida para E1 |

Checks rápidos:

```bash
# Should be 401
curl -i https://api.andresitowan.com/packages

# Should be 403
curl -i https://origin-api.andresitowan.com/packages

# Should be 200 with valid token
curl -i https://api.andresitowan.com/packages \
  -H "Authorization: Bearer $TOKEN"
```


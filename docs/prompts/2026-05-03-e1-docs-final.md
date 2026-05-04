# Session: 2026-05-03 — E1 Docs Final (Persona 5)

**Agente:** Codex
**Owner:** Guillermo Carey (P5)
**Branch:** `feature/backend-deploy`
**Fecha:** 2026-05-03
**Plan referenciado:** `docs/plan.md`

---

## Prompt

````text
La imagen de apm esta aca [apm-master.png](docs/apm-master.png) 
Actúa como technical writer de un proyecto académico de ingeniería (curso IIC2173 Arquitectura de Software, Entrega 1, equipo G15). Necesito que generes 4 archivos markdown que documenten el despliegue completo de E1 (Persona 5: DevOps · AWS · Auth · Monitoring · Docs).

## Reglas absolutas

1. **NO inventar valores**. Todos los valores concretos de infraestructura están listados al final de este prompt en la sección "Estado real del deploy". Si necesitas un valor que no está ahí, pónlo como `<TODO>` y nada más.
2. **NO incluir secretos literales**: nunca el `NEW_RELIC_LICENSE_KEY`, nunca el `ORIGIN_SHARED_SECRET`, nunca passwords ni access keys. Usa placeholders tipo `<license-key>`, `<shared-secret-32-bytes-hex>`, `<aws-access-key>`.
3. **Lee primero `docs/plan.md`** completo, especialmente §4 (Docker), §5 (ECR/EC2), §6 (NGINX/Certbot), §7 (API Gateway/Auth0), §8 (S3/CloudFront), §9 (New Relic), §11 (Resiliencia), §20 (Bitácora con desviaciones reales). Esos son la fuente de verdad de las decisiones.
4. **Lee `docs/prompts/2026-04-27-e1-kickoff.md`** para entender el formato exacto del session log que te voy a pedir crear.
5. **Lenguaje**: español en explicaciones, inglés en bloques de código y comentarios técnicos.
6. **No mergees ni comitees nada**. Solo crea los archivos.

## Archivos a crear

### 1. `docs/deploy.md`

Guía completa para que un compañero pueda re-desplegar el backend desde cero. Estructura sugerida (puedes ajustar):

- Visión general (diagrama mental texto: SPA → CloudFront, SPA → API Gateway → NGINX → master ↔ DB; connector ↔ broker)
- Prerrequisitos (cuenta AWS, dominio en Namecheap, AWS CLI, Docker con buildx, repo clonado, `feature/backend-deploy` mergeada)
- Setup AWS one-time:
  - Budget alerts USD 12 con alarmas 50/80/100
  - ACM us-east-1 (2 certs: api.andresitowan.com y app.andresitowan.com)
  - ECR repos: `cityexpress-master`, `cityexpress-connector`
  - IAM instance profile para EC2 con policy de pull ECR (lista los actions ecr:* exactos del plan §5.2)
- Provisioning EC2:
  - AMI Ubuntu 24.04 LTS, t3.micro, 20 GiB gp3
  - Security Group: 22 (mi IP), 80, 443
  - Elastic IP asociada
  - Bootstrap (apt install docker.io, docker-compose-plugin, nginx, certbot, python3-certbot-nginx)
  - Crear `/opt/cityexpress/`, copiar `docker-compose.prod.yml` y crear `.env` con la lista de variables (sin valores reales)
- DNS Namecheap (4 records): api, api-origin, app, _acme challenge
- NGINX:
  - Archivo `/etc/nginx/sites-available/cityexpress.conf` con map directive del shared secret y proxy_pass al master en 127.0.0.1:3000
  - `map_hash_bucket_size 128;` arriba del map (workaround del bug que ya nos pasó)
  - Health pública en `/healthz` sin shared secret
  - Resto detrás del header `X-Origin-Auth`
- Certbot:
  - `sudo certbot --nginx -d api-origin.andresitowan.com --non-interactive --agree-tos -m guillocareym@gmail.com --redirect`
  - Cron de renovación
- Build + push imagen master:
  - `docker buildx build --platform linux/amd64 -t $ECR_REGISTRY/cityexpress-master:$GIT_SHA -f Dockerfile --push .`
- Build + push imagen connector (referencia al repo y rama de P1)
- Pull en EC2 y `docker compose up -d`
- API Gateway HTTP API:
  - Crear `cityexpress-api`
  - Custom domain `api.andresitowan.com` con cert ACM us-east-1
  - JWT authorizer Auth0 (issuer + audience)
  - Rutas con tabla del plan §7.4 (auth marcado por ruta)
  - Parameter mapping: append header `X-Origin-Auth: <shared-secret>`
  - CORS allowed origins
- Frontend en S3 + CloudFront:
  - Crear bucket privado, OAC, distribution con SPA fallback (403/404 → /index.html 200)
  - Alternate domain `app.andresitowan.com` con cert ACM us-east-1
- Smoke tests al final con los 4 curls del plan §6.7 y §7.7
- **Sección "Releases"** con tabla en blanco lista para llenar:
  ```
  | Fecha | git sha | Cambios | Status |
  |---|---|---|---|
  | 2026-05-03 | <sha> | Primer prod + New Relic APM | OK |
  ```
- **Sección "Rollback"**: comandos del plan §5.5 paso a paso

### 2. `docs/monitoring.md`

- New Relic APM master:
  - Cómo se instrumenta (`NODE_OPTIONS=-r newrelic` + 3 vars en compose; `newrelic` en `dependencies` del master)
  - Account ID 8018520, App ID 1085291491, link al dashboard
  - 4 placeholders de imágenes para screenshots:
    - `./assets/monitoring/apm-master-overview.png`
    - `./assets/monitoring/apm-transactions.png`
    - `./assets/monitoring/infra-host.png`
    - `./assets/monitoring/database.png`
- New Relic Infrastructure agent en host EC2 (instalación con curl + newrelic-cli)
- Cómo generar tráfico para llenar dashboards (loop de curl con TOKEN al `/routes` y `/packages`)
- Alertas recomendadas (no exigidas en E1, mencionar como futuro): avg response time > 1s 5min, error rate > 5%
- Sección "Cómo verificar que el agente está conectado":
  - `sudo docker exec cityexpress_master env | grep -i new`
  - `sudo docker exec cityexpress_master tail -30 newrelic_agent.log` debe mostrar "Agent state changed from connecting to connected"

### 3. `docs/auth-gateway.md`

- Tenant Auth0: `frontendg15cityexpress.us.auth0.com`
- API definida en Auth0:
  - Name: `CityExpress API`
  - Identifier (audience): `https://api.andresitowan.com`
  - Signing alg: RS256
- SPA Application en Auth0:
  - Type: Single Page Application
  - Allowed Callback URLs / Logout URLs / Web Origins: `http://localhost:5173`, `https://app.andresitowan.com`, `https://d2emu55e9ka9fs.cloudfront.net`
- API Gateway HTTP API:
  - JWT authorizer config (Identity source `$request.header.Authorization`, Issuer URL `https://frontendg15cityexpress.us.auth0.com/`, Audience `https://api.andresitowan.com`)
  - Asignación por ruta (tabla del plan §7.4)
  - Parameter mapping del header `X-Origin-Auth`
- CORS configuration (lista origins + métodos + headers)
- Troubleshooting:
  - 401: token inválido/expirado/falta
  - 403 desde origin directo: shared secret en NGINX no coincide
  - 403 con CORS: origin no permitido en API Gateway
  - OPTIONS preflight: cómo verificar
  - "Dev Keys" warning en Auth0: por qué desactivamos Google connection
- Cómo obtener un token para tests (login en el SPA + DevTools → Application → grab access_token)

### 4. `docs/prompts/2026-05-03-e1-docs-final.md`

Session log siguiendo EXACTAMENTE el formato de `docs/prompts/2026-04-27-e1-kickoff.md`. Estructura:

- Header con `**Agente:** Codex`, `**Owner:** Guillermo Carey (P5)`, branch `feature/backend-deploy`, fecha `2026-05-03`, plan referenciado `docs/plan.md`
- Sección `## Prompt`: pega el bloque completo de este prompt que estás recibiendo (entre triple backtick para que se vea como bloque)
- Sección `## Output`: lista de los 3 archivos creados (`docs/deploy.md`, `docs/monitoring.md`, `docs/auth-gateway.md`) con 1-2 líneas describiendo el contenido de cada uno y cuántas secciones tiene
- Sección `## Decisión`: 3-5 bullets sobre decisiones de redacción (ej: "Documentar cada paso AWS con el comando CLI exacto en lugar de pasos por consola, para que un compañero pueda automatizarlo después", "Mantener todos los secretos como `<placeholder>` para que el archivo sea seguro de commitear")
- Sección `## Tradeoffs`: 2-3 bullets con decisiones discutibles y por qué se tomaron (ej: "Listar comandos sin Terraform porque E1 no exige IaC y la complejidad agregaría riesgo a horas del cierre")

## Estado real del deploy (valores concretos a usar)

```yaml
aws:
  account_id: 353731341232
  region: us-east-1
  ecr_registry: 353731341232.dkr.ecr.us-east-1.amazonaws.com
  ec2:
    instance_id: i-0bfbc93f5e6340508
    public_ip: 52.5.25.114
    name: cityexpress-ec2
    type: t3.micro
    ami: Ubuntu 24.04 LTS
    az: us-east-1d
  s3_bucket: cityexpress-frontend-andresitowan
  cloudfront:
    distribution_id: EYMIU0TNOQ7F9
    domain: d2emu55e9ka9fs.cloudfront.net
  acm_certs_us_east_1:
    - api.andresitowan.com
    - app.andresitowan.com

dns_namecheap_andresitowan_com:
  - api          (A o ALIAS)  -> API Gateway custom domain target
  - api-origin   (A)          -> 52.5.25.114
  - app          (CNAME)      -> d2emu55e9ka9fs.cloudfront.net

auth0:
  tenant: frontendg15cityexpress.us.auth0.com
  issuer_url: https://frontendg15cityexpress.us.auth0.com/
  api_audience: https://api.andresitowan.com
  spa_client_id: sb1CnASsgLO1tOpYWHMgrqA8ADLOsnK6
  google_connection: deshabilitada (warning Dev Keys, no requerido por E1)

api_gateway:
  api_name: cityexpress-api
  custom_domain: api.andresitowan.com
  routes:
    - GET /             (NONE, health)
    - GET /packages     (JWT)
    - GET /packages/{id} (JWT)
    - POST /packages/{id}/deliver (JWT)
    - GET /routes       (JWT)
  cors_allow_origins:
    - http://localhost:5173
    - https://app.andresitowan.com
    - https://d2emu55e9ka9fs.cloudfront.net

ec2_paths:
  compose: /opt/cityexpress/docker-compose.prod.yml
  env: /opt/cityexpress/.env
  nginx_site: /etc/nginx/sites-available/cityexpress.conf
  certbot_live: /etc/letsencrypt/live/api-origin.andresitowan.com/

new_relic:
  account_id: 8018520
  app_id_master: 1085291491
  apm_link: https://rpm.newrelic.com/accounts/8018520/applications/1085291491
  agent_version_observed: 13.19.2

docker_images:
  master_repo: cityexpress-master
  connector_repo: cityexpress-connector
  tag_convention: <git-sha-7>

env_vars_in_compose_master:
  - DATABASE_URL (construida desde POSTGRES_USER/PASSWORD/DB)
  - NODE_ENV=production
  - NODE_OPTIONS=-r newrelic
  - NEW_RELIC_LICENSE_KEY (desde .env)
  - NEW_RELIC_APP_NAME=cityexpress-master
  - NEW_RELIC_NO_CONFIG_FILE=true
  - CITY_ID (TK3 en prod)

env_vars_in_compose_connector:
  - RABBITMQ_URL
  - RABBITMQ_QUEUE
  - MASTER_API_URL=http://master:3000

owner_email: guillocareym@gmail.com
city_code: TK3
city_name: Tokyo-3
broker: broker.iic2173.org
broker_vhost: /fulfillment
```

## Referencias dentro del repo que debes leer

- `docs/plan.md` (entero, especialmente §4–§9, §11, §20)
- `docs/architecture.md` (stub, no duplicar contenido)
- `docs/prompts/2026-04-27-e1-kickoff.md` (formato del session log)
- `docs/prompts/2026-05-01-e1-infra-plan.md` (sesión hermana de planificación)
- `docker-compose.prod.yml`
- `Dockerfile`
- `prisma.config.ts`
- `tsconfig.build.json`

Cuando termines, dime qué archivos creaste y un resumen de 5 líneas de qué contiene cada uno. No pidas autorización para crearlos — créalos directamente. No hagas commit.
````

---

## Output

- `docs/deploy.md` — guía de redeploy backend/frontend desde cero, con AWS one-time, EC2, Namecheap, NGINX, Certbot, ECR, API Gateway, CloudFront, smoke tests, releases y rollback. Tiene 15 secciones.
- `docs/monitoring.md` — runbook de New Relic para APM del master e Infrastructure agent en EC2, con link real, placeholders de screenshots, generación de tráfico, verificación de conexión y alertas futuras. Tiene 7 secciones.
- `docs/auth-gateway.md` — documentación de Auth0, SPA app, JWT authorizer, rutas protegidas, CORS, obtención de token y troubleshooting de 401/403/OPTIONS. Tiene 8 secciones.

---

## Decisión

1. Mantener todos los secretos como `<placeholder>` para que los documentos sean seguros de commitear.
2. Usar `api-origin.andresitowan.com` como dominio de origen final, porque el estado real del deploy lo define así aunque el plan histórico usara `origin-api` en secciones antiguas.
3. Documentar comandos CLI copy-paste cuando el valor real existe, y dejar `<TODO>` cuando faltan targets o IDs no listados.
4. Separar `deploy.md`, `monitoring.md` y `auth-gateway.md` para que cada compañero pueda ir directo a la guía que necesita sin duplicar el stub de arquitectura.
5. Registrar `docs/apm-master.png` como evidencia disponible y mantener los cuatro placeholders pedidos para screenshots finales normalizados.

---

## Tradeoffs

### CLI manual vs Terraform

- Se documentaron comandos manuales porque E1 no exige IaC y el plan original prioriza velocidad y bajo riesgo cerca del cierre.
- Alternativa rechazada: Terraform completo para API Gateway, CloudFront, ACM y EC2. Habría mejor reproducibilidad, pero más superficie de error para la entrega.

### Placeholders estrictos vs inferencias cómodas

- Algunos valores podrían inferirse por convención, como nombres de cola RabbitMQ, targets DNS de API Gateway o IDs de OAC.
- Se dejaron como `<TODO>` porque la regla absoluta del prompt pide no inventar valores concretos que no estén en el estado real del deploy.

### Cuatro smoke tests mínimos vs suite larga

- `deploy.md` deja cuatro curls principales para validar origen protegido y API Gateway con JWT.
- Se agregó el preflight OPTIONS como check adicional, sin convertirlo en requisito del smoke mínimo, para mantener la guía compacta.


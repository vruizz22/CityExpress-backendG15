# Plan E1 — Persona 5 (DevOps · AWS · Auth · Monitoring · Docs)

> **Owner:** Guillermo Carey (P5) · `feature/backend-deploy` · **Fecha:** 2026-05-01 · **Deadline E1:** dom 2026-05-03 23:59 CLT.
> Documento de planificación. **No** contiene código de aplicación. Sólo se editan
> `plan.md` y se crea `docs/prompts/2026-05-01-e1-infra-plan.md`.

---

## Disclaimer (D11)

Esta E1 **no** es ejecución de programación agéntica completa con BMAD + coverage 75%
sobre todo el repo. Claude Code se usa exclusivamente como asistente de planificación
(este documento + el log en `docs/prompts/`). El owner declarará el uso de IA al
ayudante por separado y de forma manual; este plan **no** programa esa notificación
ni planifica trabajo de coverage para módulos fuera del scope de P5.

---

## 0. Decisión de Git y flujo

- Branch de trabajo: `feature/backend-deploy` (ya creada).
- Flujo: `feature/backend-deploy` → PR → `develop` → (al final, junto al resto del equipo) `develop` → `main`.
- Commits Conventional Commits en inglés (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`).
- **No mergear a `develop`** hasta que el plan esté aprobado por el owner.
- `main` permanece protegida (2 reviewers exigidos por enunciado).
- PR template del repo (ver `docs/milestones.md §4.1`) obligatorio.

**Criterio de salida:** rama existe, sin push directo a `develop`/`main`, plan revisado.

---

## 1. Alcance Persona 5 vs equipo

| Área | P1 broker | P2 ruteo | P3 API/DB | P4 frontend | **P5 (yo)** |
|---|---|---|---|---|---|
| Connector RabbitMQ (AMQP, ACK/NACK, retry Fibonacci) | ✅ owner | – | – | – | revisa env vars, agrega lockfile `pnpm-lock.yaml` |
| `package-transit`, `distance-table`, queues `city.<code>.q` | ✅ | – | – | – | – |
| Lógica `maxHops`, `deliverNotBefore`, redirección, drop, persistencia pendientes | – | ✅ owner | – | – | – |
| Endpoints REST, DTOs, validación, idempotencia, tests unitarios/E2E | – | – | ✅ owner | – | publica el contrato en API Gateway, no implementa |
| SPA Vite+React+JS (RF01/RF02/RF04) | – | – | – | ✅ owner | entrega contrato Auth0 + URL del API Gateway |
| Auth0 (tenant, API, SPA app, JWT, audience) | – | – | – | – | ✅ owner |
| AWS API Gateway HTTP API + JWT authorizer + CORS + custom domain | – | – | – | – | ✅ owner |
| EC2 (Elastic IP, SG, NGINX nativo, Certbot) | – | – | – | – | ✅ owner |
| ECR + Docker tags + `docker-compose.prod.yml` + rollback | – | – | – | – | ✅ owner |
| Route53 (`andresitowan.com`) + DNS records | – | – | – | – | ✅ owner |
| S3 + CloudFront para frontend | – | – | – | colabora con env vars | ✅ owner de la infra |
| New Relic (APM master, infra agent) | – | – | – | – | ✅ owner; recomienda a P1 instrumentar connector |
| Budget alerts AWS | – | – | – | – | ✅ owner |
| Resiliencia container (`restart: unless-stopped`) | – | – | – | – | ✅ owner |
| Documentación: deploy.md, monitoring.md, auth-gateway.md, prompts | – | – | – | – | ✅ owner |
| RDOC01 UML | parte | parte | parte | parte | diagrama de **despliegue** |

**Criterio de salida:** todo el equipo reconoce la matriz de responsabilidades; no hay solapes en API Gateway / EC2 / Auth0.

---

## 2. Contratos hacia el equipo

### 2.1 Hacia P1 (broker)

P5 entrega al connector vía variables de entorno (en `docker-compose.prod.yml`):

```env
RABBITMQ_URL=amqps://<user>:<pass>@broker.iic2173.org:5671/<vhost>     # TODO P1: confirmar credenciales y vhost (esperado /fulfillment)
RABBITMQ_QUEUE=city.<code>.q                                           # TODO P1: confirmar <code> de G15 (HGW/COR/...)
RABBITMQ_EXCHANGE=fulfillment.x                                        # TODO P1: confirmar
RABBITMQ_ROUTING_KEY=city.<code>                                       # TODO P1: confirmar
RABBITMQ_AUDIT_QUEUE=central                                           # TODO P1: confirmar nombre exacto
MASTER_API_URL=http://master:3000                                      # interno docker network, no público
MASTER_INTERNAL_TOKEN=<shared>                                         # TODO P1+P3: si se decide proteger POST interno
NEW_RELIC_LICENSE_KEY=<env>                                            # opcional, recomendado
NEW_RELIC_APP_NAME=cityexpress-connector
NEW_RELIC_NO_CONFIG_FILE=true
```

P5 necesita de P1:
- Lista final de **queues, exchanges, routing keys** que el connector va a abrir/asertar.
- Confirmación de que el connector usa `pnpm` con `pnpm-lock.yaml` (ver §4.1).
- Confirmación del nombre del canal de auditoría (`central`) y formato exacto.
- Política de reintentos Fibonacci (RNF10): TAREA P1; P5 sólo verifica que la lib elegida no requiera variables nuevas.

**Criterio de salida:** una sola tabla de variables connector consensuada con P1, sin TODOs antes del despliegue final.

### 2.2 Hacia P2/P3 (master)

Endpoints que el API Gateway HTTP API expondrá. Marcar **Auth** = JWT requerido o **Public**.

| Método | Path | Auth | Confirmado por | Notas |
|---|---|---|---|---|
| GET | `/` | Public | – | health check del NGINX/master, útil para smoke tests |
| GET | `/packages` | JWT | P3 | listado RF1/RF01 |
| GET | `/packages/{id}` | JWT | P3 | detalle RF2 |
| POST | `/packages/{id}/deliver` | JWT | P3 (RF04) | TODO P3: confirmar ruta exacta |
| GET | `/routes` | JWT | P3 (RF02) | TODO P3: confirmar si será `/routes` o `/cities` |
| POST | `/packages` | **Public por ahora** (lo llama el connector intra-EC2) | P1+P3 | TODO P3: si se mueve detrás de API Gateway, cambiar a JWT |

Reglas:
- Health (`GET /`) queda **Public** para que API Gateway pueda hacer smoke desde fuera y NGINX desde dentro.
- Cualquier ruta nueva que P3 agregue debe declararse aquí antes de mergear; P5 actualiza el API Gateway en consecuencia.
- El POST interno desde el connector **no** atraviesa API Gateway; va por la red Docker interna `cityexpress-net`. El secret de origen (D4) sólo aplica al tráfico que entra desde Internet.

**Criterio de salida:** P3 firma la tabla de rutas (puede ser un comentario en el PR).

### 2.3 Hacia P4 (frontend)

P5 entrega a P4 (vía Slack/issue, **no** committed):

```text
AUTH0_DOMAIN=<tenant>.us.auth0.com
AUTH0_CLIENT_ID=<spa-client-id>
AUTH0_AUDIENCE=https://api.andresitowan.com
VITE_API_BASE_URL=https://api.andresitowan.com
```

Acciones que P4 ejecuta en su repo `CityExpress-frontendG15`:

1. Montar `<Auth0Provider>` en `src/main.jsx`:
   ```jsx
   <Auth0Provider
     domain={import.meta.env.VITE_AUTH0_DOMAIN}
     clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
     authorizationParams={{
       redirect_uri: window.location.origin,
       audience: import.meta.env.VITE_AUTH0_AUDIENCE,
     }}
   >
     <App />
   </Auth0Provider>
   ```
2. Inyectar `getAccessTokenSilently` al httpClient ya preparado.
3. Botón Login/Logout con `useAuth0()`.
4. `.env.production` con `VITE_API_BASE_URL=https://api.andresitowan.com`.

CORS / Auth0 Allowed lists que P5 configura en backend y Auth0:

| Lista | Valores |
|---|---|
| API Gateway CORS `Access-Control-Allow-Origin` | `https://app.andresitowan.com`, `https://d<id>.cloudfront.net` (transitorio), `http://localhost:5173` (dev) |
| Auth0 → SPA App → Allowed Callback URLs | `https://app.andresitowan.com`, `https://d<id>.cloudfront.net`, `http://localhost:5173` |
| Auth0 → SPA App → Allowed Logout URLs | mismos tres |
| Auth0 → SPA App → Allowed Web Origins | mismos tres |

> El dominio CloudFront default `d<id>.cloudfront.net` se conoce sólo después de
> crear la distribución; P5 lo agrega en una segunda pasada.

**Criterio de salida:** P4 puede hacer `npm run dev` y loguearse contra Auth0; el SPA recibe un access token con audience correcto y hace `GET /packages` autenticado.

---

## 3. Higiene previa

Antes de cualquier cambio en infra:

1. `git status` limpio salvo `plan.md`.
2. Verificar que no hay `.env`, `.pem`, `*.key`, `id_rsa*` en el working tree (sanción de E1).
3. Baseline local:
   ```bash
   pnpm install --frozen-lockfile
   pnpm run lint
   pnpm run build
   pnpm run test:cov
   docker compose up --build
   curl -fsS http://localhost:3000/packages
   ```
4. Asegurar que `.gitignore` cubre `.env*` (no `.example.env`), `coverage/`, `dist/`, `node_modules/`, `*.pem`.

**Criterio de salida:** baseline local verde; no hay secretos en el árbol.

---

## 4. Docker y docker-compose

### 4.1 Auditoría del estado actual

Hallazgos sobre el repo actual:

- **Bug `.example.env`:** la línea 12 usa `${POSTGRES_USER}` etc. dentro del valor de `DATABASE_URL`. Compose **no** interpola variables dentro de valores leídos por `--env-file` (sólo en `docker-compose.yml`). Tres opciones:
  1. Quitar `DATABASE_URL` de `.env`/`.example.env` y dejar que `docker-compose.yml` la **construya inline** en `services.master.environment` (ya lo hace en la línea 26 actual). Ésta es la opción recomendada — minimiza superficie y evita strings duplicados.
  2. Hardcodear el valor expandido (`postgresql://app:secret@db:5432/cityexpress?...`). Sólo si el desarrollador no cambia las credenciales.
  3. Usar un wrapper shell que `export` antes de `docker compose up`. Frágil.
  - **Decisión P5:** opción 1 — quitar `DATABASE_URL` de `.example.env`.
- **Placeholders faltantes en `.example.env`:** agregar `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` con valores demo.
- **Connector sin lockfile (D10):** `connector/` no tiene `pnpm-lock.yaml`, por lo que `pnpm install` actualmente resuelve sin lock. Hay que (a) generar lockfile localmente con `pnpm install` dentro de `connector/`, (b) commitearlo, (c) cambiar `connector/Dockerfile` a `pnpm install --frozen-lockfile`. Tarea coordinada con P1 — P5 prepara el cambio, P1 lo valida en su PR de connector E1.
- **Tag de imagen master:** el Dockerfile actual no tiene tag de release. La convención D7 (`<repo>:<git-sha>`) se aplica en CI/manual desde §4.5.
- **Puerto DB expuesto:** `5433:5432` en dev está bien, pero en prod **no se publica**.

### 4.2 `.example.env` propuesto (diff conceptual)

```diff
- DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public"
+ # DATABASE_URL la construye docker-compose.yml a partir de POSTGRES_USER/PASSWORD/DB
+ POSTGRES_USER=app
+ POSTGRES_PASSWORD=changeme-local-only
+ POSTGRES_DB=cityexpress
+
+ # Origen NGINX <-> API Gateway (D4)
+ ORIGIN_SHARED_SECRET=replace-with-32-byte-hex
+
+ # Auth0 (sólo necesario si master valida JWT directamente; en E1 lo hace API Gateway)
+ AUTH0_DOMAIN=
+ AUTH0_AUDIENCE=
+
+ # New Relic
+ NEW_RELIC_LICENSE_KEY=
+ NEW_RELIC_APP_NAME=cityexpress-master
+ NEW_RELIC_NO_CONFIG_FILE=true
```

### 4.3 `docker-compose.yml` (dev) — diff propuesto

Mantener build local. Cambios mínimos:

```diff
 services:
   db:
     image: postgres:15-alpine
-    container_name: quackpackage_db
+    container_name: cityexpress_db_dev
-    restart: always
+    restart: unless-stopped
     ...
   master:
     build:
       context: .
-    container_name: quackpackage_master
+    container_name: cityexpress_master_dev
-    restart: always
+    restart: unless-stopped
     ports:
       - "3000:3000"
     environment:
       - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public
   connector:
     build:
       context: ./connector
-    container_name: quackpackage_connector
+    container_name: cityexpress_connector_dev
-    restart: always
+    restart: unless-stopped
```

`network` y `volumes` quedan igual. **No** introducir New Relic en dev (ruido).

### 4.4 `docker-compose.prod.yml` — propuesta YAML completa

Archivo nuevo en raíz. Se ejecuta en EC2 con `docker compose -f docker-compose.prod.yml --env-file /opt/cityexpress/.env up -d`.

```yaml
services:
  db:
    image: postgres:15-alpine
    container_name: cityexpress_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - cityexpress-net
    # Sin "ports": la DB no se expone al host (D12)

  master:
    image: ${ECR_REGISTRY}/cityexpress-master:${IMAGE_TAG}
    container_name: cityexpress_master
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public
      - NODE_ENV=production
      - NODE_OPTIONS=-r newrelic
      - NEW_RELIC_LICENSE_KEY=${NEW_RELIC_LICENSE_KEY}
      - NEW_RELIC_APP_NAME=cityexpress-master
      - NEW_RELIC_NO_CONFIG_FILE=true
      - AUTH0_DOMAIN=${AUTH0_DOMAIN}
      - AUTH0_AUDIENCE=${AUTH0_AUDIENCE}
    depends_on:
      - db
    ports:
      - "127.0.0.1:3000:3000"   # solo loopback; NGINX lo proxiea
    networks:
      - cityexpress-net

  connector:
    image: ${ECR_REGISTRY}/cityexpress-connector:${IMAGE_TAG}
    container_name: cityexpress_connector
    restart: unless-stopped
    environment:
      - RABBITMQ_URL=${RABBITMQ_URL}
      - RABBITMQ_QUEUE=${RABBITMQ_QUEUE}
      - RABBITMQ_EXCHANGE=${RABBITMQ_EXCHANGE}
      - RABBITMQ_ROUTING_KEY=${RABBITMQ_ROUTING_KEY}
      - RABBITMQ_AUDIT_QUEUE=${RABBITMQ_AUDIT_QUEUE}
      - MASTER_API_URL=http://master:3000
      - NEW_RELIC_LICENSE_KEY=${NEW_RELIC_LICENSE_KEY}
      - NEW_RELIC_APP_NAME=cityexpress-connector
      - NEW_RELIC_NO_CONFIG_FILE=true
    depends_on:
      - master
    networks:
      - cityexpress-net

volumes:
  pgdata:

networks:
  cityexpress-net:
    driver: bridge
```

Notas:

- `ECR_REGISTRY=<account>.dkr.ecr.<region>.amazonaws.com` definido en `.env` de la EC2.
- `IMAGE_TAG=<git-sha>` (D7). En `develop` puede usarse `latest`; en EC2 prod **nunca**.
- `NODE_OPTIONS=-r newrelic` (D9). El Dockerfile no se toca (sigue con `CMD`).

### 4.5 Convención de tags Docker (D7)

```
cityexpress-master:<git-sha-7>
cityexpress-connector:<git-sha-7>
```

- `:latest` SOLO se publica desde la rama `develop` (build manual o GH Action futuro).
- En la EC2 productiva, `IMAGE_TAG` siempre es un SHA explícito; nunca se hace `pull cityexpress-master:latest` en prod.

### 4.6 Verificación local mínima

```bash
docker compose -f docker-compose.yml up --build -d
curl -fsS http://localhost:3000/packages
docker compose logs master --tail=50
docker compose down
```

**Criterio de salida:** `docker compose up` levanta los 3 servicios sin errores en local; `.example.env` corregido; `docker-compose.prod.yml` revisado por owner.

---

## 5. ECR y deploy backend

### 5.1 Crear repos en ECR

```bash
aws ecr create-repository --repository-name cityexpress-master \
  --image-scanning-configuration scanOnPush=true --region us-east-1
aws ecr create-repository --repository-name cityexpress-connector \
  --image-scanning-configuration scanOnPush=true --region us-east-1
```

### 5.2 IAM mínimo

- **Dev (push desde laptop / GH Actions):** policy con `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:CompleteLayerUpload`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:PutImage` sobre los dos repos.
- **EC2 instance role:** policy con `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchCheckLayerAvailability` sobre los dos repos. Sin permisos de push.
- Adjuntar el role a la EC2 (no usar access keys en la VM).

### 5.3 Build, tag, push (comandos copy-paste)

```bash
export AWS_REGION=us-east-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REGISTRY=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
export GIT_SHA=$(git rev-parse --short=7 HEAD)

aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ECR_REGISTRY

docker build -t cityexpress-master:$GIT_SHA -f Dockerfile .
docker tag  cityexpress-master:$GIT_SHA $ECR_REGISTRY/cityexpress-master:$GIT_SHA
docker push $ECR_REGISTRY/cityexpress-master:$GIT_SHA

docker build -t cityexpress-connector:$GIT_SHA -f connector/Dockerfile connector
docker tag  cityexpress-connector:$GIT_SHA $ECR_REGISTRY/cityexpress-connector:$GIT_SHA
docker push $ECR_REGISTRY/cityexpress-connector:$GIT_SHA
```

### 5.4 EC2 — pull y arranque

```bash
ssh ubuntu@<elastic-ip>
sudo aws ecr get-login-password --region us-east-1 \
  | sudo docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
cd /opt/cityexpress
echo "IMAGE_TAG=<git-sha>" | sudo tee -a .env
sudo docker compose -f docker-compose.prod.yml --env-file .env pull
sudo docker compose -f docker-compose.prod.yml --env-file .env up -d
sudo docker compose -f docker-compose.prod.yml ps
curl -fsS https://api.andresitowan.com/packages -H "Authorization: Bearer <token>"
```

### 5.5 Rollback

- `docs/deploy.md` mantiene un log:
  ```
  ## Releases
  - 2026-05-02 a1b2c3d  primer prod    OK
  - 2026-05-03 e4f5g6h  fix CORS       OK
  ```
- Para rollback:
  ```bash
  sudo sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=a1b2c3d/' /opt/cityexpress/.env
  sudo docker compose -f docker-compose.prod.yml --env-file .env pull
  sudo docker compose -f docker-compose.prod.yml --env-file .env up -d
  ```
- Las imágenes en ECR no se borran durante E1.

**Criterio de salida:** las dos imágenes existen en ECR con tag SHA; la EC2 puede `docker pull` sin credenciales de usuario; rollback documentado.

---

## 6. EC2 + Elastic IP + DNS + HTTPS de origen

### 6.1 Budget Alerts antes de provisionar (D8)

> **Hacer ESTO antes de levantar la EC2.**

AWS Console → Billing → Budgets → Create budget:

- Tipo: Cost budget.
- Nombre: `cityexpress-e1`.
- Periodo: Monthly. Recurring.
- Monto: **USD 12.00**.
- Alertas:
  - 50% (USD 6) → email `guillocareym@gmail.com`.
  - 80% (USD 9.6) → mismo email.
  - 100% (USD 12) → mismo email + un compañero.

Verificar que llega el primer email de confirmación.

### 6.2 EC2

- AMI: Ubuntu 22.04 LTS (Free Tier).
- Tipo: `t3.micro` (Free Tier; `t2.micro` también vale).
- Storage: 20 GiB gp3.
- Security Group `cityexpress-ec2-sg`:
  - 22/tcp desde mi IP `<owner-ip>/32` (ajustable).
  - 80/tcp desde `0.0.0.0/0` (sólo redirect a 443 + ACME challenge).
  - 443/tcp desde `0.0.0.0/0`.
  - **NO** abrir 3000, 5432, ni cualquier puerto de DB / app.
- Key pair: nuevo `cityexpress-e1.pem`. **Nunca** committear.
- IAM instance profile: el role de pull ECR (§5.2).
- Bootstrap (user data o post-SSH):
  ```bash
  sudo apt update && sudo apt -y upgrade
  sudo apt -y install docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
  sudo usermod -aG docker ubuntu
  sudo systemctl enable --now docker
  sudo systemctl enable --now nginx
  ```

### 6.3 Elastic IP (D5)

```bash
aws ec2 allocate-address --domain vpc
aws ec2 associate-address --instance-id <i-...> --allocation-id <eipalloc-...>
```

Anotar la IP `<elastic-ip>`. Mientras la EIP esté **asociada** a una instancia en marcha, no genera costo.

### 6.4 DNS Route53

Hosted zone para `andresitowan.com` (TODO si aún no existe: crearla en Route53 y delegar nameservers en el registrar). Records:

| Name | Type | Value |
|---|---|---|
| `origin-api.andresitowan.com` | A | `<elastic-ip>` |
| `api.andresitowan.com` | A (alias) | API Gateway custom domain target (§7.2) |
| `app.andresitowan.com` | A (alias) | CloudFront distribution (§8) |

### 6.5 NGINX en host (D3 + D4)

Archivo: `/etc/nginx/sites-available/cityexpress.conf`. Validar el header `X-Origin-Auth` antes de proxiar.

```nginx
# /etc/nginx/sites-available/cityexpress.conf
map $http_x_origin_auth $origin_auth_ok {
    default                 0;
    "REPLACE_WITH_SECRET"   1;
}

server {
    listen 80;
    server_name origin-api.andresitowan.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name origin-api.andresitowan.com;

    ssl_certificate     /etc/letsencrypt/live/origin-api.andresitowan.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/origin-api.andresitowan.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Health publico (no requiere shared secret) - util para Route53/CloudWatch checks
    location = /healthz {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
    }

    # Todo lo demas exige el header inyectado por API Gateway
    location / {
        if ($origin_auth_ok = 0) { return 403; }

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cityexpress.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

> El secreto `REPLACE_WITH_SECRET` se genera con `openssl rand -hex 32`, **no** se commitea, y se reemplaza con `sed` durante el bootstrap. Mismo valor en API Gateway parameter mapping (§7.3).

### 6.6 Certbot

```bash
sudo certbot --nginx -d origin-api.andresitowan.com \
  --non-interactive --agree-tos -m guillocareym@gmail.com --redirect
sudo systemctl status certbot.timer    # systemd timer ya activo en Ubuntu
```

Cron de respaldo (RNF cumplido en E0; mantener):

```cron
0 3,15 * * * certbot renew --quiet --post-hook "systemctl reload nginx"
```

### 6.7 Smoke tests

```bash
# 403 sin secret
curl -i https://origin-api.andresitowan.com/packages
# 200 con secret
curl -i https://origin-api.andresitowan.com/packages -H "X-Origin-Auth: <secret>"
# health publico
curl -i https://origin-api.andresitowan.com/healthz
```

**Criterio de salida:** EIP asignada, DNS resuelto (`dig +short origin-api.andresitowan.com`), TLS verde, 403 sin secret, 200 con secret.

---

## 7. API Gateway HTTP API + Auth0

### 7.1 Crear HTTP API

AWS Console → API Gateway → Create API → **HTTP API** (no REST). Nombre: `cityexpress-api`.

### 7.2 Custom domain `api.andresitowan.com`

- ACM **en `us-east-1`** (D6): solicitar cert público para `api.andresitowan.com`, validar por DNS (Route53 record auto-creado).
- API Gateway → Custom domain names → Create:
  - Domain: `api.andresitowan.com`.
  - TLS: 1.2.
  - Cert: el de ACM.
- API mappings: API `cityexpress-api`, stage `$default`, path `(none)`.
- Route53: A-Alias de `api.andresitowan.com` → target del custom domain (target tipo `d-xxxxxx.execute-api.us-east-1.amazonaws.com` que entrega API Gateway).

### 7.3 Integración HTTP_PROXY + parameter mapping del shared secret (D4)

Integration:
- Type: HTTP.
- Method: ANY.
- Integration URL: `https://origin-api.andresitowan.com/{proxy}` con parámetro `proxy` mapeado a `request.path.proxy`.

Parameter mapping (donde se inyecta el header):
- En la consola: Integrations → seleccionar la integración → **Parameter mapping** → Request → Append → Header `X-Origin-Auth` → Value `<shared-secret>` (mismo string que `REPLACE_WITH_SECRET` en NGINX).
- En CLI / Terraform / SAM, se traduce a `parameter_mappings = { "append:header.X-Origin-Auth" = "<secret>" }` en la integración.

### 7.4 Rutas declaradas

| Method | Route key | Auth | Confirmado |
|---|---|---|---|
| GET | `/` | NONE | sí (health) |
| GET | `/packages` | JWT | sí (P3) |
| GET | `/packages/{id}` | JWT | sí (P3) |
| POST | `/packages/{id}/deliver` | JWT | TODO P3 |
| GET | `/routes` | JWT | TODO P3 (puede ser `/cities`) |
| ANY | `/{proxy+}` | NONE | sólo si P3 lo pide para no-listar todas las rutas; **no recomendado** porque rompe el filtro JWT |

### 7.5 CORS

API Gateway → CORS configuration:

```
Access-Control-Allow-Origin:
  - https://app.andresitowan.com
  - https://d<id>.cloudfront.net
  - http://localhost:5173
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Expose-Headers:
Access-Control-Max-Age: 600
Access-Control-Allow-Credentials: false
```

### 7.6 Auth0 setup

- Tenant Auth0 (region `us`).
- API: name `CityExpress API`, identifier `https://api.andresitowan.com`, signing alg `RS256`. Este identifier es el **audience**.
- Application: type `Single Page Application`, name `CityExpress SPA`. Allowed Callback / Logout / Web Origins: §2.3.
- En API Gateway HTTP API:
  - Authorizers → Create JWT authorizer:
    - Identity source: `$request.header.Authorization`.
    - Issuer URL: `https://<tenant>.us.auth0.com/`.
    - Audience: `https://api.andresitowan.com`.
- Asignación por ruta: en HTTP API se hace **por ruta**. Marcar en cada ruta protegida `Authorization → JWT → cityexpress-auth0`. Health (`GET /`) queda sin authorizer.

### 7.7 Pruebas

```bash
# 401 sin token
curl -i https://api.andresitowan.com/packages

# 200 con token
TOKEN=$(curl -s --request POST \
  --url https://<tenant>.us.auth0.com/oauth/token \
  --header 'content-type: application/json' \
  --data '{"client_id":"<machine>","client_secret":"<...>","audience":"https://api.andresitowan.com","grant_type":"client_credentials"}' \
  | jq -r .access_token)
curl -i https://api.andresitowan.com/packages -H "Authorization: Bearer $TOKEN"

# OPTIONS preflight
curl -i -X OPTIONS https://api.andresitowan.com/packages \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

**Criterio de salida:** las tres pruebas pasan; el header `X-Origin-Auth` se ve en los logs de NGINX cuando vienen del Gateway, y NO se ve cuando golpean directo a `origin-api.*` (entonces NGINX devuelve 403).

---

## 8. S3 + CloudFront para frontend

### 8.1 Bucket S3 + OAC

- Bucket `cityexpress-frontend-andresitowan` en `us-east-1`. **Block all public access ON.**
- Subir build (`pnpm run build` desde repo frontend) a `s3://cityexpress-frontend-andresitowan/`.
- CloudFront distribution:
  - Origin: el bucket S3, con **Origin Access Control** (OAC) generado y atado al bucket policy.
  - Default root object: `index.html`.
  - Custom error response: 403 → `/index.html` con HTTP 200 (SPA routing).
  - HTTPS only.

### 8.2 Cert ACM en `us-east-1` para CloudFront

- ACM `us-east-1` (CloudFront sólo lee de ahí): cert para `app.andresitowan.com`.
- En la distribution: alternate domain `app.andresitowan.com`, cert seleccionado.
- Route53 alias `app.andresitowan.com` → distribution.

### 8.3 Variables que P5 entrega a P4

Repetir el bloque §2.3 (`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE`, `VITE_API_BASE_URL`).

Build P4 ejecutado por P4 (este plan no escribe el script, sólo lo coordina):

```bash
# en repo CityExpress-frontendG15
VITE_API_BASE_URL=https://api.andresitowan.com \
VITE_AUTH0_DOMAIN=<tenant>.us.auth0.com \
VITE_AUTH0_CLIENT_ID=<spa-id> \
VITE_AUTH0_AUDIENCE=https://api.andresitowan.com \
pnpm run build
aws s3 sync dist/ s3://cityexpress-frontend-andresitowan/ --delete
aws cloudfront create-invalidation --distribution-id <id> --paths '/*'
```

### 8.4 CloudFront default domain como transitorio

Mientras `app.andresitowan.com` no existe, se prueba con `https://d<id>.cloudfront.net`. Agregarlo a:

- API Gateway CORS → `Access-Control-Allow-Origin`.
- Auth0 → SPA App → Allowed Callback / Logout / Web Origins.

Una vez verde el custom domain, **dejar** el cloudfront default por si se necesita debug; quitar en el polish final.

**Criterio de salida:** `app.andresitowan.com` carga el SPA con TLS verde; login Auth0 redirige y vuelve con token; `GET /packages` desde el SPA devuelve 200.

---

## 9. New Relic

### 9.1 Master vía `NODE_OPTIONS=-r newrelic` (D9)

Variables (ya en `docker-compose.prod.yml`):

```
NEW_RELIC_LICENSE_KEY=<license>
NEW_RELIC_APP_NAME=cityexpress-master
NEW_RELIC_NO_CONFIG_FILE=true
NODE_OPTIONS=-r newrelic
```

Para que esto funcione, `newrelic` debe estar instalado como dependencia del master.

> **TODO P3:** agregar `newrelic` a `dependencies` en `package.json` (`pnpm add newrelic`). El plan **no** edita el `package.json`. Si P3 no lo agrega, P5 abre un PR mínimo (`feat(deps): add newrelic`) — único cambio en código fuera de infra.

El Dockerfile **no** se modifica (D9).

### 9.2 Connector

Recomendación a P1: agregar `newrelic` y exportar `NEW_RELIC_APP_NAME=cityexpress-connector`. Si P1 no alcanza, queda como mejora post-E1.

### 9.3 New Relic Infrastructure Agent en EC2 (host)

Instalación oficial:

```bash
curl -Ls https://download.newrelic.com/install/newrelic-cli/scripts/install.sh | sudo bash
sudo NEW_RELIC_API_KEY=<key> NEW_RELIC_ACCOUNT_ID=<account> \
  /usr/local/bin/newrelic install -n infrastructure-agent-installer
```

Levanta `newrelic-infra` como servicio systemd. Aparece en New Relic → Infrastructure → Hosts.

### 9.4 Generar tráfico y evidencia

```bash
for i in $(seq 1 50); do
  curl -s https://api.andresitowan.com/packages -H "Authorization: Bearer $TOKEN" > /dev/null
done
```

Capturar screenshots:
- APM `cityexpress-master` con throughput y response time.
- Infrastructure host con CPU/RAM.
- Pegar links en `docs/monitoring.md`.

**Criterio de salida:** APM y host visibles en New Relic; evidencia en `docs/monitoring.md`.

---

## 10. Budget Alerts (D8)

Ya descritos en §6.1. Resumen para `docs/deploy.md`:

- Budget: `cityexpress-e1`, monthly, USD 12.
- Alertas: 50%, 80%, 100% → email `guillocareym@gmail.com` (+ co-owner en 100%).
- Verificación: capturar email recibido en la creación.

**Criterio de salida:** budget activo y alertas confirmadas por mail antes del primer deploy.

---

## 11. Resiliencia (RNF10)

### 11.1 `restart: unless-stopped`

Aplicado a los 3 servicios en `docker-compose.prod.yml` (§4.4). Test:

```bash
sudo docker kill cityexpress_master
sleep 5 && sudo docker ps | grep cityexpress_master   # debe estar Up < 1m
```

### 11.2 Fibonacci retry (TAREA P1)

P5 sólo verifica:
- Que el connector logea claramente cada retry y delay.
- Que no hay variables nuevas que falten en `docker-compose.prod.yml`.
- Que `restart: unless-stopped` cubra el caso de proceso muerto (no sólo error de conexión).

**Criterio de salida:** matar el master no detiene el stack; connector se recupera de un broker caído (test manual con P1).

---

## 12. Carpeta /docs

Archivos a crear (fuera de este plan; bajo aprobación posterior):

### 12.1 `docs/deploy.md`

Incluye: provisioning EC2, IAM, ECR, comandos de build/push, `docker-compose.prod.yml` referenciado, DNS Route53, NGINX shared secret (sin valor literal del secreto), Certbot, smoke tests, log de releases, rollback step-by-step.

### 12.2 `docs/monitoring.md`

New Relic APM links + screenshots, Infra agent, dashboards básicos, alert recomendado (avg response time > 1s 5min) en E2 o si hay tiempo.

### 12.3 `docs/auth-gateway.md`

Auth0 tenant setup, API audience, SPA app, JWT authorizer en HTTP API, mapping route → auth, CORS, troubleshooting (401 vs 403, OPTIONS).

### 12.4 `docs/prompts/2026-05-01-e1-infra-plan.md`

Generado en FASE 3 de este prompt.

### 12.5 `docs/architecture.md`

Ya existe (stub). P5 agrega únicamente el **diagrama de despliegue** y la mención al shared secret entre API Gateway y NGINX. **No** duplicar UML general (lo coordina el equipo en RDOC01).

### 12.6 RDOC01 (UML)

P5 entrega el diagrama de **despliegue** (nodes EC2, S3, CloudFront, API Gateway, ECR, Auth0, New Relic, broker) en `.drawio` + PNG. P1/P2/P3 contribuyen al diagrama de componentes.

**Criterio de salida:** los archivos existen, no contienen secretos, P3/P4 los pueden seguir paso a paso.

---

## 13. Orden de ejecución (jue 1 → dom 3 mayo) con buffer

> Hoy es jueves 2026-05-01 (feriado CL — productividad reducida).

### Jueves 01/05 (PM, ~3h)

1. Plan aprobado por owner.
2. Crear Budget alerts (§6.1).
3. Crear Hosted Zone Route53 si falta. Confirmar nameservers en registrar.
4. Auth0: tenant + API + SPA app + URLs (§7.6).
5. Pasar a P4 las variables Auth0 (§2.3) — P4 puede comenzar a montar `<Auth0Provider>`.
6. Arreglar `.example.env` (§4.2). Agregar `pnpm-lock.yaml` connector (coord. P1).

### Viernes 02/05 (full)

1. EC2 + EIP + SG + DNS A `origin-api.andresitowan.com` (§6.2-6.4).
2. Bootstrap host (Docker, NGINX, Certbot).
3. ECR repos + IAM role EC2 (§5.1-5.2).
4. Primer build/push manual `cityexpress-master:<sha>` y `cityexpress-connector:<sha>` (§5.3) **con código actual** para tener un release base.
5. `docker-compose.prod.yml` en `/opt/cityexpress` con `.env` (sin secretos en repo).
6. NGINX config + shared secret + Certbot (§6.5-6.6).
7. Smoke local: `curl -k https://origin-api.../packages` con/sin header.
8. API Gateway: HTTP API + custom domain `api.andresitowan.com` + ACM us-east-1 + parameter mapping shared secret (§7.1-7.3).
9. JWT authorizer Auth0 + asignación por ruta (§7.6).
10. Pruebas 401/200/OPTIONS (§7.7).

### Sábado 03/05 (full)

1. S3 + CloudFront + ACM us-east-1 + alias `app.andresitowan.com` (§8).
2. Coordinar con P4 el deploy del SPA al bucket. Agregar dominio CF default a CORS y Auth0.
3. New Relic APM master + Infra agent EC2 (§9). Generar tráfico, capturar evidencia.
4. Re-deploy con tag final una vez P1/P2/P3 cierren su PR a `develop`.
5. Smoke E2E end-to-end con login Auth0 desde el SPA.
6. Documentos `docs/deploy.md`, `docs/monitoring.md`, `docs/auth-gateway.md`.
7. RDOC01 — diagrama de despliegue.
8. Dump DB como mitigación (D12):
   ```bash
   sudo docker exec cityexpress_db pg_dump -U $POSTGRES_USER $POSTGRES_DB > /opt/cityexpress/backups/$(date +%F).sql
   ```

### Domingo 04/05 — buffer y demo prep

> Reservado **casi entero** para incidentes y prep de demo. **No** programar deploys nuevos salvo emergencia.

- Validar smoke completo desde 0 (login, listar paquetes, ver detalle, ruteo, auditoría).
- Verificar coverage de docs (`deploy.md`, `monitoring.md`, `auth-gateway.md`, prompts log).
- Grabar video demo (RF01-RF04 + monitoreo + budget alerts + auditoría).
- Entrega formal antes de 23:59 CLT.

**Criterio de salida:** stack arriba, login E2E ok, evidencia New Relic, rollback probado, video grabado.

---

## 14. Checklist PR `feature/backend-deploy → develop`

- [ ] `plan.md` (este archivo).
- [ ] `docs/prompts/2026-05-01-e1-infra-plan.md`.
- [ ] `.example.env` corregido (sin DATABASE_URL interpolada; con placeholders explícitos).
- [ ] `docker-compose.prod.yml` creado.
- [ ] `docker-compose.yml` con `restart: unless-stopped`.
- [ ] `connector/pnpm-lock.yaml` (coord. P1) y `connector/Dockerfile` con `--frozen-lockfile`.
- [ ] `docs/deploy.md`, `docs/monitoring.md`, `docs/auth-gateway.md`.
- [ ] Sin secretos en el árbol (`git secrets`/`grep -r 'license'`).
- [ ] PR template completo (Resumen, Cambios, Cómo funciona, Cómo se verificó, AI usage, Trazabilidad).
- [ ] 1 reviewer (a `develop`).

---

## 15. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Free Tier sobrepasado | Cuenta bloqueada | Budget USD 12 + alertas 50/80/100 (D8) creadas **antes** del provisioning |
| Cert ACM en región equivocada | API Gateway/CloudFront sin TLS | ACM **us-east-1** documentado (D6); incluir test `aws acm list-certificates --region us-east-1` antes del custom domain |
| `X-Origin-Auth` filtrado en NGINX por error | Origen expuesto | Test 403/200 (§6.7) en cada deploy; alerta New Relic recomendada (E2) |
| Auth0 free tier insuficiente | Login falla | Plan B Cognito (D1 lo descarta para E1; documentar como riesgo) |
| Pérdida de DB (volumen Docker, D12) | Pérdida de paquetes recibidos | `pg_dump` diario manual + dump antes de cada deploy mayor; E2 migra a RDS |
| `pnpm-lock.yaml` connector inexistente | Build no determinista | D10 obliga a generarlo antes de pushear imagen |
| API Gateway custom domain no propaga | URL caída | Crear el A-Alias temprano (jueves) y verificar `dig +short api.andresitowan.com` |
| New Relic license en repo | Fuga de secret | Sólo en `.env` de la EC2; placeholder en `.example.env`; agente Infra usa env var |
| Cambios en endpoints P3 last-minute | Rutas API Gateway incorrectas | Tabla §2.2 firmada por P3 antes de viernes 18:00 |
| `.pem` commiteado | Entrega no corregida | `.gitignore` cubre `*.pem`; review manual de `git status` antes de cada commit |
| Dominio CF default no whitelisteado | CORS/Auth0 fail | §8.4 explícito; recordatorio en sábado tras crear distribution |

---

## 16. Disclaimer Claude Code (D11)

Repetido para visibilidad: Claude Code se utilizó únicamente como asistente de
planificación documental. **No** se generó código de aplicación, **no** se
ejecutaron acciones en AWS, **no** se commitearon cambios. El log de la sesión vive
en `docs/prompts/2026-05-01-e1-infra-plan.md`. Esta E1 no incluye coverage 75%
agéntico — esa política aplicará desde E2 si el equipo lo decide.

---

## 17. Información pendiente (TODOs hacia el equipo)

> Cerrar todos antes del **viernes 02/05 18:00 CLT**.

| TODO | Owner | Pregunta concreta | Deadline |
|---|---|---|---|
| Código de ciudad G15 (HGW/COR/...) | P1 | ¿Cuál es nuestro `<code>`? | jue 01/05 22:00 |
| Credenciales y vhost RabbitMQ | P1 | URL `amqps://...`, vhost `/fulfillment`, exchange exacto | vie 02/05 12:00 |
| Nombre canal auditoría | P1 | ¿`central`? ¿binding key? | vie 02/05 12:00 |
| `pnpm-lock.yaml` en connector | P1 | ¿Lo generas tú o lo genero yo y abres PR? | vie 02/05 10:00 |
| Confirmación rutas API | P3 | ¿`POST /packages/{id}/deliver` o `PATCH`? ¿`/routes` vs `/cities`? | vie 02/05 14:00 |
| Agregar `newrelic` a deps master | P3 | ¿Lo agregas tú en tu PR de E1 o abro PR mínimo? | vie 02/05 14:00 |
| Frontend listo para probar Auth0 | P4 | ¿Cuándo está montado `<Auth0Provider>`? | sáb 03/05 12:00 |
| Dominio CloudFront default | P5 | (auto) anotar `d<id>.cloudfront.net` y agregarlo a CORS / Auth0 | sáb 03/05 |
| RDOC01 — qué partes del UML hace cada uno | Todos | Acordar: P5 = despliegue; P1/P2/P3 = componentes | vie 02/05 18:00 |
| Hosted Zone Route53 `andresitowan.com` | P5 | ¿Existe? Si no, crearla y delegar nameservers | jue 01/05 22:00 |

---

## 18. Referencias oficiales

- AWS HTTP API JWT authorizer — https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html
- AWS HTTP API parameter mapping — https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-parameter-mapping.html
- AWS HTTP API CORS — https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html
- AWS API Gateway custom domain — https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-custom-domains.html
- ACM regions — https://docs.aws.amazon.com/acm/latest/userguide/acm-regions.html
- AWS ECR push — https://docs.aws.amazon.com/AmazonECR/latest/userguide/docker-push-ecr-image.html
- EC2 instance role — https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2.html
- Route53 alias — https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-choosing-alias-non-alias.html
- AWS Budgets — https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/budgets-create.html
- Certbot nginx — https://eff-certbot.readthedocs.io/en/stable/using.html
- Auth0 React SDK — https://auth0.com/docs/quickstart/spa/react
- Auth0 API + audience — https://auth0.com/docs/get-started/apis
- New Relic Node agent — https://docs.newrelic.com/docs/apm/agents/nodejs-agent/installation-configuration/install-nodejs-agent/
- New Relic Infrastructure agent — https://docs.newrelic.com/docs/infrastructure/install-infrastructure-agent/linux-installation/install-infrastructure-monitoring-agent-linux/
- CloudFront + S3 OAC — https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html

---

## 19. Notas finales

- Este plan **no** ejecuta nada. No se han creado recursos en AWS, no se ha modificado código fuera de `plan.md` y `docs/prompts/`.
- Cualquier desvío durante la ejecución se registra como nuevo archivo en `docs/prompts/`.
- El owner aprueba (o pide cambios) antes de pasar a la fase de implementación.

---

## 20. Bitácora de ejecución — desviaciones y pendientes

> Sección viva. Se actualiza durante la ejecución (Fases 1–7) cada vez que algo se desvía del plan original o queda como pendiente. Revisar antes de la entrega.

### 20.1 Cambios respecto al `docker-compose.prod.yml` planeado en §4.4

| Variable / línea | Estado en prod hoy | Por qué | Cuándo restaurar |
|---|---|---|---|
| `NODE_OPTIONS=-r newrelic` (master) | **Comentada** | El paquete `newrelic` no está en `package.json` del master. Si Node arranca con `-r newrelic` sin la dep, crashea inmediatamente. | Cuando P3 (o P5 con PR mínimo) haga `pnpm add newrelic`, rebuild + push de `cityexpress-master:<nuevo-sha>`, descomentar las 4 líneas en `docker-compose.prod.yml` y `up -d`. |
| `NEW_RELIC_LICENSE_KEY/APP_NAME/NO_CONFIG_FILE` (master) | **Comentadas** | Mismo motivo. | Idem. |
| `RABBITMQ_EXCHANGE` (connector) | **Omitida** | El connector actual sigue siendo el código E0 (`observer.XX.q` + `package-received`). No usa exchange. | Cuando P1 mergee su PR de connector E1, agregar `RABBITMQ_EXCHANGE=fulfillment.x` al `.env` y al compose, rebuild + push. |
| `RABBITMQ_ROUTING_KEY` (connector) | **Omitida** | Idem. | Idem (`RABBITMQ_ROUTING_KEY=city.tk3`). |
| `RABBITMQ_AUDIT_QUEUE` (connector) | **Omitida** | Idem. | Idem (`RABBITMQ_AUDIT_QUEUE=central` — confirmar nombre con P1). |
| `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` (master) | **No incluidas en `.env`** | El master no valida JWT directamente; lo hace API Gateway. Solo serían necesarias si el master quisiera leer claims del token. | Solo si P3 implementa lógica que necesite leer el JWT en el master. Por ahora innecesarias. |

### 20.1.bis Fixes adicionales descubiertos al desplegar (Fase 6)

Tres bugs/inconsistencias salieron al levantar el master en EC2. Los tres ya están resueltos en la rama, pero se documentan aquí para que el equipo los entienda:

| Archivo | Cambio | Por qué |
|---|---|---|
| `Dockerfile` (stage runtime) | Agregado `COPY --from=builder /usr/src/app/prisma.config.ts ./` | Sin esta línea, el container no tenía el config en runtime y `prisma migrate deploy` fallaba con `The datasource.url property is required in your Prisma config file`. |
| `prisma.config.ts` | Reemplazado `env('DATABASE_URL')` (de `@prisma/config`) por `process.env.DATABASE_URL ?? '<placeholder>'` | La función `env()` de `@prisma/config` lanza `PrismaConfigEnvError` si la variable no está set en el momento de cargar el config. Esto rompía el `prisma generate` en build time (donde no hay DB). El placeholder solo se usa en build (donde no se conecta a DB); en runtime docker-compose inyecta el valor real. |
| `tsconfig.build.json` | Agregado `"prisma.config.ts"` a `exclude` | NestJS al hacer `nest build` veía `prisma.config.ts` fuera de `src/` y para mantener la estructura relativa anidaba la salida en `dist/src/main.js` en vez de `dist/main.js`. Excluirlo del build hace que `dist/main.js` quede en la raíz como espera `start:prod`. |

> Intento alternativo descartado: poner `url = env("DATABASE_URL")` en `prisma/schema.prisma`. Prisma 7 explícitamente prohíbe esto y obliga a usar `prisma.config.ts` (`error code P1012`).

### 20.2 Pendientes de otros miembros del equipo

| Pendiente | Owner | Bloqueante para |
|---|---|---|
| Reescribir `connector/index.js` para `city.tk3.q` + `package-transit` + ACK/NACK + retry Fibonacci | P1 | RNF10 (2pts), funcionalidad real del broker E1. Hoy el connector arranca pero no procesa mensajes E1. |
| Generar `connector/pnpm-lock.yaml` y cambiar Dockerfile a `pnpm install --frozen-lockfile` | P1 (o P5 con PR mínimo) | Builds reproducibles. No bloqueante para entregar, pero recomendado. |
| Agregar `newrelic` a `dependencies` en `package.json` del master | P3 (o P5 con PR mínimo) | RNF09 APM (5pts). Sin esto, no hay APM del master en New Relic. |
| Confirmar rutas finales API (`POST /packages/{id}/deliver`, `/routes` vs `/cities`) | P3 | Configuración de rutas en API Gateway HTTP API (Fase 7). Si P3 no confirma, P5 declara solo las 3 ya conocidas. |
| Lógica de ruteo (RF03), `maxHops`, `deliverNotBefore`, persistencia de pendientes | P2 | Funcionalidad del enunciado E1 (10pts RF03, 2pts RF04). |
| Frontend SPA con `<Auth0Provider>` montado y `getAccessTokenSilently` inyectado | P4 | Demo end-to-end con login real. P4 ya creó tenant Auth0 — pendiente que invite a P5. |
| Delegación de subdominio `cityexpress.andresitowan.com` (o equivalente) | Compañero dueño del dominio | Fase 7: NGINX TLS público + ACM cert + API Gateway custom domain. Sin esto el deploy solo es accesible vía Elastic IP cruda + SSH tunnel. |

### 20.3 Verificación pre-entrega (checklist final domingo)

Antes de cerrar la entrega, asegurar que **todos** los items de §20.1 fueron restaurados o están justificados como fuera-de-scope:

- [ ] `docker-compose.prod.yml` final tiene `NODE_OPTIONS=-r newrelic` activo y New Relic muestra al master.
- [ ] Connector procesa mensajes reales del broker (`docker logs cityexpress_connector` muestra ACKs).
- [ ] DNS resolviendo: `dig +short api.cityexpress.andresitowan.com` (o el dominio final acordado).
- [ ] Login Auth0 desde el SPA real funciona end-to-end.
- [ ] Budget alerts confirmadas por mail.
- [ ] Dump DB del estado pre-demo guardado en `/opt/cityexpress/backups/`.
- [ ] `docs/deploy.md`, `docs/monitoring.md`, `docs/auth-gateway.md` escritos.
- [ ] Commit y push de `feature/backend-deploy → develop` con `docker-compose.prod.yml`, `.example.env` corregido y `docs/`. Sin `.env` ni `.pem` en el árbol.
